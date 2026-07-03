"""Teacher dashboard — classes, exams and recent student submissions.

Owner-scoped via the verified JWT (teacher/admin). Degrades to empty
structures so the page renders for a teacher with no classes yet.
"""
from collections import defaultdict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models, scoping
from backend.service.auth_deps import require_role
from backend.service.subskills import heatmap as subskill_heatmap

router = APIRouter(prefix="/api/teacher", tags=["teacher"])

_GRADED = (models.AttemptStatus.submitted, models.AttemptStatus.graded)


def _avg(values):
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


@router.get("/classes")
def teacher_classes(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_role("teacher", "admin")),
):
    uid = user.id
    classes = (
        db.query(models.Class)
        .filter(models.Class.owner_id == uid)
        .order_by(models.Class.name.asc())
        .all()
    )
    counts = {
        cid: n for cid, n in (
            db.query(models.ClassEnrolment.class_id, func.count(models.ClassEnrolment.id))
            .filter(models.ClassEnrolment.class_id.in_([c.id for c in classes] or [0]))
            .group_by(models.ClassEnrolment.class_id)
            .all()
        )
    }
    members = {}
    if classes:
        rows = (
            db.query(models.ClassEnrolment.class_id, models.User)
            .join(models.User, models.ClassEnrolment.user_id == models.User.id)
            .filter(models.ClassEnrolment.class_id.in_([c.id for c in classes]))
            .all()
        )
        for cid, u in rows:
            members.setdefault(cid, []).append(
                {"id": u.id, "name": u.full_name or u.username or u.email})
    return [
        {"id": c.id, "name": c.name, "join_code": c.join_code,
         "students": counts.get(c.id, 0),
         "members": members.get(c.id, [])}
        for c in classes
    ]


class ClassIn(BaseModel):
    name: str


@router.post("/classes", status_code=201)
def create_class(
    payload: ClassIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_role("teacher", "admin")),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(400, "The class needs a name.")
    klass = models.Class(name=name, owner_id=user.id, join_code=scoping.new_join_code())
    db.add(klass)
    db.commit()
    return {"id": klass.id, "name": klass.name, "join_code": klass.join_code, "students": 0}


@router.get("/dashboard")
def teacher_dashboard(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_role("teacher", "admin")),
):
    uid = user.id
    empty = {
        "kpis": {"classes": 0, "students": 0, "exams": 0, "to_review": 0},
        "classes": [],
        "band_trend": [],
        "recent_submissions": [],
        "heatmap": [],
    }
    classes = db.query(models.Class).filter(models.Class.owner_id == uid).all()
    if not classes:
        return empty

    class_ids = [c.id for c in classes]
    student_ids = [
        e.user_id
        for e in db.query(models.ClassEnrolment)
        .filter(models.ClassEnrolment.class_id.in_(class_ids))
        .all()
    ]
    exams = db.query(models.Exam).filter(models.Exam.class_id.in_(class_ids)).all()
    exam_ids = [e.id for e in exams]

    attempts = (
        db.query(models.ExamAttempt)
        .filter(models.ExamAttempt.exam_id.in_(exam_ids))
        .all()
        if exam_ids else []
    )
    attempts_by_exam = defaultdict(list)
    for a in attempts:
        attempts_by_exam[a.exam_id].append(a)

    # enrolment counts per class
    students_by_class = defaultdict(int)
    for e in db.query(models.ClassEnrolment).filter(
        models.ClassEnrolment.class_id.in_(class_ids)
    ).all():
        students_by_class[e.class_id] += 1

    exams_by_class = defaultdict(list)
    for e in exams:
        exams_by_class[e.class_id].append(e)

    classes_out = []
    for c in classes:
        ex_out = []
        for e in exams_by_class.get(c.id, []):
            ats = attempts_by_exam.get(e.id, [])
            ex_out.append({
                "id": e.id,
                "name": e.name,
                "attempts": len(ats),
                "avg_band": _avg([a.overall_band for a in ats if a.status in _GRADED]),
            })
        classes_out.append({
            "id": c.id,
            "name": c.name,
            "students": students_by_class.get(c.id, 0),
            "exams": ex_out,
        })

    # band trend: class average overall_band grouped by month
    buckets = defaultdict(list)
    for a in attempts:
        if a.status in _GRADED and a.overall_band is not None:
            when = a.graded_at or a.submitted_at or a.started_at
            if when:
                buckets[when.strftime("%Y-%m")].append(a.overall_band)
    band_trend = [
        {"label": label, "avg": round(sum(v) / len(v), 2)}
        for label, v in sorted(buckets.items())
    ]

    # recent submissions across all owned exams
    user_names = {
        u.id: (u.full_name or u.username or u.email or f"User {u.id}")
        for u in db.query(models.User).all()
    }
    exam_names = {e.id: e.name for e in exams}
    recent = sorted(
        [a for a in attempts if a.status in _GRADED],
        key=lambda x: x.submitted_at or x.started_at,
        reverse=True,
    )[:8]
    recent_submissions = [
        {
            "attempt_id": a.id,
            "student": user_names.get(a.user_id, f"User {a.user_id}"),
            "exam": exam_names.get(a.exam_id, f"Exam {a.exam_id}"),
            "band": a.overall_band,
            "status": a.status.value,
            "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None,
        }
        for a in recent
    ]

    return {
        "kpis": {
            "classes": len(classes),
            "students": sum(students_by_class.values()),
            "exams": len(exams),
            "to_review": sum(1 for a in attempts if a.status == models.AttemptStatus.submitted),
        },
        "classes": classes_out,
        "band_trend": band_trend,
        "recent_submissions": recent_submissions,
        "heatmap": subskill_heatmap(db, student_ids),
    }
