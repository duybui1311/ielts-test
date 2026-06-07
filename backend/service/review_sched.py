"""Spaced-repetition scheduling for the review queue.

A question a student gets wrong (in an exam or a practice drill) is enqueued to
resurface in 1 day. Each review then doubles the interval on success (1→2→4→8→16,
capped at 30 days) or resets it to 1 day on failure. Callers commit the session.
"""
from datetime import datetime, timedelta

from . import models

MAX_INTERVAL_DAYS = 30


def enqueue_wrong(db, user_id: int, question_id: int) -> None:
    """Add a wrong question to the user's review queue (no-op if already queued)."""
    existing = (
        db.query(models.ReviewQueue)
        .filter(
            models.ReviewQueue.user_id == user_id,
            models.ReviewQueue.question_id == question_id,
        )
        .first()
    )
    if existing:
        return
    now = datetime.utcnow()
    db.add(models.ReviewQueue(
        user_id=user_id,
        question_id=question_id,
        due_date=now + timedelta(days=1),
        interval_days=1,
        created_at=now,
    ))


def apply_result(db, rq: models.ReviewQueue, correct: bool) -> None:
    """Advance (or reset) a review item's schedule and record the attempt."""
    now = datetime.utcnow()
    if correct:
        rq.interval_days = min(rq.interval_days * 2, MAX_INTERVAL_DAYS)
    else:
        rq.interval_days = 1
    rq.due_date = now + timedelta(days=rq.interval_days)
    db.add(models.ReviewHistory(
        user_id=rq.user_id,
        question_id=rq.question_id,
        correct=correct,
        created_at=now,
    ))
