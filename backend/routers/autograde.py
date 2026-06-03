from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.service.database import get_db
from backend.service.autograde import autograde_station_attempt, autograde_exam_attempt

router = APIRouter(prefix="/api/autograde", tags=["autograde"])


@router.post("/station/{station_attempt_id}")
def grade_station(station_attempt_id: int, db: Session = Depends(get_db)):
    res = autograde_station_attempt(db, station_attempt_id)
    if res is None:
        raise HTTPException(404, "Station attempt not found")
    return res


@router.post("/exam/{exam_attempt_id}")
def grade_exam(exam_attempt_id: int, db: Session = Depends(get_db)):
    ea = autograde_exam_attempt(db, exam_attempt_id)
    if ea is None:
        raise HTTPException(404, "Exam attempt not found")
    return {
        "exam_attempt_id": ea.id,
        "overall_band": ea.overall_band,
        "status": ea.status.value,
    }
