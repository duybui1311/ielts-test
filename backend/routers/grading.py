from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from backend.service.database import get_db
from backend.service import models
from backend.service.models import (
    ExamAttempt,
    StationAttempt,
    Rubric,
    RubricMark,
    Feedback,
    AttemptStatus,
    Answer,
    ChatMessage,
    User
)
from pydantic import BaseModel
from backend.service.schemas import (
    RubricItem,
    SaveGradePayload,
    GradeUpdate,
)

router = APIRouter(prefix="/api/grading", tags=["grading"])


# =========================
# GET RUBRICS FOR STATION
# =========================
@router.get("/rubrics")
def get_rubrics(station_id: int, db: Session = Depends(get_db)):
    rubrics = db.query(Rubric).filter(Rubric.station_id == station_id).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "max_points": r.max_points,
        }
        for r in rubrics
    ]

# =========================
# GET ANSWERS
# =========================
@router.get("/answers")
def get_answers(station_attempt_id: int, db: Session = Depends(get_db)):
    answers = db.query(Answer).filter(
        Answer.station_attempt_id == station_attempt_id
    ).all()

    return [
        {
            "id": a.id,
            "question_id": a.question_id,
            "value_text": a.value_text,
            "choice_index": a.choice_index,
            "created_at": a.created_at,
        }
        for a in answers
    ]

# =========================
# GET CHAT MESSAGES
# =========================
@router.get("/chat_messages")
def get_chat_messages(station_attempt_id: int, db: Session = Depends(get_db)):
    return db.query(ChatMessage).filter(
        ChatMessage.station_attempt_id == station_attempt_id
    ).all()

# =========================
# Teacher: submitted exam attempts
# =========================
@router.get("/teacher/exam_attempts_done")
def teacher_exam_attempts_done(db: Session = Depends(get_db)):
    # You might want to include "graded" here as well if you want to see finished ones
    attempts = db.query(ExamAttempt).order_by(
    ExamAttempt.submitted_at.desc()
    ).all()
    
    # Enrich with student name and exam name for the frontend list
    results = []
    for a in attempts:
        student_name = a.candidate.full_name if a.candidate else "Unknown"
        exam_name = a.exam.name if a.exam else "Unknown"
        results.append({
            "exam_attempt_id": a.id,
            "exam_name": exam_name,
            "student_id": a.user_id,
            "student_name": student_name,
            "status": a.status.value,
            "total_score": a.total_score,
            "submitted_at": a.submitted_at
        })
    return results

# =========================
# [FIXED] GET STATION ATTEMPTS LIST
# This was missing and causing the 404 error
# =========================

@router.get("/station_attempts")
def get_station_attempts(exam_attempt_id: int, db: Session = Depends(get_db)):

    attempts = db.query(StationAttempt).filter(
        StationAttempt.exam_attempt_id == exam_attempt_id
    ).all()

    result = []

    for a in attempts:

        # calculate points from rubric_marks
        marks = db.query(RubricMark).filter(
            RubricMark.station_attempt_id == a.id
        ).all()

        total_points = sum(m.points for m in marks if m.points is not None)

        result.append({
            "station_attempt_id": a.id,
            "exam_attempt_id": a.exam_attempt_id,
            "station_id": a.station_id,
            "points": total_points,   # FIXED
            "status": a.status.value if a.status else None,
            "started_at": a.started_at,
            "submitted_at": a.submitted_at,
        })

    return result

# =========================
# Station attempt info
# =========================
@router.get("/station_attempt_info")
def station_attempt_info(
    exam_attempt_id: int,
    station_id: int,
    db: Session = Depends(get_db),
):
    sa = (
        db.query(StationAttempt)
        .filter(
            StationAttempt.exam_attempt_id == exam_attempt_id,
            StationAttempt.station_id == station_id,
        )
        .first()
    )

    if not sa:
        # It's possible the student hasn't started this specific station yet
        # checking if exam attempt exists at least
        return None

    student_name = None
    student_id = None

    if sa.exam_attempt and sa.exam_attempt.user_id:
        user = db.query(User).filter(User.id == sa.exam_attempt.user_id).first()
        if user:
            student_name = user.full_name
            student_id = user.id

    return {
        "station_attempt_id": sa.id,
        "station_id": sa.station_id,
        "exam_attempt_id": sa.exam_attempt_id,
        "student_id": student_id,
        "student_name": student_name,
        "status": sa.status.value if sa.status else None,
    }

# =========================
# SAVE GRADING
# =========================
@router.post("/{station_attempt_id}/rubrics")
def save_station_grade(
    station_attempt_id: int,
    payload: SaveGradePayload,
    db: Session = Depends(get_db),
):

    sa = db.query(StationAttempt).filter(
        StationAttempt.id == station_attempt_id
    ).first()

    if not sa:
        raise HTTPException(404, "Station attempt not found")

    # delete old rubric marks
    db.query(RubricMark).filter(
        RubricMark.station_attempt_id == station_attempt_id
    ).delete(synchronize_session=False)

    total_score = 0

    # insert rubric marks
    for r in payload.rubrics:

        pts = r.points if r.points else 0

        mark = RubricMark(
            station_attempt_id=station_attempt_id,
            rubric_id=r.rubric_id,
            met=r.met,
            points=pts
        )

        db.add(mark)
        total_score += float(pts)
        
    # delete previous feedback
    db.query(Feedback).filter(
        Feedback.station_attempt_id == station_attempt_id
    ).delete(synchronize_session=False)

    if payload.feedback:
        fb = Feedback(
            station_attempt_id=station_attempt_id,
            text=payload.feedback,
            teacher_id=1
        )
        db.add(fb)

    # flush new inserts
    db.flush()

    # update station status
    sa.status = AttemptStatus.graded

    exam_attempt_id = sa.exam_attempt_id

    # recalc exam score
    marks = db.query(RubricMark).join(StationAttempt).filter(
        StationAttempt.exam_attempt_id == exam_attempt_id
    ).all()

    exam_total = sum(float(p.points) for p in marks if p.points is not None)    
    ea = db.query(ExamAttempt).filter(
        ExamAttempt.id == exam_attempt_id
    ).first()

    if not ea:
        raise HTTPException(404, "Exam attempt not found")

    ea.total_score = exam_total

    # check if all stations graded
    stations = db.query(StationAttempt).filter(
    StationAttempt.exam_attempt_id == exam_attempt_id
    ).all()

    all_graded = all(s.status == AttemptStatus.graded for s in stations)

    if all_graded:
        ea.status = AttemptStatus.graded
        ea.graded_at = datetime.utcnow()
    else:
        ea.status = AttemptStatus.submitted

    db.commit()

    db.refresh(sa)
    db.refresh(ea)

    return {
        "station_attempt_id": station_attempt_id,
        "station_score": total_score,
        "exam_total_score": exam_total,
        "exam_status": ea.status.value
    }
# =========================
# UPDATE EXAM ATTEMPT TOTAL SCORE
# =========================
@router.post("/exam/{exam_attempt_id}")
def update_exam_attempt(
    exam_attempt_id: int,
    payload: GradeUpdate,
    db: Session = Depends(get_db),
):
    ea = db.query(ExamAttempt).filter(
        ExamAttempt.id == exam_attempt_id
    ).first()

    if not ea:
        raise HTTPException(404, "Exam attempt not found")

    try:
        # Map string status to Enum
        ea.status = payload.status
    except KeyError:
        raise HTTPException(400, "Invalid exam status")

    if payload.status == "graded":
        ea.graded_at = datetime.utcnow()

    # Recalculate total score from all station attempts
    total = (
        db.query(RubricMark.points)
        .join(StationAttempt)
        .filter(StationAttempt.exam_attempt_id == exam_attempt_id)
        .all()
    )
    ea.total_score = sum(p[0] for p in total if p[0] is not None)

    db.commit()
    db.refresh(ea)

    return {
        "exam_attempt_id": ea.id,
        "status": ea.status.value,
        "total_score": ea.total_score,
    }

@router.get("/station/{station_attempt_id}")
def get_station_detail(station_attempt_id: int, db: Session = Depends(get_db)):
    try:
        station_attempt = db.query(StationAttempt).filter(
            StationAttempt.id == station_attempt_id
        ).first()

        if not station_attempt:
            raise HTTPException(status_code=404, detail="Station attempt not found")

        # -----------------------
        # Answers
        # -----------------------
        answers = db.query(Answer).filter(
            Answer.station_attempt_id == station_attempt_id
        ).all()

        answer_list = [
            {
                "id": a.id,
                "question_id": a.question_id,
                "value_text": a.value_text,
                "choice_index": a.choice_index,
                "created_at": a.created_at,
            }
            for a in answers
        ]

        # -----------------------
        # Chat messages
        # -----------------------
        chats = db.query(ChatMessage).filter(
            ChatMessage.station_attempt_id == station_attempt_id
        ).order_by(ChatMessage.created_at.asc()).all()

        chat_list = [
            {
                "id": c.id,
                "side": c.side,
                "content": c.content,
                "created_at": c.created_at,
            }
            for c in chats
        ]

        # -----------------------
        # Rubrics for this station
        # -----------------------
        # Get rubrics for this station
        rubrics = db.query(Rubric).filter(
            Rubric.station_id == station_attempt.station_id
        ).all()

        rubric_marks = db.query(RubricMark).filter(
    RubricMark.station_attempt_id == station_attempt_id
        ).all()

        marks_map = {m.rubric_id: m for m in rubric_marks}

        rubric_list = []

        for r in rubrics:

            mark = marks_map.get(r.id)

            rubric_list.append({
                "id": r.id,
                "title": r.title,
                "max_points": r.max_points,
                "met": mark.met if mark else False,
                "points": mark.points if mark else 0,
                "comment": ""
            })

        return {
            "station_attempt_id": station_attempt.id,
            "exam_attempt_id": station_attempt.exam_attempt_id,
            "station_id": station_attempt.station_id,
            "answers": answer_list,
            "messages": chat_list,
            "rubrics": rubric_list   
        }

    except Exception as e:
        print("STATION DETAIL ERROR:", str(e))
        raise HTTPException(status_code=500, detail=str(e))
