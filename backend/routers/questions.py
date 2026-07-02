"""Per-question helpers — currently the on-demand explanation generator.

Generates a plain-language explanation (with supporting passage sentences) for a
Reading/Listening question that was imported before explanations existed, and
caches it on the Question row so it's only ever generated once.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import get_current_user, require_role
from backend.service.explain import generate_for_question
from backend.service.ratelimit import rate_limit

router = APIRouter(prefix="/api/questions", tags=["questions"])

# Guard the paid Gemini call: 20 explanations/min per user.
_explain_limiter = rate_limit(20, 60)
_teacher = require_role("teacher", "admin")


def _question_payload(q: models.Question, mistake_note: str = "") -> dict:
    return {
        "id": q.id,
        "explanation": q.explanation,
        "support_sentences": q.support_sentences or [],
        "paraphrases": q.paraphrases or [],
        "mistake_note": mistake_note,
    }


class ExplainIn(BaseModel):
    # The student's own (incorrect) answer. When present, the response includes a
    # personalized `mistake_note` addressing that specific answer.
    student_answer: Optional[str] = None


@router.post("/{question_id}/explain")
def explain_question(
    question_id: int,
    payload: Optional[ExplainIn] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _rl: None = Depends(_explain_limiter),
):
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")

    student_answer = (payload.student_answer or "").strip() if payload else ""

    # Cached and nothing personalized to add — return it (generate once).
    # Questions explained before the paraphrase feature regenerate once to
    # backfill the paraphrase map.
    if q.explanation and q.paraphrases is not None and not student_answer:
        return _question_payload(q)

    # Only auto-gradable Reading/Listening questions get explanations.
    qtype = q.qtype.value
    if qtype == "explain":
        raise HTTPException(400, "Writing/Speaking tasks are not auto-explained.")

    station = db.query(models.Station).filter(models.Station.id == q.station_id).first()
    passage = station.case.body_md if station and station.case else ""
    skill = station.skill if station else None

    result = generate_for_question(q, passage, skill, student_answer or None)
    # Cache the generic parts on the question; the mistake note is per-student
    # and returned fresh, never cached. Keep an existing (possibly teacher-
    # reviewed) explanation over a regenerated one.
    if not q.explanation:
        q.explanation = result["explanation"]
        q.support_sentences = result["support_sentences"]
    if q.paraphrases is None:
        q.paraphrases = result["paraphrases"]
    db.commit()
    return _question_payload(q, mistake_note=result["mistake_note"])


class ReportIn(BaseModel):
    reason: Optional[str] = None


@router.post("/{question_id}/report-explanation")
def report_explanation(
    question_id: int,
    payload: Optional[ReportIn] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Flag a question's AI explanation as wrong. Recorded for teacher review."""
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")
    reason = (((payload.reason if payload else None) or "").strip()[:500]) or None
    db.add(models.ExplanationReport(question_id=question_id, user_id=user.id, reason=reason))
    db.commit()
    return {"ok": True}


@router.get("/explanation-reports")
def list_explanation_reports(
    db: Session = Depends(get_db),
    user: models.User = Depends(_teacher),
):
    """Teacher view: questions whose explanations were flagged, newest first."""
    rows = (
        db.query(models.ExplanationReport)
        .order_by(models.ExplanationReport.created_at.desc())
        .all()
    )
    out = []
    for r in rows:
        q = db.query(models.Question).filter(models.Question.id == r.question_id).first()
        out.append({
            "id": r.id,
            "question_id": r.question_id,
            "prompt": q.prompt if q else None,
            "explanation": q.explanation if q else None,
            "reason": r.reason,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return out
