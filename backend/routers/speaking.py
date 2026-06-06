"""Speaking practice — students record audio (+ browser transcript), teachers
grade manually and can replay the audio.

Audio is uploaded to the Supabase Storage "speaking-audio" bucket and the public
URL is stored on the submission, so recordings persist online. Identity comes
from the verified JWT (backend.service.auth_deps).
"""
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models, storage, ai_grading
from backend.service.config import settings
from backend.service.auth_deps import get_current_user, require_role

router = APIRouter(prefix="/api/speaking", tags=["speaking"])

_teacher = require_role("teacher", "admin")


def _write_ai_error_tags(db: Session, *, user_id: int, skill: str, tags: list) -> None:
    """Persist AI-found mistakes into the shared error_tags table (station/exam
    FKs stay null for submissions) so they feed the analytics dashboard."""
    for t in tags or []:
        db.add(models.ErrorTag(
            user_id=user_id, skill=skill, question_type=skill,
            sub_skill=(t.get("category") or None),
        ))


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
def list_tasks(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    tasks = (
        db.query(models.SpeakingTask)
        .order_by(models.SpeakingTask.part.asc(), models.SpeakingTask.created_at.desc())
        .all()
    )
    return [_task_out(t) for t in tasks]


@router.get("/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    t = db.query(models.SpeakingTask).filter(models.SpeakingTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    return _task_out(t)


@router.post("/tasks")
def create_task(
    payload: TaskIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    t = models.SpeakingTask(
        part=payload.part, title=payload.title.strip(), prompt_md=payload.prompt_md,
        prep_sec=payload.prep_sec, answer_sec=payload.answer_sec, created_by=user.id,
    )
    db.add(t)
    db.commit()
    return _task_out(t)


class TaskPatchIn(BaseModel):
    title: Optional[str] = None
    prompt_md: Optional[str] = None
    part: Optional[int] = None
    prep_sec: Optional[int] = None
    answer_sec: Optional[int] = None


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskPatchIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    t = db.query(models.SpeakingTask).filter(models.SpeakingTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    if payload.title is not None:
        if not payload.title.strip():
            raise HTTPException(400, "Title cannot be empty.")
        t.title = payload.title.strip()
    if payload.prompt_md is not None:
        t.prompt_md = payload.prompt_md
    if payload.part is not None:
        t.part = payload.part
    if payload.prep_sec is not None:
        t.prep_sec = payload.prep_sec
    if payload.answer_sec is not None:
        t.answer_sec = payload.answer_sec
    db.commit()
    return _task_out(t)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Delete a speaking task and its submissions. Teacher/admin."""
    t = db.query(models.SpeakingTask).filter(models.SpeakingTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    db.query(models.SpeakingSubmission).filter(
        models.SpeakingSubmission.task_id == task_id
    ).delete(synchronize_session=False)
    db.delete(t)
    db.commit()
    return {"ok": True, "deleted": task_id}


@router.post("/submissions")
async def submit(
    task_id: int = Form(...),
    transcript: str = Form(""),
    audio: Optional[UploadFile] = File(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    uid = user.id
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


@router.post("/submissions/{submission_id}/ai-grade")
def ai_grade_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Run Gemini grading on the transcript and store a DRAFT (status
    'ai_graded'). Teacher-only; students don't see it until approved."""
    s = db.query(models.SpeakingSubmission).filter(models.SpeakingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    if not (s.transcript or "").strip():
        raise HTTPException(400, "This submission has no transcript to grade.")
    task = s.task
    try:
        result = ai_grading.grade_speaking(s.transcript, task.prompt_md if task else "")
    except ai_grading.AIGradingError as e:
        busy = "busy" in str(e).lower()
        raise HTTPException(503 if busy else 502, str(e))

    first_time = s.status == "submitted"
    s.ai_result = result
    s.band = result.get("overall_band")
    s.status = "ai_graded"
    s.approved_by_teacher = False
    if first_time:
        _write_ai_error_tags(db, user_id=s.user_id, skill="speaking", tags=result.get("error_tags"))
    db.commit()
    return {"id": s.id, "status": s.status, "ai_result": result}


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Full detail for one speaking submission — owning student or teacher/admin."""
    s = db.query(models.SpeakingSubmission).filter(models.SpeakingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    is_teacher = user.role in (models.UserRole.teacher, models.UserRole.admin)
    if not is_teacher and s.user_id != user.id:
        raise HTTPException(403, "Not allowed.")
    visible = is_teacher or s.approved_by_teacher or settings.AI_GRADES_AUTO_VISIBLE
    return {
        "id": s.id, "kind": "speaking",
        "task_title": s.task.title if s.task else "Speaking task",
        "task_prompt": s.task.prompt_md if s.task else None,
        "part": s.task.part if s.task else None,
        "transcript": s.transcript,
        "audio_url": s.audio_url,
        "status": ("reviewed" if visible else "submitted") if not is_teacher else s.status,
        "band": s.band if visible else None,
        "feedback": s.feedback if visible else None,
        "ai_result": s.ai_result if visible else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
    }


@router.get("/submissions")
def my_submissions(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    uid = user.id
    subs = (
        db.query(models.SpeakingSubmission)
        .filter(models.SpeakingSubmission.user_id == uid)
        .order_by(models.SpeakingSubmission.created_at.desc())
        .all()
    )
    out = []
    for s in subs:
        visible = s.approved_by_teacher or settings.AI_GRADES_AUTO_VISIBLE
        out.append({
            "id": s.id,
            "task_title": s.task.title if s.task else "Speaking task",
            "part": s.task.part if s.task else None,
            "transcript": s.transcript,
            "audio_url": s.audio_url,
            "status": "reviewed" if visible else "submitted",
            "band": s.band if visible else None,
            "feedback": s.feedback if visible else None,
            "ai_result": s.ai_result if visible else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        })
    return out
