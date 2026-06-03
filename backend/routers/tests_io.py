from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import bcrypt
from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/tests", tags=["tests"])


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
    audio_url: Optional[str] = None
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
            skill=s.skill, audio_url=s.audio_url,
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
