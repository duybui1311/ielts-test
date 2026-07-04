from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload, selectinload

from backend.service.database import get_db
from backend.service import models, scoping, storage
from backend.service.autograde import autograde_exam_attempt
from backend.service.auth_deps import get_current_user

router = APIRouter(tags=["student"])


def _owns_or_teacher(attempt: models.ExamAttempt, user: models.User) -> bool:
    return attempt.user_id == user.id or user.role in (models.UserRole.teacher, models.UserRole.admin)


# Answers are still accepted this long after the clock hits zero, so a save
# that was in flight when the frontend auto-submitted isn't lost to latency.
ANSWER_GRACE_SECONDS = 30


def _seconds_left(attempt: models.ExamAttempt, exam: models.Exam) -> Optional[int]:
    """Seconds remaining on the attempt's server-side clock (negative when past
    the limit). Anchored to ExamAttempt.started_at, so refreshing the page can't
    restart the timer. None = no time limit to enforce."""
    if not exam or not exam.time_limit_min:
        return None
    started = attempt.started_at
    if started is None:  # legacy rows before started_at existed
        return None
    if started.tzinfo is None:  # column is stored as naive UTC
        started = started.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    return int(exam.time_limit_min * 60 - elapsed)


def _build_content(exam, attempt_id, db):
    """Sections with questions — correct answers stripped out."""
    sa_map = {
        sa.station_id: sa.id
        for sa in db.query(models.StationAttempt)
        .filter(models.StationAttempt.exam_attempt_id == attempt_id)
        .all()
    }
    # One round-trip for every saved answer of the attempt (not one per station —
    # each query is a full round-trip to the remote DB).
    saved = {}
    if sa_map:
        for ans in db.query(models.Answer).filter(
            models.Answer.station_attempt_id.in_(list(sa_map.values()))
        ).all():
            saved[ans.question_id] = {
                "choice_index": ans.choice_index,
                "value_text": ans.value_text,
            }
    sections = []
    next_num = 1  # official IELTS numbering, continuous across sections (1–40)
    for station in sorted(exam.stations, key=lambda s: s.position):
        sa_id = sa_map.get(station.id)
        questions = []
        for q in sorted(station.questions, key=lambda x: x.display_order):
            entry = {
                "id": q.id,
                "qtype": q.qtype.value,
                "qformat": q.qformat,
                "prompt": q.prompt,
                "display_order": q.display_order,
                "num_start": next_num,
                "num_end": next_num + q.marks - 1,
                "sub_skill": q.sub_skill,
                "task_instructions": q.task_instructions,
                "saved_answer": saved.get(q.id),
            }
            next_num += q.marks
            if q.qtype.value == "mcq":
                entry["options"] = q.options_json or []
                if q.qformat == "multi_select":
                    entry["select_count"] = q.select_count or len(q.correct_indices or []) or 2
            questions.append(entry)
        sections.append({
            "station_id": station.id,
            "station_attempt_id": sa_id,
            "position": station.position,
            "skill": station.skill,
            "title": station.case.title,
            "passage_md": station.case.body_md,
            "audio_url": storage.sign_media_url(station.audio_url),
            "image_url": storage.sign_media_url(station.image_url),
            "questions": questions,
        })
    return sections


# ── List exams ──────────────────────────────────────────────────────────────

@router.get("/api/exams")
def list_exams(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    q = db.query(models.Exam)
    if scoping.is_student(user):
        # Students only see tests assigned to classes they joined.
        q = q.filter(models.Exam.class_id.in_(scoping.enrolled_class_ids(db, user.id)))
    exams = (
        q
        # Eager-load stations + questions in two batched queries instead of
        # lazy-loading per exam/station (each lazy load is a full round-trip
        # to the remote DB — this endpoint was the slow part of the test list).
        .options(selectinload(models.Exam.stations).selectinload(models.Station.questions))
        .order_by(models.Exam.created_at.desc())
        .all()
    )
    result = []
    for exam in exams:
        # Count official question numbers, not DB rows (multi-select spans N).
        q_count = sum(q.marks for st in exam.stations for q in st.questions)
        skills = list({st.skill for st in exam.stations if st.skill})
        result.append({
            "id": exam.id,
            "name": exam.name,
            "is_mock": exam.exam_type == models.ExamType.exam,
            "skills": skills,
            "time_limit_min": exam.time_limit_min,
            "total_questions": q_count,
            "difficulty": exam.difficulty.value,
        })
    return result


# ── Start / resume attempt ──────────────────────────────────────────────────

class StartIn(BaseModel):
    exam_id: int
    user_id: Optional[int] = None      # ignored — identity comes from the token


@router.post("/api/attempts/start")
def start_attempt(
    payload: StartIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    exam = (
        db.query(models.Exam)
        .options(
            selectinload(models.Exam.stations).selectinload(models.Station.questions),
            selectinload(models.Exam.stations).joinedload(models.Station.case),
        )
        .filter(models.Exam.id == payload.exam_id)
        .first()
    )
    if not exam:
        raise HTTPException(404, "Exam not found")
    if scoping.is_student(user) and exam.class_id not in scoping.enrolled_class_ids(db, user.id):
        raise HTTPException(403, "Join this test's class first (ask your teacher for the class code).")

    existing = (
        db.query(models.ExamAttempt)
        .filter(
            models.ExamAttempt.exam_id == payload.exam_id,
            models.ExamAttempt.user_id == user.id,
        )
        .first()
    )
    if existing:
        attempt = existing
    else:
        attempt = models.ExamAttempt(
            exam_id=payload.exam_id,
            user_id=user.id,
            status=models.AttemptStatus.draft,
        )
        db.add(attempt)
        db.flush()
        for station in sorted(exam.stations, key=lambda s: s.position):
            db.add(models.StationAttempt(
                exam_attempt_id=attempt.id,
                station_id=station.id,
                status=models.AttemptStatus.draft,
            ))
        db.commit()

    content = _build_content(exam, attempt.id, db)
    left = _seconds_left(attempt, exam)
    return {
        "attempt_id": attempt.id,
        "exam_id": exam.id,
        "exam_name": exam.name,
        "time_limit_min": exam.time_limit_min,
        # Server-anchored clock: the frontend counts down from this, so a
        # refresh resumes the real remaining time instead of restarting it.
        "seconds_left": max(0, left) if left is not None else None,
        "status": attempt.status.value,
        "sections": content,
    }


# ── Fetch content for an existing attempt (page refresh) ───────────────────

@router.get("/api/attempts/{attempt_id}/content")
def get_content(
    attempt_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    attempt = db.query(models.ExamAttempt).filter(
        models.ExamAttempt.id == attempt_id
    ).first()
    if not attempt:
        raise HTTPException(404, "Attempt not found")
    if not _owns_or_teacher(attempt, user):
        raise HTTPException(403, "Not allowed.")
    exam = (
        db.query(models.Exam)
        .options(
            selectinload(models.Exam.stations).selectinload(models.Station.questions),
            selectinload(models.Exam.stations).joinedload(models.Station.case),
        )
        .filter(models.Exam.id == attempt.exam_id)
        .first()
    )
    content = _build_content(exam, attempt.id, db)
    left = _seconds_left(attempt, exam)
    return {
        "attempt_id": attempt.id,
        "exam_id": exam.id,
        "exam_name": exam.name,
        "time_limit_min": exam.time_limit_min,
        "seconds_left": max(0, left) if left is not None else None,
        "status": attempt.status.value,
        "sections": content,
    }


# ── Save / upsert one answer ────────────────────────────────────────────────

class AnswerIn(BaseModel):
    question_id: int
    choice_index: Optional[int] = None
    value_text: Optional[str] = None


@router.post("/api/attempts/{attempt_id}/answer")
def save_answer(
    attempt_id: int,
    payload: AnswerIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ea = db.query(models.ExamAttempt).filter(models.ExamAttempt.id == attempt_id).first()
    if not ea:
        raise HTTPException(404, "Attempt not found")
    if not _owns_or_teacher(ea, user):
        raise HTTPException(403, "Not allowed.")

    # Server-side timer enforcement: a submitted/graded attempt, or one whose
    # clock ran out (plus a small grace for in-flight saves), takes no more
    # answers — the client-side countdown alone is trivially bypassed.
    if ea.status != models.AttemptStatus.draft:
        raise HTTPException(409, "This test was already submitted.")
    exam = db.query(models.Exam).filter(models.Exam.id == ea.exam_id).first()
    left = _seconds_left(ea, exam)
    if left is not None and left < -ANSWER_GRACE_SECONDS:
        raise HTTPException(409, "Time is up — this test no longer accepts answers.")

    q = db.query(models.Question).filter(
        models.Question.id == payload.question_id
    ).first()
    if not q:
        raise HTTPException(404, "Question not found")

    sa = (
        db.query(models.StationAttempt)
        .filter(
            models.StationAttempt.exam_attempt_id == attempt_id,
            models.StationAttempt.station_id == q.station_id,
        )
        .first()
    )
    if not sa:
        raise HTTPException(404, "Station attempt not found")

    ans = (
        db.query(models.Answer)
        .filter(
            models.Answer.station_attempt_id == sa.id,
            models.Answer.question_id == payload.question_id,
        )
        .first()
    )
    if ans:
        ans.choice_index = payload.choice_index
        ans.value_text = payload.value_text
    else:
        ans = models.Answer(
            station_attempt_id=sa.id,
            question_id=payload.question_id,
            choice_index=payload.choice_index,
            value_text=payload.value_text,
        )
        db.add(ans)
    db.commit()
    return {"ok": True}


# ── Submit + autograde ──────────────────────────────────────────────────────

@router.post("/api/attempts/{attempt_id}/submit")
def submit_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ea = db.query(models.ExamAttempt).filter(
        models.ExamAttempt.id == attempt_id
    ).first()
    if not ea:
        raise HTTPException(404, "Attempt not found")
    if not _owns_or_teacher(ea, user):
        raise HTTPException(403, "Not allowed.")

    if ea.status == models.AttemptStatus.graded:
        return {
            "attempt_id": attempt_id,
            "overall_band": ea.overall_band,
            "status": ea.status.value,
        }

    now = datetime.now(timezone.utc)
    ea.status = models.AttemptStatus.submitted
    ea.submitted_at = now
    for sa in ea.station_attempts:
        if sa.status != models.AttemptStatus.graded:
            sa.status = models.AttemptStatus.submitted
            sa.submitted_at = now
    db.commit()

    result = autograde_exam_attempt(db, attempt_id)
    return {
        "attempt_id": attempt_id,
        "overall_band": result.overall_band,
        "status": result.status.value,
    }


# ── Results ─────────────────────────────────────────────────────────────────

@router.get("/api/attempts/{attempt_id}/results")
def get_results(
    attempt_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    ea = (
        db.query(models.ExamAttempt)
        .options(
            selectinload(models.ExamAttempt.station_attempts)
            .joinedload(models.StationAttempt.station)
            .selectinload(models.Station.questions),
            selectinload(models.ExamAttempt.station_attempts)
            .joinedload(models.StationAttempt.station)
            .joinedload(models.Station.case),
        )
        .filter(models.ExamAttempt.id == attempt_id)
        .first()
    )
    if not ea:
        raise HTTPException(404, "Attempt not found")
    if not _owns_or_teacher(ea, user):
        raise HTTPException(403, "Not allowed.")

    # All answers of the attempt in one query — one per question was the main
    # reason the results page loaded slowly against the remote DB.
    ans_map = {}
    sa_ids = [sa.id for sa in ea.station_attempts]
    if sa_ids:
        for a in db.query(models.Answer).filter(
            models.Answer.station_attempt_id.in_(sa_ids)
        ).all():
            ans_map[(a.station_attempt_id, a.question_id)] = a

    sections = []
    next_num = 1  # official IELTS numbering, continuous across sections (1–40)
    for sa in sorted(ea.station_attempts, key=lambda x: x.station.position):
        station = sa.station
        questions_out = []
        section_marks = 0
        for q in sorted(station.questions, key=lambda x: x.display_order):
            ans = ans_map.get((sa.id, q.id))
            opts = q.options_json or []

            def _opts_at(indices):
                out = []
                for i in indices or []:
                    try:
                        out.append(str(opts[int(i)]))
                    except (ValueError, TypeError, IndexError):
                        pass
                return ", ".join(out) or None

            if q.qformat == "multi_select":
                import json as _json
                try:
                    picked = _json.loads(ans.value_text or "[]") if ans else []
                except (ValueError, TypeError):
                    picked = []
                student_answer = _opts_at(picked if isinstance(picked, list) else [])
            elif ans and ans.choice_index is not None:
                student_answer = (
                    opts[ans.choice_index] if ans.choice_index < len(opts)
                    else str(ans.choice_index)
                )
            elif ans:
                student_answer = ans.value_text
            else:
                student_answer = None

            if q.qformat == "multi_select":
                correct_answer = _opts_at(q.correct_indices)
            elif q.qtype.value == "mcq" and q.correct_index is not None:
                correct_answer = (
                    opts[q.correct_index] if q.correct_index < len(opts) else None
                )
            elif q.qtype.value == "short":
                accepts = q.accept_answers or []
                correct_answer = ", ".join(accepts) if accepts else None
            else:
                correct_answer = None

            questions_out.append({
                "id": q.id,
                "qtype": q.qtype.value,
                "qformat": q.qformat,
                "prompt": q.prompt,
                "num_start": next_num,
                "num_end": next_num + q.marks - 1,
                "sub_skill": q.sub_skill,
                "task_instructions": q.task_instructions,
                "options": opts,
                "student_answer": student_answer,
                "correct_answer": correct_answer,
                "is_auto_correct": ans.is_auto_correct if ans else None,
                "auto_score": ans.auto_score if ans else None,
                "marks": q.marks,
                "explanation": q.explanation,
                "support_sentences": q.support_sentences or [],
                "paraphrases": q.paraphrases or [],
            })
            next_num += q.marks
            section_marks += q.marks

        sections.append({
            "station_id": sa.station_id,
            "skill": station.skill,
            "title": station.case.title,
            "passage_md": station.case.body_md,
            "raw_score": sa.raw_score,
            "total_marks": section_marks,
            "band": sa.band,
            "questions": questions_out,
        })

    error_tags = (
        db.query(models.ErrorTag)
        .filter(
            models.ErrorTag.user_id == ea.user_id,
            models.ErrorTag.exam_id == ea.exam_id,
        )
        .all()
    )
    weakness_map: dict[str, int] = {}
    for tag in error_tags:
        key = tag.sub_skill or tag.skill or "unknown"
        weakness_map[key] = weakness_map.get(key, 0) + 1

    return {
        "attempt_id": attempt_id,
        "is_mock": bool(ea.exam and ea.exam.exam_type == models.ExamType.exam),
        "exam_name": ea.exam.name if ea.exam else None,
        "overall_band": ea.overall_band,
        "status": ea.status.value,
        "sections": sections,
        "weakness_chart": [
            {"name": k, "misses": v}
            for k, v in sorted(weakness_map.items(), key=lambda x: -x[1])
        ],
    }


# ── Join a class with the teacher's share code ──────────────────────────────

class JoinClassIn(BaseModel):
    code: str


@router.post("/api/classes/join")
def join_class(
    payload: JoinClassIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(400, "Enter the class code your teacher shared.")
    klass = db.query(models.Class).filter(models.Class.join_code == code).first()
    if not klass:
        raise HTTPException(404, "No class with that code — check it with your teacher.")
    existing = (
        db.query(models.ClassEnrolment)
        .filter(
            models.ClassEnrolment.class_id == klass.id,
            models.ClassEnrolment.user_id == user.id,
        )
        .first()
    )
    if not existing:
        db.add(models.ClassEnrolment(class_id=klass.id, user_id=user.id))
        db.commit()
    return {"ok": True, "class_id": klass.id, "class_name": klass.name}
