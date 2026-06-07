"""Student dashboard — aggregates the signed-in student's own activity.

The student is taken from the verified JWT. Every query degrades to empty/zero
so the page renders cleanly for a brand-new account.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import get_current_user
from backend.service.subskills import heatmap as subskill_heatmap

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

_GRADED = (models.AttemptStatus.submitted, models.AttemptStatus.graded)


@router.get("")
def student_dashboard(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    uid = user.id
    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.user_id == uid)
        .order_by(models.ExamAttempt.started_at.desc())
        .all()
    )

    graded = [a for a in attempts if a.status in _GRADED]
    bands = [a.overall_band for a in graded if a.overall_band is not None]

    # Writing & Speaking are graded manually by teachers; surface the reviewed
    # submissions (those with a band) alongside the auto-graded Reading/Listening
    # results so the dashboard reflects all four skills.
    writing_subs = (
        db.query(models.WritingSubmission)
        .filter(models.WritingSubmission.user_id == uid)
        .order_by(models.WritingSubmission.created_at.desc())
        .all()
    )
    speaking_subs = (
        db.query(models.SpeakingSubmission)
        .filter(models.SpeakingSubmission.user_id == uid)
        .order_by(models.SpeakingSubmission.created_at.desc())
        .all()
    )

    productive = [
        {
            "kind": "writing",
            "title": s.task.title if s.task else "Writing task",
            "band": s.band,
            "feedback": s.feedback,
            "status": s.status,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        }
        for s in writing_subs
    ] + [
        {
            "kind": "speaking",
            "title": s.task.title if s.task else "Speaking task",
            "band": s.band,
            "feedback": s.feedback,
            "status": s.status,
            "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
        }
        for s in speaking_subs
    ]

    # Bands from reviewed Writing/Speaking feed the overall average and the trend.
    prod_bands = [p["band"] for p in productive if p["band"] is not None]
    bands = bands + prod_bands

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

    # band_trend: oldest -> newest so the chart reads left to right. Includes
    # auto-graded exams plus reviewed Writing/Speaking submissions.
    trend_points = [
        (a.graded_at or a.started_at, a.exam.name if a.exam else f"Attempt {a.id}", a.overall_band)
        for a in graded
        if a.overall_band is not None
    ] + [
        (s.reviewed_at or s.created_at, s.task.title if s.task else "Writing task", s.band)
        for s in writing_subs
        if s.band is not None
    ] + [
        (s.reviewed_at or s.created_at, s.task.title if s.task else "Speaking task", s.band)
        for s in speaking_subs
        if s.band is not None
    ]
    trend = [
        {"label": label, "band": band}
        for _, label, band in sorted(trend_points, key=lambda x: x[0])
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
        "heatmap": subskill_heatmap(db, [uid]),
        "productive": productive,
    }
