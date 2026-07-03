"""Writing practice — students submit essays; teachers/AI grade them.

Identity comes from the verified JWT (backend.service.auth_deps).
"""
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models, storage, ai_grading
from backend.service.config import settings
from backend.service.auth_deps import get_current_user, require_role

router = APIRouter(prefix="/api/writing", tags=["writing"])

_teacher = require_role("teacher", "admin")


def _write_ai_error_tags(db: Session, *, user_id: int, skill: str, tags: list) -> None:
    """Persist AI-found mistakes into the shared error_tags table so Writing/
    Speaking weaknesses appear on the same analytics dashboard. No station/exam
    for submissions, so those FKs stay null."""
    for t in tags or []:
        db.add(models.ErrorTag(
            user_id=user_id, skill=skill, question_type=skill,
            sub_skill=(t.get("category") or None),
        ))


class TaskIn(BaseModel):
    task_type: str = "task2"           # task1 | task2
    title: str
    prompt_md: str
    image_url: Optional[str] = None
    time_limit_min: int = 20
    min_words: Optional[int] = None


class SubmissionIn(BaseModel):
    task_id: int
    response_text: str


def _task_out(t: models.WritingTask):
    return {
        "id": t.id, "task_type": t.task_type, "title": t.title,
        "prompt_md": t.prompt_md, "image_url": storage.sign_media_url(t.image_url),
        "time_limit_min": t.time_limit_min, "min_words": t.min_words,
    }


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    tasks = db.query(models.WritingTask).order_by(models.WritingTask.created_at.desc()).all()
    return [_task_out(t) for t in tasks]


@router.get("/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    t = db.query(models.WritingTask).filter(models.WritingTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    return _task_out(t)


@router.post("/tasks")
def create_task(
    payload: TaskIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    t = models.WritingTask(
        task_type=payload.task_type, title=payload.title.strip(),
        prompt_md=payload.prompt_md, image_url=payload.image_url,
        time_limit_min=payload.time_limit_min, min_words=payload.min_words, created_by=user.id,
    )
    db.add(t)
    db.commit()
    return _task_out(t)


class TaskPatchIn(BaseModel):
    title: Optional[str] = None
    prompt_md: Optional[str] = None
    time_limit_min: Optional[int] = None
    task_type: Optional[str] = None
    min_words: Optional[int] = None


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskPatchIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    t = db.query(models.WritingTask).filter(models.WritingTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    if payload.title is not None:
        if not payload.title.strip():
            raise HTTPException(400, "Title cannot be empty.")
        t.title = payload.title.strip()
    if payload.prompt_md is not None:
        t.prompt_md = payload.prompt_md
    if payload.time_limit_min is not None:
        t.time_limit_min = payload.time_limit_min
    if payload.task_type is not None:
        t.task_type = payload.task_type
    if payload.min_words is not None:
        t.min_words = payload.min_words
    db.commit()
    return _task_out(t)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Delete a writing task and its submissions/comments. Teacher/admin."""
    t = db.query(models.WritingTask).filter(models.WritingTask.id == task_id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    subs = db.query(models.WritingSubmission).filter(
        models.WritingSubmission.task_id == task_id
    ).all()
    for s in subs:
        db.query(models.WritingComment).filter(
            models.WritingComment.submission_id == s.id
        ).delete(synchronize_session=False)
        db.delete(s)
    db.delete(t)
    db.commit()
    return {"ok": True, "deleted": task_id}


@router.post("/tasks/{task_id}/image")
async def upload_task_image(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Teacher uploads a Task 1 chart/diagram; stored in Supabase Storage and
    linked to the task via image_url."""
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
    return {"image_url": storage.sign_media_url(url)}


@router.post("/submissions")
def submit(
    payload: SubmissionIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not db.query(models.WritingTask).filter(models.WritingTask.id == payload.task_id).first():
        raise HTTPException(404, "Task not found")
    text = payload.response_text or ""
    sub = models.WritingSubmission(
        task_id=payload.task_id, user_id=user.id,
        response_text=text, word_count=len(text.split()),
        status="submitted",
    )
    db.add(sub)
    db.commit()
    return {"id": sub.id, "status": sub.status, "word_count": sub.word_count}


@router.post("/submissions/{submission_id}/ai-grade")
def ai_grade_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Run Gemini grading and store a DRAFT (status 'ai_graded', not yet approved).
    Teacher-only — students never see the result until a teacher approves it."""
    s = db.query(models.WritingSubmission).filter(models.WritingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    task = s.task
    try:
        result = ai_grading.grade_writing(
            s.response_text,
            task.prompt_md if task else "",
            task.task_type if task else "task2",
        )
    except ai_grading.AIGradingError as e:
        busy = "busy" in str(e).lower()
        raise HTTPException(503 if busy else 502, str(e))

    first_time = s.status == "submitted"
    s.ai_result = result
    s.band = result.get("overall_band")
    s.status = "ai_graded"
    s.approved_by_teacher = False
    if first_time:                       # avoid duplicate tags on re-grade
        _write_ai_error_tags(db, user_id=s.user_id, skill="writing", tags=result.get("error_tags"))
    db.commit()
    return {"id": s.id, "status": s.status, "ai_result": result}


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Full detail for one submission — the owning student or a teacher/admin."""
    s = db.query(models.WritingSubmission).filter(models.WritingSubmission.id == submission_id).first()
    if not s:
        raise HTTPException(404, "Submission not found")
    is_teacher = user.role in (models.UserRole.teacher, models.UserRole.admin)
    if not is_teacher and s.user_id != user.id:
        raise HTTPException(403, "Not allowed.")
    visible = is_teacher or s.approved_by_teacher or settings.AI_GRADES_AUTO_VISIBLE
    comments = [
        {"id": c.id, "start_offset": c.start_offset, "end_offset": c.end_offset, "quote": c.quote, "comment": c.comment}
        for c in db.query(models.WritingComment)
        .filter(models.WritingComment.submission_id == s.id)
        .order_by(models.WritingComment.start_offset.asc()).all()
    ]
    return {
        "id": s.id, "kind": "writing",
        "task_title": s.task.title if s.task else "Writing task",
        "task_prompt": s.task.prompt_md if s.task else None,
        "task_type": s.task.task_type if s.task else None,
        "image_url": storage.sign_media_url(s.task.image_url) if s.task else None,
        "response_text": s.response_text,
        "word_count": s.word_count,
        "status": ("reviewed" if visible else "submitted") if not is_teacher else s.status,
        "band": s.band if visible else None,
        "feedback": s.feedback if visible else None,
        "ai_result": s.ai_result if visible else None,
        "comments": comments,
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
    out = []
    for s in subs:
        # Students only see a grade once a teacher approves it (or if the
        # AI_GRADES_AUTO_VISIBLE setting is on).
        visible = s.approved_by_teacher or settings.AI_GRADES_AUTO_VISIBLE
        out.append({
            "id": s.id,
            "task_title": s.task.title if s.task else "Writing task",
            "task_type": s.task.task_type if s.task else None,
            "word_count": s.word_count,
            "status": "reviewed" if visible else "submitted",
            "band": s.band if visible else None,
            "feedback": s.feedback if visible else None,
            "ai_result": s.ai_result if visible else None,
            "response_text": s.response_text,
            "comments": comments_by_sub.get(s.id, []),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        })
    return out
