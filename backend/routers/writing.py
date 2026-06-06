"""Writing practice — students submit essays, teachers grade them manually.

Test-version auth via the `X-User-Id` header.
"""
from pathlib import Path
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models, storage

router = APIRouter(prefix="/api/writing", tags=["writing"])


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


class TaskIn(BaseModel):
    task_type: str = "task2"           # task1 | task2
    title: str
    prompt_md: str
    image_url: Optional[str] = None
    time_limit_min: int = 20


class SubmissionIn(BaseModel):
    task_id: int
    response_text: str


def _task_out(t: models.WritingTask):
    return {
        "id": t.id, "task_type": t.task_type, "title": t.title,
        "prompt_md": t.prompt_md, "image_url": t.image_url,
        "time_limit_min": t.time_limit_min,
    }


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db)):
    tasks = db.query(models.WritingTask).order_by(models.WritingTask.created_at.desc()).all()
    return [_task_out(t) for t in tasks]


@router.post("/tasks")
def create_task(
    payload: TaskIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_teacher(db, x_user_id)
    t = models.WritingTask(
        task_type=payload.task_type, title=payload.title.strip(),
        prompt_md=payload.prompt_md, image_url=payload.image_url,
        time_limit_min=payload.time_limit_min, created_by=uid,
    )
    db.add(t)
    db.commit()
    return _task_out(t)


@router.post("/tasks/{task_id}/image")
async def upload_task_image(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """Teacher uploads a Task 1 chart/diagram; stored in Supabase Storage and
    linked to the task via image_url."""
    _require_teacher(db, x_user_id)
    task = db.query(models.WritingTask).filter(models.WritingTask.id == task_id).first()
    if not task:
        raise HTTPException(404, "Task not found")
    if not storage.is_configured():
        raise HTTPException(
            503,
            "Image upload is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY "
            "to backend/.env, then restart the backend.",
        )
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file.")
    ext = Path(file.filename or "").suffix or ".png"
    ctype = file.content_type or "image/png"
    try:
        url = storage.upload_bytes("writing-charts", data, ctype, ext)
    except storage.StorageNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Upload failed: {e}")
    task.image_url = url
    db.commit()
    return {"image_url": url}


@router.post("/submissions")
def submit(
    payload: SubmissionIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _uid(x_user_id)
    if not uid:
        raise HTTPException(401, "Sign in required.")
    if not db.query(models.WritingTask).filter(models.WritingTask.id == payload.task_id).first():
        raise HTTPException(404, "Task not found")
    text = payload.response_text or ""
    sub = models.WritingSubmission(
        task_id=payload.task_id, user_id=uid,
        response_text=text, word_count=len(text.split()),
        status="submitted",
    )
    db.add(sub)
    db.commit()
    return {"id": sub.id, "status": sub.status, "word_count": sub.word_count}


@router.get("/submissions")
def my_submissions(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _uid(x_user_id)
    if not uid:
        return []
    subs = (
        db.query(models.WritingSubmission)
        .filter(models.WritingSubmission.user_id == uid)
        .order_by(models.WritingSubmission.created_at.desc())
        .all()
    )
    comments_by_sub: dict[int, list] = {}
    if subs:
        rows = (
            db.query(models.WritingComment)
            .filter(models.WritingComment.submission_id.in_([s.id for s in subs]))
            .order_by(models.WritingComment.start_offset.asc())
            .all()
        )
        for c in rows:
            comments_by_sub.setdefault(c.submission_id, []).append({
                "id": c.id,
                "start_offset": c.start_offset,
                "end_offset": c.end_offset,
                "quote": c.quote,
                "comment": c.comment,
            })
    return [
        {
            "id": s.id,
            "task_title": s.task.title if s.task else "Writing task",
            "task_type": s.task.task_type if s.task else None,
            "word_count": s.word_count,
            "status": s.status,
            "band": s.band,
            "feedback": s.feedback,
            "response_text": s.response_text,
            "comments": comments_by_sub.get(s.id, []),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        }
        for s in subs
    ]
