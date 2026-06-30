"""Per-question helpers — currently the on-demand explanation generator.

Generates a plain-language explanation (with supporting passage sentences) for a
Reading/Listening question that was imported before explanations existed, and
caches it on the Question row so it's only ever generated once.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.service.database import get_db
from backend.service import models
from backend.service.auth_deps import get_current_user
from backend.service.explain import generate_for_question
from backend.service.ratelimit import rate_limit

router = APIRouter(prefix="/api/questions", tags=["questions"])

# Guard the paid Gemini call: 20 explanations/min per user.
_explain_limiter = rate_limit(20, 60)


def _question_payload(q: models.Question) -> dict:
    return {
        "id": q.id,
        "explanation": q.explanation,
        "support_sentences": q.support_sentences or [],
    }


@router.post("/{question_id}/explain")
def explain_question(
    question_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
    _rl: None = Depends(_explain_limiter),
):
    q = db.query(models.Question).filter(models.Question.id == question_id).first()
    if not q:
        raise HTTPException(404, "Question not found")

    # Already cached — return it (generate once).
    if q.explanation:
        return _question_payload(q)

    # Only auto-gradable Reading/Listening questions get explanations.
    qtype = q.qtype.value
    if qtype == "explain":
        raise HTTPException(400, "Writing/Speaking tasks are not auto-explained.")

    station = db.query(models.Station).filter(models.Station.id == q.station_id).first()
    passage = station.case.body_md if station and station.case else ""
    skill = station.skill if station else None

    result = generate_for_question(q, passage, skill)
    q.explanation = result["explanation"]
    q.support_sentences = result["support_sentences"]
    db.commit()
    return _question_payload(q)
