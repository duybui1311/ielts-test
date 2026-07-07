"""Tests for the post-grading learning loop:
- backend.service.review_sched — spaced-repetition scheduling.
- backend.service.subskills   — per-sub-skill accuracy aggregation / heatmap.
"""
from datetime import datetime, timedelta, timezone

from backend.service import models
from backend.service.review_sched import enqueue_wrong, apply_result, MAX_INTERVAL_DAYS
from backend.service.subskills import subskill_tallies, heatmap, SUB_SKILLS, MIN_ATTEMPTS
from tests import factories as f


def _a_question(db):
    owner = f.make_user(db, role=models.UserRole.teacher)
    exam = f.make_exam(db, owner)
    station = f.make_station(db, exam, owner)
    return f.make_question(db, station, models.QuestionType.mcq, correct_index=1)


# ----------------------------- review_sched -----------------------------

def test_enqueue_wrong_schedules_one_day_out(db_session):
    student = f.make_user(db_session)
    q = _a_question(db_session)

    enqueue_wrong(db_session, student.id, q.id)
    db_session.flush()

    rows = db_session.query(models.ReviewQueue).all()
    assert len(rows) == 1
    rq = rows[0]
    assert rq.interval_days == 1
    assert rq.due_date.date() == (datetime.now(timezone.utc) + timedelta(days=1)).date()


def test_enqueue_wrong_is_idempotent(db_session):
    student = f.make_user(db_session)
    q = _a_question(db_session)

    enqueue_wrong(db_session, student.id, q.id)
    db_session.flush()
    enqueue_wrong(db_session, student.id, q.id)  # already queued -> no-op
    db_session.flush()

    assert db_session.query(models.ReviewQueue).count() == 1


def test_apply_result_correct_doubles_interval_and_logs(db_session):
    student = f.make_user(db_session)
    q = _a_question(db_session)
    enqueue_wrong(db_session, student.id, q.id)
    db_session.flush()
    rq = db_session.query(models.ReviewQueue).one()

    apply_result(db_session, rq, correct=True)
    db_session.flush()

    assert rq.interval_days == 2
    assert rq.due_date.date() == (datetime.now(timezone.utc) + timedelta(days=2)).date()
    history = db_session.query(models.ReviewHistory).all()
    assert len(history) == 1
    assert history[0].correct is True
    assert history[0].question_id == q.id


def test_apply_result_caps_interval(db_session):
    student = f.make_user(db_session)
    q = _a_question(db_session)
    enqueue_wrong(db_session, student.id, q.id)
    db_session.flush()
    rq = db_session.query(models.ReviewQueue).one()

    rq.interval_days = 20
    apply_result(db_session, rq, correct=True)   # 20*2=40 -> capped
    assert rq.interval_days == MAX_INTERVAL_DAYS == 30

    apply_result(db_session, rq, correct=True)   # stays capped
    assert rq.interval_days == 30


def test_apply_result_wrong_resets_interval(db_session):
    student = f.make_user(db_session)
    q = _a_question(db_session)
    enqueue_wrong(db_session, student.id, q.id)
    db_session.flush()
    rq = db_session.query(models.ReviewQueue).one()
    rq.interval_days = 16

    apply_result(db_session, rq, correct=False)
    db_session.flush()

    assert rq.interval_days == 1
    assert rq.due_date.date() == (datetime.now(timezone.utc) + timedelta(days=1)).date()
    history = db_session.query(models.ReviewHistory).one()
    assert history.correct is False


# ------------------------------- subskills -------------------------------

def _graded_setup(db):
    """A teacher, a student, and a single reading station-attempt to hang
    graded answers off of. Returns (student, station, station_attempt)."""
    owner = f.make_user(db, role=models.UserRole.teacher)
    student = f.make_user(db)
    exam = f.make_exam(db, owner)
    station = f.make_station(db, exam, owner, skill="reading")
    ea = f.make_attempt(db, exam, student)
    sa = f.make_station_attempt(db, ea, station)
    return student, station, sa


def _add_graded(db, station, sa, sub_skill, correct, order):
    q = f.make_question(db, station, models.QuestionType.mcq, correct_index=1,
                        sub_skill=sub_skill, display_order=order)
    a = f.make_answer(db, sa, q, choice_index=1)
    a.is_auto_correct = correct
    db.flush()


def test_heatmap_covers_every_subskill_with_labels(db_session):
    student, _, _ = _graded_setup(db_session)
    rows = heatmap(db_session, [student.id])

    assert [r["sub_skill"] for r in rows] == SUB_SKILLS
    by_skill = {r["sub_skill"]: r for r in rows}
    assert by_skill["multiple_choice"]["label"] == "Multiple Choice"
    # No data yet -> zeroed counts and accuracy withheld.
    assert by_skill["multiple_choice"]["attempted"] == 0
    assert by_skill["multiple_choice"]["accuracy"] is None


def test_accuracy_requires_minimum_attempts(db_session):
    student, station, sa = _graded_setup(db_session)
    # multiple_choice: 3 attempts (>= MIN_ATTEMPTS), 2 correct -> 67%.
    _add_graded(db_session, station, sa, "multiple_choice", True, 1)
    _add_graded(db_session, station, sa, "multiple_choice", True, 2)
    _add_graded(db_session, station, sa, "multiple_choice", False, 3)
    # gap_fill: only 2 attempts (< MIN_ATTEMPTS) -> accuracy withheld.
    _add_graded(db_session, station, sa, "gap_fill", True, 4)
    _add_graded(db_session, station, sa, "gap_fill", True, 5)

    assert MIN_ATTEMPTS == 3
    by_skill = {r["sub_skill"]: r for r in heatmap(db_session, [student.id])}

    assert by_skill["multiple_choice"]["attempted"] == 3
    assert by_skill["multiple_choice"]["correct"] == 2
    assert by_skill["multiple_choice"]["accuracy"] == 67

    assert by_skill["gap_fill"]["attempted"] == 2
    assert by_skill["gap_fill"]["accuracy"] is None


def test_tallies_combine_exam_answers_and_practice_sessions(db_session):
    student, station, sa = _graded_setup(db_session)
    # One graded exam answer for gap_fill (1 attempt, correct)...
    _add_graded(db_session, station, sa, "gap_fill", True, 1)
    # ...plus a practice drill on the same sub_skill (4 attempts, 3 correct).
    db_session.add(models.PracticeSession(
        user_id=student.id, sub_skill="gap_fill", total=4, correct=3))
    db_session.flush()

    tallies = subskill_tallies(db_session, [student.id])
    assert tallies["gap_fill"] == {"attempted": 5, "correct": 4}

    by_skill = {r["sub_skill"]: r for r in heatmap(db_session, [student.id])}
    assert by_skill["gap_fill"]["accuracy"] == 80   # round(4/5 * 100)


def test_no_users_yields_empty_tallies_and_blank_heatmap(db_session):
    assert subskill_tallies(db_session, []) == {}
    rows = heatmap(db_session, [])
    assert len(rows) == len(SUB_SKILLS)
    assert all(r["accuracy"] is None and r["attempted"] == 0 for r in rows)
