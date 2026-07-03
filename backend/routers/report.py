"""Printable student progress report.

One endpoint that assembles everything a parent-facing report needs. A student
can fetch their own report; a teacher can fetch reports for students enrolled
in classes they own; admins are unrestricted.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import get_current_user
from backend.service.scoping import visible_student_ids
from backend.service.subskills import heatmap as subskill_heatmap

router = APIRouter(prefix="/api/report", tags=["report"])

_GRADED = (models.AttemptStatus.submitted, models.AttemptStatus.graded)


@router.get("/student/{user_id}")
def student_report(
    user_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.id != user_id:
        allowed = visible_student_ids(db, user)   # None = admin
        if allowed is not None and user_id not in allowed:
            raise HTTPException(403, "You can only view reports for students in your classes.")

    student = db.query(models.User).filter(models.User.id == user_id).first()
    if not student:
        raise HTTPException(404, "Student not found")

    attempts = (
        db.query(models.ExamAttempt)
        .filter(
            models.ExamAttempt.user_id == user_id,
            models.ExamAttempt.status.in_(_GRADED),
        )
        .order_by(models.ExamAttempt.submitted_at.asc())
        .all()
    )
    tests = []
    for a in attempts:
        exam = a.exam
        skills = {}
        for sa in a.station_attempts:
            if sa.band is not None and sa.station and sa.station.skill:
                skills.setdefault(sa.station.skill, sa.band)
        tests.append({
            "exam_name": exam.name if exam else f"Test {a.exam_id}",
            "is_mock": bool(exam and exam.exam_type == models.ExamType.exam),
            "date": a.submitted_at.isoformat() if a.submitted_at else None,
            "overall_band": a.overall_band,
            "skill_bands": skills,
        })

    def _reviewed(model, kind):
        subs = (
            db.query(model)
            .filter(model.user_id == user_id, model.band.isnot(None))
            .order_by(model.created_at.asc())
            .all()
        )
        return [{
            "kind": kind,
            "title": s.task.title if s.task else kind.title(),
            "band": s.band,
            "date": s.reviewed_at.isoformat() if s.reviewed_at else None,
        } for s in subs]

    productive = _reviewed(models.WritingSubmission, "writing") + \
        _reviewed(models.SpeakingSubmission, "speaking")

    all_bands = [t["overall_band"] for t in tests if t["overall_band"] is not None] + \
        [p["band"] for p in productive]

    return {
        "student": {
            "id": student.id,
            "name": student.full_name or student.username or student.email,
            "email": student.email,
        },
        "average_band": round(sum(all_bands) / len(all_bands), 1) if all_bands else None,
        "tests": tests,
        "productive": productive,
        "heatmap": subskill_heatmap(db, [user_id]),
    }
