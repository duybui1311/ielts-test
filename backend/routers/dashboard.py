"""Student dashboard — aggregates the signed-in student's own activity.

Reads the user id from the `X-User-Id` header (test-version auth). Every query
degrades to empty/zero so the page renders cleanly for a brand-new account.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Header
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_GRADED = (models.AttemptStatus.submitted, models.AttemptStatus.graded)


def _user_id(x_user_id: Optional[str]) -> Optional[int]:
    try:
        return int(x_user_id) if x_user_id else None
    except (TypeError, ValueError):
        return None


@router.get("")
def student_dashboard(
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    uid = _user_id(x_user_id)
    empty = {
        "kpis": {"tests_taken": 0, "avg_band": None, "questions_answered": 0, "top_weakness": None},
        "band_trend": [],
        "recent": [],
        "weakness": [],
    }
    if not uid:
        return empty

    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.user_id == uid)
        .order_by(models.ExamAttempt.started_at.desc())
        .all()
    )

    graded = [a for a in attempts if a.status in _GRADED]
    bands = [a.overall_band for a in graded if a.overall_band is not None]

    questions_answered = (
        db.query(func.count(models.Answer.id))
        .join(models.StationAttempt, models.Answer.station_attempt_id == models.StationAttempt.id)
        .join(models.ExamAttempt, models.StationAttempt.exam_attempt_id == models.ExamAttempt.id)
        .filter(models.ExamAttempt.user_id == uid)
        .scalar()
    ) or 0

    weakness_rows = (
        db.query(models.ErrorTag.sub_skill, func.count().label("misses"))
        .filter(models.ErrorTag.user_id == uid)
        .group_by(models.ErrorTag.sub_skill)
        .order_by(func.count().desc())
        .all()
    )
    weakness = [
        {"name": (r[0] or "unknown"), "misses": r[1]}
        for r in weakness_rows
    ]

    # band_trend: oldest -> newest so the chart reads left to right
    trend = [
        {"label": a.exam.name if a.exam else f"Attempt {a.id}", "band": a.overall_band}
        for a in sorted(graded, key=lambda x: x.graded_at or x.started_at)
        if a.overall_band is not None
    ]

    recent = [
        {
            "attempt_id": a.id,
            "exam_name": a.exam.name if a.exam else f"Attempt {a.id}",
            "status": a.status.value,
            "overall_band": a.overall_band,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        }
        for a in attempts[:6]
    ]

    return {
        "kpis": {
            "tests_taken": len(graded),
            "avg_band": round(sum(bands) / len(bands), 1) if bands else None,
            "questions_answered": int(questions_answered),
            "top_weakness": weakness[0]["name"] if weakness else None,
        },
        "band_trend": trend,
        "recent": recent,
        "weakness": weakness,
    }
