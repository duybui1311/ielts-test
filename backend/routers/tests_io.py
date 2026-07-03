from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Literal, Optional
from sqlalchemy.orm import Session
import bcrypt
from backend.service.database import get_db
from backend.service import models, scoping, storage
from backend.service.auth_deps import get_current_user, require_role
from backend.service.subskills import SUB_SKILLS

router = APIRouter(prefix="/api/tests", tags=["tests"])

_teacher = require_role("teacher", "admin")

# Closed vocabularies, validated at the API boundary so malformed input is
# rejected with a 422 instead of raising deep in the handler (a 500). These
# mirror the model enums (DifficultyLevel, QuestionType) and the Station.skill
# values the autograder keys off.
Difficulty = Literal["low", "medium", "high"]
QType = Literal["mcq", "short", "explain"]
Skill = Literal["reading", "listening", "writing", "speaking"]


def _clean_sub_skill(sub_skill: Optional[str], qtype: str) -> Optional[str]:
    """Keep sub_skill inside the closed analytics vocab so the weakness heatmap
    never silently drops a manually-imported question (mirrors ai_import). Unknown
    or missing values are clamped to a sensible default by question type; writing/
    speaking ('explain') questions don't feed the sub-skill heatmap, so they get None."""
    if sub_skill in SUB_SKILLS:
        return sub_skill
    if qtype == "mcq":
        return "multiple_choice"
    if qtype == "short":
        return "short_answer"
    return None


# kind -> (Supabase Storage bucket, default extension, default content-type)
_UPLOAD_KINDS = {
    "image": ("writing-charts", ".png", "image/png"),   # Writing Task 1 chart/diagram
    "audio": ("speaking-audio", ".mp3", "audio/mpeg"),  # Listening audio
}


@router.post("/upload")
async def upload_media(
    kind: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Upload builder media (a Writing chart image or a Listening audio file) to
    Supabase Storage and return its public URL for the section's image_url /
    audio_url. Teacher-only."""
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
    return {"url": storage.sign_media_url(url)}


class QuestionIn(BaseModel):
    qtype: QType                                # mcq | short | explain
    prompt: str
    options: Optional[List[str]] = None         # for mcq
    correct_index: Optional[int] = None         # for mcq
    accept_answers: Optional[List[str]] = None  # for short
    sub_skill: Optional[str] = None
    display_order: int = 1
    explanation: Optional[str] = None           # learning-feature: why the answer is correct
    support_sentences: Optional[List[str]] = None  # passage sentence(s) supporting it
    paraphrases: Optional[List[dict]] = None    # [{question_phrase, passage_phrase}]
    qformat: Optional[Literal["tfng", "ynng", "matching", "multi_select", "gap_fill"]] = None
    correct_indices: Optional[List[int]] = None  # multi_select answer set
    select_count: Optional[int] = None           # picks required for multi_select
    task_instructions: Optional[str] = None      # instruction block above the task


class SectionIn(BaseModel):
    position: int
    skill: Skill                                # listening | reading | writing | speaking
    title: str
    passage_md: str = ""
    audio_url: Optional[str] = None             # listening audio
    image_url: Optional[str] = None             # writing Task 1 chart/diagram
    questions: List[QuestionIn] = []


class TestIn(BaseModel):
    name: str
    difficulty: Difficulty = "medium"           # low | medium | high
    time_limit_min: int = 60
    reading_min: int = 0
    access_code: str = "1234"
    exam_type: Literal["practice", "exam"] = "practice"   # "exam" = full mock test
    class_id: Optional[int] = None
    created_by: Optional[int] = None            # ignored — author comes from the token
    sections: List[SectionIn]


@router.post("/import")
def import_test(
    payload: TestIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    created_by = user.id
    class_id = payload.class_id
    if not class_id:
        klass = (
            db.query(models.Class)
            .filter(models.Class.name == "Sandbox", models.Class.owner_id == created_by)
            .first()
        )
        if not klass:
            klass = models.Class(name="Sandbox", owner_id=created_by,
                                 join_code=scoping.new_join_code())
            db.add(klass)
            db.flush()
        class_id = klass.id

    code_hash = bcrypt.hashpw(payload.access_code.encode(), bcrypt.gensalt()).decode()
    exam = models.Exam(
        class_id=class_id,
        name=payload.name,
        exam_type=models.ExamType(payload.exam_type),
        difficulty=models.DifficultyLevel(payload.difficulty),
        total_stations=len(payload.sections),
        time_limit_min=payload.time_limit_min,
        reading_min=payload.reading_min,
        access_code_hash=code_hash,
        created_by=created_by,
    )
    db.add(exam)
    db.flush()

    for s in payload.sections:
        case = models.Case(title=s.title, body_md=s.passage_md, created_by=created_by)
        db.add(case)
        db.flush()
        station = models.Station(
            exam_id=exam.id, position=s.position, case_id=case.id,
            skill=s.skill,
            audio_url=storage.canonical_media_url(s.audio_url),
            image_url=storage.canonical_media_url(s.image_url),
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
                sub_skill=_clean_sub_skill(q.sub_skill, q.qtype),
                display_order=q.display_order,
                explanation=q.explanation,
                support_sentences=q.support_sentences,
                paraphrases=q.paraphrases,
                qformat=q.qformat,
                correct_indices=q.correct_indices,
                select_count=q.select_count,
                task_instructions=q.task_instructions,
            ))
    db.commit()
    return {"exam_id": exam.id, "sections": len(payload.sections)}


class TestPatchIn(BaseModel):
    name: Optional[str] = None
    difficulty: Optional[Difficulty] = None     # low | medium | high
    time_limit_min: Optional[int] = None


class TestUpdateIn(BaseModel):
    name: str
    difficulty: Difficulty = "medium"
    time_limit_min: int = 60
    sections: List[SectionIn]


def _exam_attempt_count(db: Session, exam_id: int) -> int:
    return (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.exam_id == exam_id)
        .count()
    )


def _delete_exam_graph(db: Session, exam: models.Exam) -> None:
    """Delete an exam and everything that references it (attempts, answers,
    error tags, stations/cases/questions). No ON DELETE CASCADE in
    the schema, so we remove dependents explicitly, child-first."""
    # ErrorTags reference answers/station_attempts/stations, so remove them first.
    db.query(models.ErrorTag).filter(models.ErrorTag.exam_id == exam.id).delete(
        synchronize_session=False
    )
    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.exam_id == exam.id)
        .all()
    )
    for ea in attempts:
        sas = (
            db.query(models.StationAttempt)
            .filter(models.StationAttempt.exam_attempt_id == ea.id)
            .all()
        )
        for sa in sas:
            db.query(models.Answer).filter(
                models.Answer.station_attempt_id == sa.id
            ).delete(synchronize_session=False)
            db.delete(sa)
        db.delete(ea)
    case_ids = [st.case_id for st in exam.stations]
    db.delete(exam)              # stations + questions cascade (delete-orphan)
    db.flush()
    for cid in case_ids:
        c = db.query(models.Case).filter(models.Case.id == cid).first()
        if c and not c.stations:
            db.delete(c)


def _replace_sections(db: Session, exam: models.Exam, sections: List[SectionIn]) -> None:
    """Replace an exam's stations/questions with a new set (edit mode)."""
    old_cases = [st.case_id for st in exam.stations]
    exam.stations.clear()       # delete-orphan removes old stations + questions
    db.flush()
    for cid in old_cases:
        c = db.query(models.Case).filter(models.Case.id == cid).first()
        if c and not c.stations:
            db.delete(c)
    for s in sections:
        case = models.Case(title=s.title, body_md=s.passage_md, created_by=exam.created_by)
        db.add(case)
        db.flush()
        station = models.Station(
            exam_id=exam.id, position=s.position, case_id=case.id,
            skill=s.skill,
            audio_url=storage.canonical_media_url(s.audio_url),
            image_url=storage.canonical_media_url(s.image_url),
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
                sub_skill=_clean_sub_skill(q.sub_skill, q.qtype),
                display_order=q.display_order,
                explanation=q.explanation,
                support_sentences=q.support_sentences,
                paraphrases=q.paraphrases,
                qformat=q.qformat,
                correct_indices=q.correct_indices,
                select_count=q.select_count,
                task_instructions=q.task_instructions,
            ))
    exam.total_stations = len(sections)


@router.patch("/{exam_id}")
def rename_test(
    exam_id: int,
    payload: TestPatchIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Quick metadata edit (rename, difficulty, time limit). Teacher/admin."""
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Name cannot be empty.")
        exam.name = name
    if payload.difficulty is not None:
        exam.difficulty = models.DifficultyLevel(payload.difficulty)
    if payload.time_limit_min is not None:
        exam.time_limit_min = payload.time_limit_min
    db.commit()
    return {"id": exam.id, "name": exam.name}


@router.put("/{exam_id}")
def update_test(
    exam_id: int,
    payload: TestUpdateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Replace an exam's content (builder edit). Blocked once students have
    attempted it, to keep their results consistent."""
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    if _exam_attempt_count(db, exam_id) > 0:
        raise HTTPException(
            409,
            "This test already has student attempts — rename or delete it, or "
            "duplicate it to make an edited copy.",
        )
    exam.name = payload.name.strip() or exam.name
    exam.difficulty = models.DifficultyLevel(payload.difficulty)
    exam.time_limit_min = payload.time_limit_min
    _replace_sections(db, exam, payload.sections)
    db.commit()
    return {"id": exam.id, "sections": len(payload.sections)}


@router.delete("/{exam_id}")
def delete_test(
    exam_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Delete a test and all of its attempts/answers. Teacher/admin."""
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    _delete_exam_graph(db, exam)
    db.commit()
    return {"ok": True, "deleted": exam_id}


@router.get("/{exam_id}/export")
def export_test(
    exam_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Export a test including its answer key — teacher/admin only."""
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(404, "Exam not found")
    out = {
        "name": exam.name,
        "exam_type": exam.exam_type.value,
        "difficulty": exam.difficulty.value,
        "time_limit_min": exam.time_limit_min,
        "sections": [],
    }
    for st in sorted(exam.stations, key=lambda x: x.position):
        out["sections"].append({
            "position": st.position,
            "skill": st.skill,
            "title": st.case.title,
            "passage_md": st.case.body_md,
            "audio_url": storage.sign_media_url(st.audio_url),
            "image_url": storage.sign_media_url(st.image_url),
            "questions": [{
                "qtype": q.qtype.value,
                "prompt": q.prompt,
                "options": q.options_json,
                "correct_index": q.correct_index,
                "accept_answers": q.accept_answers,
                "sub_skill": q.sub_skill,
                "explanation": q.explanation,
                "support_sentences": q.support_sentences,
                "paraphrases": q.paraphrases,
                "qformat": q.qformat,
                "correct_indices": q.correct_indices,
                "select_count": q.select_count,
                "task_instructions": q.task_instructions,
            } for q in st.questions],
        })
    return out
