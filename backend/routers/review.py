"""Teacher review queue — grade pending Writing and Speaking submissions.

Test-version auth via the `X-User-Id` header; teacher role required.
"""
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/review", tags=["review"])


def _uid(x_user_id: Optional[str]) -> Optional[int]:
    try:
        return int(x_user_id) if x_user_id else None
    except (TypeError, ValueError):
        return None


def _require_teacher(db: Session, x_user_id: Optional[str]) -> int:
    uid = _uid(x_user_id)
    user = db.query(models.User).filter(models.User.id == uid).first() if uid else None
    if not user or user.role != models.UserRole.teacher:
        raise HTTPException(403, "Teachers only.")
    return uid


class GradeIn(BaseModel):
    band: float
    feedback: str = ""


@router.get("/queue")
def queue(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    _require_teacher(db, x_user_id)
    names = {
        u.id: (u.full_name or u.username or u.email or f"User {u.id}")
        for u in db.query(models.User).all()
    }

    writing = (
        db.query(models.WritingSubmission)
        .filter(models.WritingSubmission.status == "submitted")
        .order_by(models.WritingSubmission.created_at.asc())
        .all()
    )
    speaking = (
        db.query(models.SpeakingSubmission)
        .filter(models.SpeakingSubmission.status == "submitted")
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
            "created_at": s.created_at.isoformat() if s.created_at else None,
        })

    items.sort(key=lambda x: x["created_at"] or "")
    return items


@router.post("/writing/{submission_id}")
def grade_writing(
    submission_id: int,
    payload: GradeIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_teacher(db, x_user_id)
    s = db.query(models.WritingSubmission).filter(models.WritingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    s.band = payload.band
    s.feedback = payload.feedback
    s.status = "reviewed"
    s.reviewed_by = uid
    s.reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/speaking/{submission_id}")
def grade_speaking(
    submission_id: int,
    payload: GradeIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_teacher(db, x_user_id)
    s = db.query(models.SpeakingSubmission).filter(models.SpeakingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    s.band = payload.band
    s.feedback = payload.feedback
    s.status = "reviewed"
    s.reviewed_by = uid
    s.reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
