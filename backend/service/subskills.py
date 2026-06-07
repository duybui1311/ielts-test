"""Canonical IELTS sub-skill vocabulary + per-sub-skill accuracy aggregation.

The list MUST mirror the importer (ai_import.SUB_SKILLS) and the frontend builder
so analytics, the practice page and the weakness heatmap all line up. Accuracy is
computed from graded exam answers PLUS practice-session tallies, so drilling a
weak type actually moves the heatmap.
"""
from typing import Iterable
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models

# Closed sub_skill vocab — keep in sync with ai_import.SUB_SKILLS and
# frontend/src/pages/CreateNewExam.jsx.
SUB_SKILLS = [
    "multiple_choice", "gap_fill", "true_false_notgiven",
    "matching_headings", "sentence_completion", "short_answer",
]

# Human-friendly labels for the practice cards and heatmap cells.
SUB_SKILL_LABELS = {
    "multiple_choice": "Multiple Choice",
    "gap_fill": "Gap Fill",
    "true_false_notgiven": "True / False / Not Given",
    "matching_headings": "Matching Headings",
    "sentence_completion": "Sentence Completion",
    "short_answer": "Short Answer",
}

# Below this many attempts a cell is "not enough data" (gray).
MIN_ATTEMPTS = 3


def subskill_tallies(db: Session, user_ids: Iterable[int]) -> dict:
    """Return {sub_skill: {"attempted": int, "correct": int}} for the given users,
    combining graded exam answers with practice-session results."""
    user_ids = list(user_ids)
    tallies: dict[str, dict] = {}

    def bump(sub_skill, attempted, correct):
        if not sub_skill:
            return
        t = tallies.setdefault(sub_skill, {"attempted": 0, "correct": 0})
        t["attempted"] += attempted
        t["correct"] += correct

    if not user_ids:
        return tallies

    # Graded exam answers (mcq/short have is_auto_correct set). Tally in Python so
    # we don't depend on a dialect-specific bool->int cast.
    exam_rows = (
        db.query(models.Question.sub_skill, models.Answer.is_auto_correct)
        .join(models.Answer, models.Answer.question_id == models.Question.id)
        .join(models.StationAttempt, models.Answer.station_attempt_id == models.StationAttempt.id)
        .join(models.ExamAttempt, models.StationAttempt.exam_attempt_id == models.ExamAttempt.id)
        .filter(
            models.ExamAttempt.user_id.in_(user_ids),
            models.Answer.is_auto_correct.isnot(None),
        )
        .all()
    )
    for sub_skill, is_correct in exam_rows:
        bump(sub_skill, 1, 1 if is_correct else 0)

    # Practice sessions tally totals/correct per sub_skill.
    practice_rows = (
        db.query(
            models.PracticeSession.sub_skill,
            func.sum(models.PracticeSession.total).label("total"),
            func.sum(models.PracticeSession.correct).label("correct"),
        )
        .filter(models.PracticeSession.user_id.in_(user_ids))
        .group_by(models.PracticeSession.sub_skill)
        .all()
    )
    for sub_skill, total, correct in practice_rows:
        bump(sub_skill, int(total or 0), int(correct or 0))

    return tallies


def heatmap(db: Session, user_ids: Iterable[int]) -> list[dict]:
    """One entry per known sub_skill with accuracy% (None when not enough data)."""
    tallies = subskill_tallies(db, user_ids)
    out = []
    for sk in SUB_SKILLS:
        t = tallies.get(sk, {"attempted": 0, "correct": 0})
        attempted, correct = t["attempted"], t["correct"]
        accuracy = round(correct / attempted * 100) if attempted >= MIN_ATTEMPTS else None
        out.append({
            "sub_skill": sk,
            "label": SUB_SKILL_LABELS.get(sk, sk.replace("_", " ").title()),
            "attempted": attempted,
            "correct": correct,
            "accuracy": accuracy,
        })
    return out
