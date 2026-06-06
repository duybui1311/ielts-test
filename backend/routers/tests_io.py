from pathlib import Path
from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import bcrypt
from backend.service.database import get_db
from backend.service import models, storage

router = APIRouter(prefix="/api/tests", tags=["tests"])

# kind -> (Supabase Storage bucket, default extension, default content-type)
_UPLOAD_KINDS = {
    "image": ("writing-charts", ".png", "image/png"),   # Writing Task 1 chart/diagram
    "audio": ("speaking-audio", ".mp3", "audio/mpeg"),  # Listening audio
}


def _require_teacher(db: Session, x_user_id: Optional[str]) -> int:
    try:
        uid = int(x_user_id) if x_user_id else None
    except (TypeError, ValueError):
        uid = None
    user = db.query(models.User).filter(models.User.id == uid).first() if uid else None
    if not user or user.role != models.UserRole.teacher:
        raise HTTPException(403, "Teachers only.")
    return uid


@router.post("/upload")
async def upload_media(
    kind: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """Upload builder media (a Writing chart image or a Listening audio file) to
    Supabase Storage and return its public URL for the section's image_url /
    audio_url. Teacher-only."""
    _require_teacher(db, x_user_id)
    spec = _UPLOAD_KINDS.get(kind)
    if not spec:
        raise HTTPException(400, "kind must be 'image' or 'audio'.")
    bucket, default_ext, default_ctype = spec
    if not storage.is_configured():
        raise HTTPException(
            503,
            "Uploads are not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY "
            "to backend/.env, then restart the backend.",
        )
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file.")
    ext = Path(file.filename or "").suffix or default_ext
    ctype = file.content_type or default_ctype
    try:
        url = storage.upload_bytes(bucket, data, ctype, ext)
    except storage.StorageNotConfigured as e:
        raise HTTPException(503, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Upload failed: {e}")
    return {"url": url}


class QuestionIn(BaseModel):
    qtype: str                                  # mcq | short | explain
    prompt: str
    options: Optional[List[str]] = None         # for mcq
    correct_index: Optional[int] = None         # for mcq
    accept_answers: Optional[List[str]] = None  # for short
    sub_skill: Optional[str] = None
    display_order: int = 1


class SectionIn(BaseModel):
    position: int
    skill: str                                  # listening | reading | writing | speaking
    title: str
    passage_md: str = ""
    audio_url: Optional[str] = None             # listening audio
    image_url: Optional[str] = None             # writing Task 1 chart/diagram
    questions: List[QuestionIn] = []


class TestIn(BaseModel):
    name: str
    difficulty: str = "medium"                  # low | medium | high
    time_limit_min: int = 60
    reading_min: int = 0
    access_code: str = "1234"
    class_id: Optional[int] = None
    created_by: int                             # teacher id (until auth is wired)
    sections: List[SectionIn]


@router.post("/import")
def import_test(payload: TestIn, db: Session = Depends(get_db)):
    class_id = payload.class_id
    if not class_id:
        klass = (
            db.query(models.Class)
            .filter(models.Class.name == "Sandbox", models.Class.owner_id == payload.created_by)
            .first()
        )
        if not klass:
            klass = models.Class(name="Sandbox", owner_id=payload.created_by)
            db.add(klass)
            db.flush()
        class_id = klass.id

    code_hash = bcrypt.hashpw(payload.access_code.encode(), bcrypt.gensalt()).decode()
    exam = models.Exam(
        class_id=class_id,
        name=payload.name,
        exam_type=models.ExamType.practice,
        difficulty=models.DifficultyLevel(payload.difficulty),
        total_stations=len(payload.sections),
        time_limit_min=payload.time_limit_min,
        reading_min=payload.reading_min,
        access_code_hash=code_hash,
        created_by=payload.created_by,
    )
    db.add(exam)
    db.flush()

    for s in payload.sections:
        case = models.Case(title=s.title, body_md=s.passage_md, created_by=payload.created_by)
        db.add(case)
        db.flush()
        station = models.Station(
            exam_id=exam.id, position=s.position, case_id=case.id,
            skill=s.skill, audio_url=s.audio_url, image_url=s.image_url,
        )
        db.add(station)
        db.flush()
        for q in s.questions:
            db.add(models.Question(
                station_id=station.id,
                qtype=models.QuestionType(q.qtype),
                prompt=q.prompt,
                options_json=q.options,
                correct_index=q.correct_index,
                accept_answers=q.accept_answers,
                sub_skill=q.sub_skill,
                display_order=q.display_order,
            ))
    db.commit()
    return {"exam_id": exam.id, "sections": len(payload.sections)}


@router.get("/{exam_id}/export")
def export_test(exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    out = {"name": exam.name, "time_limit_min": exam.time_limit_min, "sections": []}
    for st in sorted(exam.stations, key=lambda x: x.position):
        out["sections"].append({
            "position": st.position,
            "skill": st.skill,
            "title": st.case.title,
            "passage_md": st.case.body_md,
            "audio_url": st.audio_url,
            "image_url": st.image_url,
            "questions": [{
                "qtype": q.qtype.value,
                "prompt": q.prompt,
                "options": q.options_json,
                "correct_index": q.correct_index,
                "accept_answers": q.accept_answers,
                "sub_skill": q.sub_skill,
            } for q in st.questions],
        })
    return out
