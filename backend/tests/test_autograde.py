"""Tests for backend.service.autograde — the core Reading/Listening grader."""
from backend.service import models
from backend.service.autograde import (
    raw_to_band,
    _norm,
    autograde_station_attempt,
    autograde_exam_attempt,
)
from backend.tests import factories as f


# ----------------------------- raw_to_band -----------------------------

def test_raw_to_band_full_marks_is_nine():
    assert raw_to_band(40, 40, "reading") == 9.0
    assert raw_to_band(40, 40, "listening") == 9.0


def test_raw_to_band_zero_falls_through_to_floor():
    # No threshold matched -> the 2.5 floor.
    assert raw_to_band(0, 40, "reading") == 2.5


def test_raw_to_band_scales_to_forty():
    # 20/20 scales up to 40/40 -> band 9.0, proving the raw is rescaled to /40.
    assert raw_to_band(20, 20, "reading") == 9.0


def test_raw_to_band_zero_total_is_safe():
    # Guard against division by zero when a station has no autogradable items.
    assert raw_to_band(5, 0, "reading") == 2.5


def test_raw_to_band_listening_and_reading_tables_differ():
    # At scaled score 15 the two tables diverge: reading 5.0 vs listening 4.5.
    assert raw_to_band(15, 40, "reading") == 5.0
    assert raw_to_band(15, 40, "listening") == 4.5


# -------------------------------- _norm --------------------------------

def test_norm_lowercases_and_collapses_whitespace():
    assert _norm("  The   Quick  Brown ") == "the quick brown"


def test_norm_handles_none():
    assert _norm(None) == ""


# ------------------------ station/exam grading -------------------------

def _reading_station_with_answers(db, owner, student, choice, short_value):
    """One reading station: an MCQ (correct_index=1), a short answer
    (accepts 'paris'), and an 'explain' question that must be ignored. Returns
    the station_attempt with the given student answers attached."""
    exam = f.make_exam(db, owner)
    station = f.make_station(db, exam, owner, skill="reading")
    q_mcq = f.make_question(db, station, models.QuestionType.mcq, correct_index=1,
                            sub_skill="multiple_choice", display_order=1)
    q_short = f.make_question(db, station, models.QuestionType.short,
                              accept_answers=["Paris", "paris city"],
                              sub_skill="short_answer", display_order=2)
    q_explain = f.make_question(db, station, models.QuestionType.explain,
                                display_order=3)

    ea = f.make_attempt(db, exam, student)
    sa = f.make_station_attempt(db, ea, station)
    f.make_answer(db, sa, q_mcq, choice_index=choice)
    f.make_answer(db, sa, q_short, value_text=short_value)
    # An answer on the explain question — grader must skip it (writing -> AI).
    f.make_answer(db, sa, q_explain, value_text="an essay")
    db.flush()
    return sa, q_mcq


def test_station_all_correct_scores_full_band(db_session):
    owner = f.make_user(db_session, role=models.UserRole.teacher)
    student = f.make_user(db_session)
    sa, _ = _reading_station_with_answers(db_session, owner, student,
                                          choice=1, short_value="  PARIS ")

    result = autograde_station_attempt(db_session, sa.id)

    assert result == {"raw_score": 2, "total": 2, "band": 9.0}
    db_session.refresh(sa)
    assert sa.status == models.AttemptStatus.graded
    assert sa.raw_score == 2.0
    # No mistakes -> no error tags and nothing queued for spaced review.
    assert db_session.query(models.ErrorTag).count() == 0
    assert db_session.query(models.ReviewQueue).count() == 0


def test_station_wrong_answers_tag_errors_and_enqueue_review(db_session):
    owner = f.make_user(db_session, role=models.UserRole.teacher)
    student = f.make_user(db_session)
    # Wrong MCQ choice; short answer that does not match the accept list.
    sa, q_mcq = _reading_station_with_answers(db_session, owner, student,
                                              choice=0, short_value="London")

    result = autograde_station_attempt(db_session, sa.id)

    assert result["raw_score"] == 0
    assert result["total"] == 2

    answers = {a.question_id: a for a in
               db_session.query(models.Answer).filter(
                   models.Answer.station_attempt_id == sa.id).all()}
    assert answers[q_mcq.id].is_auto_correct is False
    assert answers[q_mcq.id].auto_score == 0.0

    # One ErrorTag per wrong autogradable answer (the explain one is skipped).
    tags = db_session.query(models.ErrorTag).all()
    assert len(tags) == 2
    assert {t.sub_skill for t in tags} == {"multiple_choice", "short_answer"}

    # Both missed questions are queued for spaced review.
    assert db_session.query(models.ReviewQueue).count() == 2


def test_station_regrade_replaces_old_error_tags(db_session):
    owner = f.make_user(db_session, role=models.UserRole.teacher)
    student = f.make_user(db_session)
    sa, _ = _reading_station_with_answers(db_session, owner, student,
                                          choice=0, short_value="London")

    autograde_station_attempt(db_session, sa.id)
    autograde_station_attempt(db_session, sa.id)  # regrade

    # Tags are deleted and rewritten each run, never duplicated.
    assert db_session.query(models.ErrorTag).count() == 2


def test_station_attempt_missing_returns_none(db_session):
    assert autograde_station_attempt(db_session, 999999) is None


def test_exam_attempt_averages_bands_to_nearest_half(db_session):
    owner = f.make_user(db_session, role=models.UserRole.teacher)
    student = f.make_user(db_session)
    exam = f.make_exam(db_session, owner)
    ea = f.make_attempt(db_session, exam, student)

    # Station 1: 2 MCQs all correct -> band 9.0.
    st1 = f.make_station(db_session, exam, owner, skill="reading", position=1)
    sa1 = f.make_station_attempt(db_session, ea, st1)
    for i in range(2):
        q = f.make_question(db_session, st1, models.QuestionType.mcq,
                            correct_index=1, display_order=i + 1)
        f.make_answer(db_session, sa1, q, choice_index=1)

    # Station 2: 8 MCQs, 7 correct -> scaled 35/40 -> band 8.0.
    st2 = f.make_station(db_session, exam, owner, skill="reading", position=2)
    sa2 = f.make_station_attempt(db_session, ea, st2)
    for i in range(8):
        q = f.make_question(db_session, st2, models.QuestionType.mcq,
                            correct_index=1, display_order=i + 1)
        f.make_answer(db_session, sa2, q, choice_index=1 if i < 7 else 0)
    db_session.flush()

    autograde_exam_attempt(db_session, ea.id)

    db_session.refresh(ea)
    # mean(9.0, 8.0) == 8.5, already on the half-band grid.
    assert ea.overall_band == 8.5
    assert ea.status == models.AttemptStatus.graded
    assert ea.graded_at is not None


def test_exam_attempt_missing_returns_none(db_session):
    assert autograde_exam_attempt(db_session, 999999) is None
