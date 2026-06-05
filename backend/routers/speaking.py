"""Speaking practice — students record audio (+ browser transcript), teachers
grade manually and can replay the audio.

Audio is uploaded to the Supabase Storage "speaking-audio" bucket and the public
URL is stored on the submission, so recordings persist online. Test-version auth
via `X-User-Id`.
"""
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models, storage

router = APIRouter(prefix="/api/speaking", tags=["speaking"])


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
    part: int = 1                      # 1 | 2 | 3
    title: str
    prompt_md: str
    prep_sec: int = 60
    answer_sec: int = 120


def _task_out(t: models.SpeakingTask):
    return {
        "id": t.id, "part": t.part, "title": t.title, "prompt_md": t.prompt_md,
        "prep_sec": t.prep_sec, "answer_sec": t.answer_sec,
    }


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db)):
    tasks = (
        db.query(models.SpeakingTask)
        .order_by(models.SpeakingTask.part.asc(), models.SpeakingTask.created_at.desc())
        .all()
    )
    return [_task_out(t) for t in tasks]


@router.post("/tasks")
def create_task(
    payload: TaskIn,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _require_teacher(db, x_user_id)
    t = models.SpeakingTask(
        part=payload.part, title=payload.title.strip(), prompt_md=payload.prompt_md,
        prep_sec=payload.prep_sec, answer_sec=payload.answer_sec, created_by=uid,
    )
    db.add(t)
    db.commit()
    return _task_out(t)


@router.post("/submissions")
async def submit(
    task_id: int = Form(...),
    transcript: str = Form(""),
    audio: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _uid(x_user_id)
    if not uid:
        raise HTTPException(401, "Sign in required.")
    if not db.query(models.SpeakingTask).filter(models.SpeakingTask.id == task_id).first():
        raise HTTPException(404, "Task not found")

    audio_url = None
    if audio is not None:
        data = await audio.read()
        if data:
            ext = Path(audio.filename or "").suffix or ".webm"
            ctype = audio.content_type or "audio/webm"
            try:
                audio_url = storage.upload_bytes("speaking-audio", data, ctype, ext)
            except storage.StorageNotConfigured as e:
                raise HTTPException(503, str(e))
            except Exception as e:  # noqa: BLE001
                raise HTTPException(502, f"Audio upload failed: {e}")

    sub = models.SpeakingSubmission(
        task_id=task_id, user_id=uid, transcript=transcript or None,
        audio_url=audio_url, status="submitted",
    )
    db.add(sub)
    db.commit()
    return {"id": sub.id, "status": sub.status, "audio_url": audio_url}


@router.get("/submissions")
def my_submissions(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _uid(x_user_id)
    if not uid:
        return []
    subs = (
        db.query(models.SpeakingSubmission)
        .filter(models.SpeakingSubmission.user_id == uid)
        .order_by(models.SpeakingSubmission.created_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "task_title": s.task.title if s.task else "Speaking task",
            "part": s.task.part if s.task else None,
            "transcript": s.transcript,
            "audio_url": s.audio_url,
            "status": s.status,
            "band": s.band,
            "feedback": s.feedback,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        }
        for s in subs
    ]
