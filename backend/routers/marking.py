from __future__ import annotations
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.service.database import get_db
from backend.service.models import (
    AttemptStatus as DBAttemptStatus,
    ChatSide,
    ExamAttempt,
    Station,
    StationAttempt,
    Rubric,
    RubricMark,
    Question,
    Answer,
    Feedback,
    User,
)
from backend.service.schemas import (
    RubricItemOut,
    RubricItemMarkIn,
    StationMarkIn,
    AttemptFinalizeIn,
    StationAnswerForMarking,
    StationChatForMarking,
    StationDetailForMarkingOut,
    SubmissionListItemOut,
    FinalizeOut,
    OkOut,
    PageMeta,
    PageOut,
)

router = APIRouter(
    prefix="/api/marking",
    tags=["Marking"],
)

def _safe_pydantic_dict(model_obj: Any) -> Dict[str, Any]:
    if hasattr(model_obj, "model_dump"):
        return model_obj.model_dump()
    return model_obj.dict()

def _normalize_answer(
    question: Question,
    answer: Answer | None,
) -> StationAnswerForMarking:
    choice_index = None
    value_text = None
    # ---- student's answer ----
    if answer is not None:
        if question.qtype.value == "mcq":
            choice_index = answer.choice_index
            try:
                options = question.options_json or []
                if isinstance(options, str):
                    # basic split if stored as a string
                    if "\n" in options:
                        options = [o.strip() for o in options.splitlines() if o.strip()]
                    else:
                        options = [o.strip() for o in options.split(",") if o.strip()]
                if (
                    choice_index is not None
                    and isinstance(options, list)
                    and 0 <= choice_index < len(options)
                ):
                    value_text = str(options[choice_index])
            except Exception:
                value_text = None
        else:
            value_text = answer.value_text
    # ---- correct / reference text for teacher ----
    correct_parts: List[str] = []
    try:
        if question.qtype.value == "mcq" and question.correct_index is not None:
            options = question.options_json or []
            if isinstance(options, str):
                if "\n" in options:
                    options = [o.strip() for o in options.splitlines() if o.strip()]
                else:
                    options = [o.strip() for o in options.split(",") if o.strip()]
            if (
                isinstance(options, list)
                and 0 <= question.correct_index < len(options)
            ):
                correct_parts.append(f"Correct: {options[question.correct_index]}")
    except Exception:
        pass
    if question.reference_text:
        correct_parts.append(f"Reference: {question.reference_text}")
    prompt = question.prompt
    if correct_parts:
        prompt = question.prompt + "\n\n" + " ".join(correct_parts)
    return StationAnswerForMarking(
        question_id=question.id,
        type=question.qtype.value,
        prompt=prompt,
        choice_index=choice_index,
        value_text=value_text,
    )

# Submissions list for a given exam (for teacher queue)
@router.get("/submissions", response_model=PageOut)
def list_submissions(
    exam_id: int = Query(..., description="Exam (circuit) ID"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base_q = (
        db.query(ExamAttempt, User)
        .join(User, ExamAttempt.user_id == User.id)
        .filter(ExamAttempt.exam_id == exam_id)
        .filter(
            ExamAttempt.status.in_(
                [DBAttemptStatus.submitted, DBAttemptStatus.graded]
            )
        )
        .order_by(ExamAttempt.submitted_at.desc())
    )
    total = base_q.count()
    offset = (page - 1) * size
    rows: List[tuple[ExamAttempt, User]] = base_q.offset(offset).limit(size).all()
    total_stations = (
        db.query(Station).filter(Station.exam_id == exam_id).count()
    ) or 1  # avoid /0
    items: List[Dict[str, Any]] = []
    for ea, user in rows:
        graded_count = (
            db.query(StationAttempt)
            .filter(
                StationAttempt.exam_attempt_id == ea.id,
                StationAttempt.status == DBAttemptStatus.graded,
            )
            .count()
        )
        progress_pct = (graded_count / total_stations) * 100.0

        out = SubmissionListItemOut(
            attempt_id=ea.id,
            user_id=user.id,
            student_name=user.full_name or user.username or user.email,
            submitted_at=ea.submitted_at or ea.started_at,
            progress_pct=progress_pct,
            status=ea.status.value,
        )
        items.append(_safe_pydantic_dict(out))

    meta = PageMeta(page=page, size=size, total=total)
    return PageOut(meta=meta, items=items)

# Station detail for marking
@router.get("/station/{station_attempt_id}", response_model=StationDetailForMarkingOut)
def get_station_detail(
    station_attempt_id: int,
    db: Session = Depends(get_db),
):
    sa: StationAttempt | None = (
        db.query(StationAttempt)
        .filter(StationAttempt.id == station_attempt_id)
        .join(Station)
        .first()
    )
    if sa is None:
        raise HTTPException(status_code=404, detail="Station attempt not found")
    station: Station = sa.station
    # ---- answers ----
    answers_by_q: Dict[int, Answer] = {a.question_id: a for a in sa.answers}
    answer_items: List[StationAnswerForMarking] = []
    for q in sorted(station.questions, key=lambda x: x.display_order):
        answer_items.append(_normalize_answer(q, answers_by_q.get(q.id)))
    # ---- chat ----
    msg_items: List[StationChatForMarking] = []
    for m in sa.messages:
        msg_items.append(
            StationChatForMarking(
                side="user" if m.side == ChatSide.user else "ai",
                text=m.content,
                created_at=m.created_at,
            )
        )
    # ---- rubrics ----
    rubric_rows: List[Rubric] = (
        db.query(Rubric)
        .filter(Rubric.station_id == station.id)
        .order_by(Rubric.display_order)
        .all()
    )
    rubric_items: List[RubricItemOut] = [
        RubricItemOut(
            id=r.id,
            station_id=r.station_id,
            criterion=r.title,
            max_score=float(r.max_points),
            order_index=r.display_order,
        )
        for r in rubric_rows
    ]
    # ---- existing rubric marks ----
    existing_marks: List[RubricItemMarkIn] = [
        RubricItemMarkIn(
            rubric_id=m.rubric_id,
            score=float(m.points or 0),
            comment=None,
        )
        for m in sa.rubric_marks
    ]
    total_score = sum((m.points or 0) for m in sa.rubric_marks)
    return StationDetailForMarkingOut(
        station_attempt_id=sa.id,
        station_id=station.id,
        position=station.position,
        answers=answer_items,
        messages=msg_items,
        rubrics=rubric_items,
        existing_marks=existing_marks or None,
        score=float(total_score) if total_score is not None else None,
        status=sa.status.value,
    )

# Save rubric marks for a station attempt
@router.post("/station/marks", response_model=OkOut)
def save_station_marks(
    payload: StationMarkIn,
    db: Session = Depends(get_db),
):
    sa: StationAttempt | None = (
        db.query(StationAttempt)
        .filter(StationAttempt.id == payload.station_attempt_id)
        .first()
    )
    if sa is None:
        raise HTTPException(status_code=404, detail="Station attempt not found")
    # All rubrics for this station
    station_rubrics: Dict[int, Rubric] = {
        r.id: r
        for r in db.query(Rubric).filter(Rubric.station_id == sa.station_id).all()
    }
    if not station_rubrics:
        raise HTTPException(
            status_code=400,
            detail="No rubrics defined for this station.",
        )
    # Existing marks indexed by rubric_id (unique per station_attempt_id+rubric_id)
    existing_by_rubric: Dict[int, RubricMark] = {
        m.rubric_id: m for m in sa.rubric_marks
    }
    for item in payload.items:
        if item.rubric_id not in station_rubrics:
            raise HTTPException(
                status_code=400,
                detail=f"Rubric {item.rubric_id} does not belong to this station.",
            )
        mark = existing_by_rubric.get(item.rubric_id)
        if mark is None:
            mark = RubricMark(
                station_attempt_id=sa.id,
                rubric_id=item.rubric_id,
            )
            db.add(mark)
        mark.points = int(item.score)
        mark.met = item.score > 0
    db.commit()
    return OkOut(ok=True)

# Finalize a station attempt (grade + recompute exam total)
@router.post("/station/finalize", response_model=FinalizeOut)
def finalize_station(
    payload: AttemptFinalizeIn,
    db: Session = Depends(get_db),
):
    sa: StationAttempt | None = (
        db.query(StationAttempt)
        .filter(StationAttempt.id == payload.attempt_id)
        .first()
    )
    if sa is None:
        raise HTTPException(status_code=404, detail="Station attempt not found")
    # Station score = sum of its rubric marks
    station_score = sum((m.points or 0) for m in sa.rubric_marks)
    sa.status = DBAttemptStatus.graded
    # Recompute total exam score
    ea: ExamAttempt = sa.exam_attempt
    total = 0
    for other_sa in ea.station_attempts:
        total += sum((m.points or 0) for m in other_sa.rubric_marks)
    ea.total_score = float(total)
    db.commit()
    db.refresh(ea)
    return FinalizeOut(ok=True, total_score=float(station_score))

# Teacher feedback for a station attempt
@router.post("/station/{station_attempt_id}/feedback", response_model=OkOut)
def set_station_feedback(
    station_attempt_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    teacher_id = payload.get("teacher_id")
    text = (payload.get("text") or "").strip()

    if not isinstance(teacher_id, int):
        raise HTTPException(status_code=400, detail="teacher_id is required")
    if not text:
        raise HTTPException(status_code=400, detail="feedback text is required")
    sa: StationAttempt | None = (
        db.query(StationAttempt)
        .filter(StationAttempt.id == station_attempt_id)
        .first()
    )
    if sa is None:
        raise HTTPException(status_code=404, detail="Station attempt not found")
    fb: Feedback | None = (
        db.query(Feedback)
        .filter(
            Feedback.station_attempt_id == station_attempt_id,
            Feedback.teacher_id == teacher_id,
        )
        .first()
    )
    if fb is None:
        fb = Feedback(
            station_attempt_id=station_attempt_id,
            teacher_id=teacher_id,
            text=text,
        )
        db.add(fb)
    else:
        fb.text = text
    db.commit()
    return OkOut(ok=True)
