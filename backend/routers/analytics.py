from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import require_role

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_teacher = require_role("teacher", "admin")


@router.get("/student/{user_id}")
def student_patterns(user_id: int, db: Session = Depends(get_db), user: models.User = Depends(_teacher)):
    rows = (
        db.query(models.ErrorTag.skill, models.ErrorTag.sub_skill, func.count().label("misses"))
        .filter(models.ErrorTag.user_id == user_id)
        .group_by(models.ErrorTag.skill, models.ErrorTag.sub_skill)
        .order_by(func.count().desc())
        .all()
    )
    return [{"skill": r[0], "sub_skill": r[1], "misses": r[2]} for r in rows]


@router.get("/class/{class_id}")
def class_patterns(class_id: int, db: Session = Depends(get_db), user: models.User = Depends(_teacher)):
    user_ids = [
        e.user_id
        for e in db.query(models.ClassEnrolment).filter(
            models.ClassEnrolment.class_id == class_id
        ).all()
    ]
    if not user_ids:
        return []
    rows = (
        db.query(models.ErrorTag.sub_skill, func.count().label("misses"))
        .filter(models.ErrorTag.user_id.in_(user_ids))
        .group_by(models.ErrorTag.sub_skill)
        .order_by(func.count().desc())
        .all()
    )
    return [{"sub_skill": r[0], "misses": r[1]} for r in rows]
