"""Practice-by-question-type — focused drills on a single sub_skill.

Pulls questions of one sub_skill from across all tests, grades them instantly
with explanations, records a lightweight PracticeSession (not a full exam
attempt) and feeds missed questions into the spaced review queue.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service.sanitize import OptionalSanitized, Sanitized
from backend.service import models, scoping, storage
from backend.service.auth_deps import get_current_user
from backend.service.subskills import SUB_SKILLS, SUB_SKILL_LABELS, heatmap
from backend.service.review_sched import enqueue_wrong

router = APIRouter(prefix="/api/practice", tags=["practice"])

DEFAULT_N = 10


def _norm(t: Optional[str]) -> str:
    return " ".join((t or "").strip().lower().split())


def _question_out(q: models.Question) -> dict:
    station = q.station
    return {
        "id": q.id,
        "qtype": q.qtype.value,
        "qformat": q.qformat,
        "select_count": q.select_count if q.qformat == "multi_select" else None,
        "prompt": q.prompt,
        "options": q.options_json or [] if q.qtype.value == "mcq" else [],
        "sub_skill": q.sub_skill,
        "skill": station.skill if station else None,
        "passage_md": station.case.body_md if station and station.case else "",
        "audio_url": storage.sign_media_url(station.audio_url) if station else None,
        "image_url": storage.sign_media_url(station.image_url) if station else None,
    }


@router.get("/skills")
def practice_skills(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Every sub_skill with the student's accuracy and how many questions exist."""
    acc = {h["sub_skill"]: h for h in heatmap(db, [user.id])}

    counts_q = (
        db.query(models.Question.sub_skill, func.count())
        .filter(
            models.Question.sub_skill.in_(SUB_SKILLS),
            models.Question.qtype.in_([models.QuestionType.mcq, models.QuestionType.short]),
        )
    )
    if scoping.is_student(user):
        counts_q = (
            counts_q.join(models.Station, models.Question.station_id == models.Station.id)
            .join(models.Exam, models.Station.exam_id == models.Exam.id)
            .filter(models.Exam.class_id.in_(scoping.enrolled_class_ids(db, user.id)))
        )
    counts = dict(
        counts_q
        .group_by(models.Question.sub_skill)
        .all()
    )

    out = []
    for sk in SUB_SKILLS:
        a = acc.get(sk, {})
        out.append({
            "sub_skill": sk,
            "label": SUB_SKILL_LABELS.get(sk, sk),
            "accuracy": a.get("accuracy"),
            "attempted": a.get("attempted", 0),
            "available": int(counts.get(sk, 0)),
        })
    return out


@router.get("/{sub_skill}")
def practice_questions(
    sub_skill: str,
    n: int = DEFAULT_N,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if sub_skill not in SUB_SKILLS:
        raise HTTPException(404, "Unknown question type.")
    n = max(1, min(n, 30))
    q = (
        db.query(models.Question)
        .filter(
            models.Question.sub_skill == sub_skill,
            models.Question.qtype.in_([models.QuestionType.mcq, models.QuestionType.short]),
        )
    )
    if scoping.is_student(user):
        # Students drill only questions from tests assigned to their classes.
        q = (
            q.join(models.Station, models.Question.station_id == models.Station.id)
            .join(models.Exam, models.Station.exam_id == models.Exam.id)
            .filter(models.Exam.class_id.in_(scoping.enrolled_class_ids(db, user.id)))
        )
    questions = q.order_by(func.random()).limit(n).all()
    if not questions:
        raise HTTPException(404, "No questions available for this type yet.")
    return {
        "sub_skill": sub_skill,
        "label": SUB_SKILL_LABELS.get(sub_skill, sub_skill),
        "questions": [_question_out(q) for q in questions],
    }


class PracticeAnswer(BaseModel):
    question_id: int
    choice_index: Optional[int] = None
    value_text: OptionalSanitized(5000) = None


class PracticeSubmitIn(BaseModel):
    answers: List[PracticeAnswer] = []


@router.post("/{sub_skill}/submit")
def practice_submit(
    sub_skill: str,
    payload: PracticeSubmitIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if sub_skill not in SUB_SKILLS:
        raise HTTPException(404, "Unknown question type.")

    q_ids = [a.question_id for a in payload.answers]
    questions = {
        q.id: q
        for q in db.query(models.Question).filter(models.Question.id.in_(q_ids)).all()
    } if q_ids else {}

    results = []
    correct = 0
    for a in payload.answers:
        q = questions.get(a.question_id)
        if not q:
            continue
        opts = q.options_json or []
        if q.qformat == "multi_select":
            import json as _json
            try:
                picked = _json.loads(a.value_text or "[]")
                picked = [int(i) for i in picked] if isinstance(picked, list) else []
            except (ValueError, TypeError):
                picked = []
            correct_set = {int(i) for i in (q.correct_indices or [])}
            ok = bool(correct_set) and set(picked) == correct_set
            your_answer = ", ".join(opts[i] for i in sorted(picked) if 0 <= i < len(opts)) or None
            correct_answer = ", ".join(opts[i] for i in sorted(correct_set) if 0 <= i < len(opts)) or None
        elif q.qtype.value == "mcq":
            ok = a.choice_index is not None and a.choice_index == q.correct_index
            your_answer = opts[a.choice_index] if (a.choice_index is not None and a.choice_index < len(opts)) else None
            correct_answer = opts[q.correct_index] if (q.correct_index is not None and q.correct_index < len(opts)) else None
        else:  # short
            accept = {_norm(x) for x in (q.accept_answers or [])}
            ok = _norm(a.value_text) in accept
            your_answer = a.value_text
            correct_answer = ", ".join(q.accept_answers or []) or None

        if ok:
            correct += 1
        else:
            enqueue_wrong(db, user.id, q.id)

        results.append({
            "question_id": q.id,
            "is_correct": bool(ok),
            "your_answer": your_answer,
            "correct_answer": correct_answer,
            "explanation": q.explanation,
            "support_sentences": q.support_sentences or [],
            "paraphrases": q.paraphrases or [],
        })

    total = len(results)
    session = models.PracticeSession(
        user_id=user.id, sub_skill=sub_skill, total=total, correct=correct,
    )
    db.add(session)
    db.commit()

    return {"sub_skill": sub_skill, "total": total, "correct": correct, "results": results}
