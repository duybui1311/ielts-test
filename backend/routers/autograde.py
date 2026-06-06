from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.service.database import get_db
from backend.service import models
from backend.service.autograde import autograde_station_attempt, autograde_exam_attempt
from backend.service.auth_deps import require_role

router = APIRouter(prefix="/api/autograde", tags=["autograde"])

_teacher = require_role("teacher", "admin")


@router.post("/station/{station_attempt_id}")
def grade_station(station_attempt_id: int, db: Session = Depends(get_db), user: models.User = Depends(_teacher)):
    res = autograde_station_attempt(db, station_attempt_id)
    if res is None:
        raise HTTPException(404, "Station attempt not found")
    return res


@router.post("/exam/{exam_attempt_id}")
def grade_exam(exam_attempt_id: int, db: Session = Depends(get_db), user: models.User = Depends(_teacher)):
    ea = autograde_exam_attempt(db, exam_attempt_id)
    if ea is None:
        raise HTTPException(404, "Exam attempt not found")
    return {
        "exam_attempt_id": ea.id,
        "overall_band": ea.overall_band,
        "status": ea.status.value,
    }
