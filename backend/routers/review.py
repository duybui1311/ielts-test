"""Teacher review queue — grade pending Writing and Speaking submissions.

Identity comes from the verified JWT; teacher/admin role required for grading.
"""
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import get_current_user, require_role
from backend.service.review_sched import apply_result

router = APIRouter(prefix="/api/review", tags=["review"])

_teacher = require_role("teacher", "admin")


class GradeIn(BaseModel):
    band: float
    feedback: str = ""
    ai_result: Optional[dict] = None      # optional edited AI criterion breakdown to persist
    share_ai: bool = True                 # if False, the AI breakdown is not shown to the student


@router.get("/queue")
def queue(
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    names = {
        u.id: (u.full_name or u.username or u.email or f"User {u.id}")
        for u in db.query(models.User).all()
    }

    # Queue = not-yet-approved work: fresh submissions plus AI drafts awaiting sign-off.
    pending = ["submitted", "ai_graded"]
    writing = (
        db.query(models.WritingSubmission)
        .filter(models.WritingSubmission.status.in_(pending))
        .order_by(models.WritingSubmission.created_at.asc())
        .all()
    )
    speaking = (
        db.query(models.SpeakingSubmission)
        .filter(models.SpeakingSubmission.status.in_(pending))
        .order_by(models.SpeakingSubmission.created_at.asc())
        .all()
    )

    items = []
    for s in writing:
        items.append({
            "kind": "writing", "id": s.id,
            "student": names.get(s.user_id, f"User {s.user_id}"),
            "task_title": s.task.title if s.task else "Writing task",
            "task_type": s.task.task_type if s.task else None,
            "task_prompt": s.task.prompt_md if s.task else None,
            "word_count": s.word_count,
            "response_text": s.response_text,
            "status": s.status,
            "band": s.band,
            "ai_result": s.ai_result,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })
    for s in speaking:
        items.append({
            "kind": "speaking", "id": s.id,
            "student": names.get(s.user_id, f"User {s.user_id}"),
            "task_title": s.task.title if s.task else "Speaking task",
            "part": s.task.part if s.task else None,
            "task_prompt": s.task.prompt_md if s.task else None,
            "transcript": s.transcript,
            "audio_url": s.audio_url,
            "status": s.status,
            "band": s.band,
            "ai_result": s.ai_result,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    items.sort(key=lambda x: x["created_at"] or "")
    return items


@router.post("/writing/{submission_id}")
def grade_writing(
    submission_id: int,
    payload: GradeIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    uid = user.id
    s = db.query(models.WritingSubmission).filter(models.WritingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    s.band = payload.band
    s.feedback = payload.feedback
    if not payload.share_ai:
        s.ai_result = None                # teacher chose not to share the AI breakdown
    elif payload.ai_result is not None:
        s.ai_result = payload.ai_result
    s.status = "reviewed"
    s.approved_by_teacher = True          # a teacher-approved grade is visible to the student
    s.reviewed_by = uid
    s.reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/speaking/{submission_id}")
def grade_speaking(
    submission_id: int,
    payload: GradeIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    uid = user.id
    s = db.query(models.SpeakingSubmission).filter(models.SpeakingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    s.band = payload.band
    s.feedback = payload.feedback
    if not payload.share_ai:
        s.ai_result = None
    elif payload.ai_result is not None:
        s.ai_result = payload.ai_result
    s.status = "reviewed"
    s.approved_by_teacher = True
    s.reviewed_by = uid
    s.reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Pending count (for the nav badge) ───────────────────────────────────────

@router.get("/count")
def pending_count(
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    pending = ["submitted", "ai_graded"]
    n = (
        db.query(models.WritingSubmission)
        .filter(models.WritingSubmission.status.in_(pending)).count()
        + db.query(models.SpeakingSubmission)
        .filter(models.SpeakingSubmission.status.in_(pending)).count()
    )
    return {"pending": n}


# ── Student spaced-review queue ─────────────────────────────────────────────

def _due_item(db: Session, rq: models.ReviewQueue) -> Optional[dict]:
    q = db.query(models.Question).filter(models.Question.id == rq.question_id).first()
    if not q:
        return None
    station = q.station
    return {
        "id": rq.id,                       # review_queue id
        "question_id": q.id,
        "qtype": q.qtype.value,
        "prompt": q.prompt,
        "options": q.options_json or [] if q.qtype.value == "mcq" else [],
        "correct_index": q.correct_index,
        "accept_answers": q.accept_answers or [],
        "sub_skill": q.sub_skill,
        "skill": station.skill if station else None,
        "passage_md": station.case.body_md if station and station.case else "",
        "audio_url": station.audio_url if station else None,
        "image_url": station.image_url if station else None,
        "explanation": q.explanation,
        "support_sentences": q.support_sentences or [],
        "due_date": rq.due_date.isoformat() if rq.due_date else None,
        "interval_days": rq.interval_days,
    }


@router.get("/due")
def review_due(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Questions whose review is due today (or overdue) for the current user."""
    now = datetime.utcnow()
    rows = (
        db.query(models.ReviewQueue)
        .filter(
            models.ReviewQueue.user_id == user.id,
            models.ReviewQueue.due_date <= now,
        )
        .order_by(models.ReviewQueue.due_date.asc())
        .all()
    )
    return [item for rq in rows if (item := _due_item(db, rq)) is not None]


@router.get("/due_count")
def review_due_count(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    now = datetime.utcnow()
    n = (
        db.query(models.ReviewQueue)
        .filter(
            models.ReviewQueue.user_id == user.id,
            models.ReviewQueue.due_date <= now,
        )
        .count()
    )
    return {"due": n}


class ReviewResultIn(BaseModel):
    correct: bool


@router.post("/{queue_id}/result")
def review_result(
    queue_id: int,
    payload: ReviewResultIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Record a spaced-review answer and reschedule the item."""
    rq = (
        db.query(models.ReviewQueue)
        .filter(models.ReviewQueue.id == queue_id, models.ReviewQueue.user_id == user.id)
        .first()
    )
    if not rq:
        raise HTTPException(404, "Review item not found")
    apply_result(db, rq, payload.correct)
    db.commit()
    return {
        "ok": True,
        "interval_days": rq.interval_days,
        "next_due": rq.due_date.isoformat() if rq.due_date else None,
    }


# ── Inline comments on writing responses ────────────────────────────────────

class CommentIn(BaseModel):
    start_offset: int
    end_offset: int
    quote: str
    comment: str


def _comment_out(c: models.WritingComment) -> dict:
    return {
        "id": c.id,
        "start_offset": c.start_offset,
        "end_offset": c.end_offset,
        "quote": c.quote,
        "comment": c.comment,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/writing/{submission_id}/comments")
def list_comments(
    submission_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """List inline comments. Visible to the teacher and to the owning student."""
    sub = db.query(models.WritingSubmission).filter(
        models.WritingSubmission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(404, "Submission not found")
    is_teacher = user.role in (models.UserRole.teacher, models.UserRole.admin)
    if not is_teacher and sub.user_id != user.id:
        raise HTTPException(403, "Not allowed.")
    rows = (
        db.query(models.WritingComment)
        .filter(models.WritingComment.submission_id == submission_id)
        .order_by(models.WritingComment.start_offset.asc())
        .all()
    )
    return [_comment_out(c) for c in rows]


@router.post("/writing/{submission_id}/comments")
def add_comment(
    submission_id: int,
    payload: CommentIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    sub = db.query(models.WritingSubmission).filter(
        models.WritingSubmission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(404, "Submission not found")
    if not (payload.comment or "").strip():
        raise HTTPException(400, "Comment cannot be empty.")
    c = models.WritingComment(
        submission_id=submission_id,
        start_offset=payload.start_offset,
        end_offset=payload.end_offset,
        quote=payload.quote,
        comment=payload.comment.strip(),
        created_by=user.id,
    )
    db.add(c)
    db.commit()
    return _comment_out(c)


@router.delete("/writing/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    c = db.query(models.WritingComment).filter(models.WritingComment.id == comment_id).first()
    if not c:
        raise HTTPException(404, "Comment not found")
    db.delete(c)
    db.commit()
    return {"ok": True}
