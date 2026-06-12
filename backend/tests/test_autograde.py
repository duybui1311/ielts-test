"""Comprehensive tests for backend.service.autograde.

Covers raw_to_band (against the REAL LISTENING/READING tables), answer
normalization, MCQ + short-answer scoring, ErrorTag writes, spaced-review
enqueueing, station edge cases, and exam-level aggregation.
"""
from backend.service import models
from backend.service.autograde import (
    raw_to_band,
    _norm,
    autograde_station_attempt,
    autograde_exam_attempt,
)
from backend.tests import factories as f


# =========================== helpers ===========================

def _scaffold(db, skill="reading"):
    """teacher + student + exam + one station(skill) + attempt + station_attempt."""
    owner = f.make_user(db, role=models.UserRole.teacher)
    student = f.make_user(db)
    exam = f.make_exam(db, owner)
    station = f.make_station(db, exam, owner, skill=skill)
    ea = f.make_attempt(db, exam, student)
    sa = f.make_station_attempt(db, ea, station)
    return owner, student, exam, station, ea, sa


def _grade_mcq(db, *, correct_index, choice_index, skill="reading"):
    owner, student, exam, station, ea, sa = _scaffold(db, skill=skill)
    q = f.make_question(db, station, models.QuestionType.mcq,
                        correct_index=correct_index, sub_skill="multiple_choice")
    a = f.make_answer(db, sa, q, choice_index=choice_index)
    db.flush()
    result = autograde_station_attempt(db, sa.id)
    db.refresh(a)
    return result, a


def _grade_short(db, *, accept_answers, value_text, skill="reading"):
    owner, student, exam, station, ea, sa = _scaffold(db, skill=skill)
    q = f.make_question(db, station, models.QuestionType.short,
                        accept_answers=accept_answers, sub_skill="short_answer")
    a = f.make_answer(db, sa, q, value_text=value_text)
    db.flush()
    result = autograde_station_attempt(db, sa.id)
    db.refresh(a)
    return result, a


# ======================= raw_to_band: reading =======================

def test_band_reading_full_marks():
    assert raw_to_band(40, 40, "reading") == 9.0


def test_band_reading_39_is_nine():
    assert raw_to_band(39, 40, "reading") == 9.0


def test_band_reading_37_is_eight_five():
    assert raw_to_band(37, 40, "reading") == 8.5


def test_band_reading_35_is_eight():
    assert raw_to_band(35, 40, "reading") == 8.0


def test_band_reading_75_boundary():
    # Reading needs 33 for 7.5; 32 drops to 7.0.
    assert raw_to_band(33, 40, "reading") == 7.5
    assert raw_to_band(32, 40, "reading") == 7.0


def test_band_reading_65_boundary():
    assert raw_to_band(27, 40, "reading") == 6.5
    assert raw_to_band(26, 40, "reading") == 6.0


def test_band_reading_55_boundary():
    assert raw_to_band(19, 40, "reading") == 5.5
    assert raw_to_band(18, 40, "reading") == 5.0


def test_band_reading_50_boundary():
    assert raw_to_band(15, 40, "reading") == 5.0
    assert raw_to_band(14, 40, "reading") == 4.5


# ====================== raw_to_band: listening ======================

def test_band_listening_full_marks():
    assert raw_to_band(40, 40, "listening") == 9.0


def test_band_listening_75_boundary():
    # Listening reaches 7.5 already at 32 (reading needs 33).
    assert raw_to_band(32, 40, "listening") == 7.5
    assert raw_to_band(31, 40, "listening") == 7.0


def test_band_listening_65_boundary():
    assert raw_to_band(26, 40, "listening") == 6.5
    assert raw_to_band(25, 40, "listening") == 6.0


def test_band_listening_55_boundary():
    assert raw_to_band(18, 40, "listening") == 5.5
    assert raw_to_band(17, 40, "listening") == 5.0


# =================== raw_to_band: tables diverge ===================

def test_reading_and_listening_differ_at_32():
    assert raw_to_band(32, 40, "reading") == 7.0
    assert raw_to_band(32, 40, "listening") == 7.5


def test_reading_and_listening_differ_at_15():
    # 15 -> reading 5.0, listening 4.5.
    assert raw_to_band(15, 40, "reading") == 5.0
    assert raw_to_band(15, 40, "listening") == 4.5


# ===================== raw_to_band: edges =====================

def test_band_zero_correct_returns_floor():
    # Below every threshold -> the 2.5 floor (table minimum).
    assert raw_to_band(0, 40, "reading") == 2.5
    assert raw_to_band(0, 40, "listening") == 2.5


def test_band_zero_total_is_safe():
    # total == 0 -> scaled 0 -> floor (no ZeroDivisionError).
    assert raw_to_band(0, 0, "reading") == 2.5


def test_band_rescales_to_forty():
    # 10/20 scales up to 20/40 -> reading 5.5.
    assert raw_to_band(10, 20, "reading") == 5.5


# ============================ _norm ============================

def test_norm_lowercases():
    assert _norm("PARIS") == "paris"


def test_norm_collapses_whitespace():
    assert _norm("  the   quick  brown ") == "the quick brown"


def test_norm_none_is_empty():
    assert _norm(None) == ""


def test_norm_empty_is_empty():
    assert _norm("") == ""


# ======================= MCQ scoring =======================

def test_mcq_correct_scores_one(db_session):
    result, a = _grade_mcq(db_session, correct_index=2, choice_index=2)
    assert result["raw_score"] == 1
    assert result["total"] == 1
    assert a.is_auto_correct is True
    assert a.auto_score == 1.0


def test_mcq_wrong_scores_zero(db_session):
    result, a = _grade_mcq(db_session, correct_index=2, choice_index=0)
    assert result["raw_score"] == 0
    assert a.is_auto_correct is False
    assert a.auto_score == 0.0


def test_mcq_none_choice_scores_zero(db_session):
    result, a = _grade_mcq(db_session, correct_index=2, choice_index=None)
    assert result["raw_score"] == 0
    assert a.is_auto_correct is False


def test_mcq_out_of_range_choice_is_wrong(db_session):
    result, a = _grade_mcq(db_session, correct_index=1, choice_index=99)
    assert result["raw_score"] == 0
    assert a.is_auto_correct is False


def test_mcq_multiple_questions_tally(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session)
    for i in range(3):
        q = f.make_question(db_session, station, models.QuestionType.mcq,
                            correct_index=1, sub_skill="multiple_choice",
                            display_order=i + 1)
        # 2 correct, 1 wrong
        f.make_answer(db_session, sa, q, choice_index=1 if i < 2 else 0)
    db_session.flush()
    result = autograde_station_attempt(db_session, sa.id)
    assert result["raw_score"] == 2
    assert result["total"] == 3


# =================== short-answer scoring ===================

def test_short_exact_match(db_session):
    result, a = _grade_short(db_session, accept_answers=["paris"], value_text="paris")
    assert result["raw_score"] == 1
    assert a.is_auto_correct is True


def test_short_case_insensitive(db_session):
    result, a = _grade_short(db_session, accept_answers=["paris"], value_text="PARIS")
    assert a.is_auto_correct is True


def test_short_whitespace_normalised(db_session):
    result, a = _grade_short(db_session, accept_answers=["paris"], value_text="  paris  ")
    assert a.is_auto_correct is True


def test_short_any_of_multiple_accepted(db_session):
    result, a = _grade_short(db_session, accept_answers=["london", "paris"],
                             value_text="paris")
    assert a.is_auto_correct is True


def test_short_empty_scores_zero(db_session):
    result, a = _grade_short(db_session, accept_answers=["paris"], value_text="")
    assert result["raw_score"] == 0
    assert a.is_auto_correct is False


def test_short_not_in_accept_scores_zero(db_session):
    result, a = _grade_short(db_session, accept_answers=["paris"], value_text="berlin")
    assert result["raw_score"] == 0
    assert a.is_auto_correct is False


# ========================== ErrorTag ==========================

def test_wrong_answer_writes_error_tag_with_full_context(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session, skill="reading")
    q = f.make_question(db_session, station, models.QuestionType.mcq,
                        correct_index=1, sub_skill="matching_headings")
    a = f.make_answer(db_session, sa, q, choice_index=0)  # wrong
    db_session.flush()
    autograde_station_attempt(db_session, sa.id)

    tag = db_session.query(models.ErrorTag).one()
    assert tag.user_id == student.id
    assert tag.exam_id == exam.id
    assert tag.station_id == station.id
    assert tag.station_attempt_id == sa.id
    assert tag.answer_id == a.id
    assert tag.skill == "reading"
    assert tag.sub_skill == "matching_headings"
    assert tag.question_type == "mcq"


def test_correct_answer_writes_no_error_tag(db_session):
    _grade_mcq(db_session, correct_index=1, choice_index=1)
    assert db_session.query(models.ErrorTag).count() == 0


def test_regrade_replaces_error_tags(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session)
    q = f.make_question(db_session, station, models.QuestionType.mcq,
                        correct_index=1, sub_skill="gap_fill")
    f.make_answer(db_session, sa, q, choice_index=0)  # wrong
    db_session.flush()
    autograde_station_attempt(db_session, sa.id)
    autograde_station_attempt(db_session, sa.id)  # regrade -> no duplicates
    assert db_session.query(models.ErrorTag).count() == 1


def test_regrade_after_fixing_answer_clears_tag(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session)
    q = f.make_question(db_session, station, models.QuestionType.mcq,
                        correct_index=1, sub_skill="gap_fill")
    a = f.make_answer(db_session, sa, q, choice_index=0)  # wrong
    db_session.flush()
    autograde_station_attempt(db_session, sa.id)
    assert db_session.query(models.ErrorTag).count() == 1

    a.choice_index = 1  # corrected
    db_session.flush()
    autograde_station_attempt(db_session, sa.id)
    assert db_session.query(models.ErrorTag).count() == 0


# ======================= spaced review =======================

def test_wrong_answer_enqueues_review(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session)
    q = f.make_question(db_session, station, models.QuestionType.mcq,
                        correct_index=1, sub_skill="multiple_choice")
    f.make_answer(db_session, sa, q, choice_index=0)  # wrong
    db_session.flush()
    autograde_station_attempt(db_session, sa.id)

    rq = db_session.query(models.ReviewQueue).one()
    assert rq.user_id == student.id
    assert rq.question_id == q.id


def test_correct_answer_does_not_enqueue_review(db_session):
    _grade_mcq(db_session, correct_index=1, choice_index=1)
    assert db_session.query(models.ReviewQueue).count() == 0


# ====================== station edge cases ======================

def test_station_with_no_questions(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session, skill="reading")
    result = autograde_station_attempt(db_session, sa.id)
    assert result["raw_score"] == 0
    assert result["total"] == 0
    # Reading skill -> band falls through to the 2.5 floor (total 0).
    assert result["band"] == 2.5
    db_session.refresh(sa)
    assert sa.status == models.AttemptStatus.graded


def test_station_with_only_explain_skips_autograde(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session, skill="writing")
    q = f.make_question(db_session, station, models.QuestionType.explain)
    f.make_answer(db_session, sa, q, value_text="An essay response.")
    db_session.flush()
    result = autograde_station_attempt(db_session, sa.id)
    assert result["raw_score"] == 0
    assert result["total"] == 0
    assert result["band"] is None        # writing skill -> no band math
    assert db_session.query(models.ErrorTag).count() == 0
    assert db_session.query(models.ReviewQueue).count() == 0


def test_mixed_qtypes_grades_only_mcq_and_short(db_session):
    owner, student, exam, station, ea, sa = _scaffold(db_session, skill="reading")
    q_mcq = f.make_question(db_session, station, models.QuestionType.mcq,
                            correct_index=1, sub_skill="multiple_choice",
                            display_order=1)
    q_short = f.make_question(db_session, station, models.QuestionType.short,
                              accept_answers=["paris"], sub_skill="short_answer",
                              display_order=2)
    q_explain = f.make_question(db_session, station, models.QuestionType.explain,
                                display_order=3)
    f.make_answer(db_session, sa, q_mcq, choice_index=1)
    f.make_answer(db_session, sa, q_short, value_text="paris")
    f.make_answer(db_session, sa, q_explain, value_text="ignored")
    db_session.flush()
    result = autograde_station_attempt(db_session, sa.id)
    assert result["raw_score"] == 2
    assert result["total"] == 2          # explain excluded from the denominator


def test_station_status_becomes_graded(db_session):
    result, a = _grade_mcq(db_session, correct_index=1, choice_index=1)
    sa = a.station_attempt
    assert sa.status == models.AttemptStatus.graded


def test_missing_station_attempt_returns_none(db_session):
    assert autograde_station_attempt(db_session, 999999) is None


# ================ fixture-driven station grading ================

def test_prefilled_attempt_scores_seven_of_ten(db_session, exam_attempt_with_answers):
    ea, sa, questions_by_id, answers = exam_attempt_with_answers
    result = autograde_station_attempt(db_session, sa.id)
    assert result["raw_score"] == 7
    assert result["total"] == 10
    # 7/10 -> scaled 28 -> reading band 6.5.
    assert result["band"] == 6.5


def test_prefilled_attempt_tags_three_mistakes(db_session, exam_attempt_with_answers):
    ea, sa, questions_by_id, answers = exam_attempt_with_answers
    autograde_station_attempt(db_session, sa.id)
    assert db_session.query(models.ErrorTag).count() == 3
    assert db_session.query(models.ReviewQueue).count() == 3


# ======================= exam-level grading =======================

def _two_station_exam(db, *, second_correct):
    """Reading exam, station 1 = 2 MCQ all correct (band 9.0), station 2 =
    8 MCQ with `second_correct` correct."""
    owner = f.make_user(db, role=models.UserRole.teacher)
    student = f.make_user(db)
    exam = f.make_exam(db, owner)
    ea = f.make_attempt(db, exam, student)

    st1 = f.make_station(db, exam, owner, skill="reading", position=1)
    sa1 = f.make_station_attempt(db, ea, st1)
    for i in range(2):
        q = f.make_question(db, st1, models.QuestionType.mcq, correct_index=1,
                            display_order=i + 1)
        f.make_answer(db, sa1, q, choice_index=1)

    st2 = f.make_station(db, exam, owner, skill="reading", position=2)
    sa2 = f.make_station_attempt(db, ea, st2)
    for i in range(8):
        q = f.make_question(db, st2, models.QuestionType.mcq, correct_index=1,
                            display_order=i + 1)
        f.make_answer(db, sa2, q, choice_index=1 if i < second_correct else 0)
    db.flush()
    return exam, ea, sa1, sa2


def test_exam_grades_every_station(db_session):
    exam, ea, sa1, sa2 = _two_station_exam(db_session, second_correct=7)
    autograde_exam_attempt(db_session, ea.id)
    db_session.refresh(sa1)
    db_session.refresh(sa2)
    assert sa1.raw_score == 2.0
    assert sa2.raw_score == 7.0
    assert sa1.status == models.AttemptStatus.graded
    assert sa2.status == models.AttemptStatus.graded


def test_exam_overall_band_is_mean_to_nearest_half(db_session):
    # Station bands 9.0 and 8.0 -> mean 8.5.
    exam, ea, sa1, sa2 = _two_station_exam(db_session, second_correct=7)
    autograde_exam_attempt(db_session, ea.id)
    db_session.refresh(ea)
    assert ea.overall_band == 8.5
    assert ea.status == models.AttemptStatus.graded
    assert ea.graded_at is not None


def test_exam_with_only_writing_has_no_overall_band(db_session):
    owner = f.make_user(db_session, role=models.UserRole.teacher)
    student = f.make_user(db_session)
    exam = f.make_exam(db_session, owner)
    ea = f.make_attempt(db_session, exam, student)
    st = f.make_station(db_session, exam, owner, skill="writing", position=1)
    sa = f.make_station_attempt(db_session, ea, st)
    q = f.make_question(db_session, st, models.QuestionType.explain)
    f.make_answer(db_session, sa, q, value_text="essay")
    db_session.flush()

    autograde_exam_attempt(db_session, ea.id)
    db_session.refresh(ea)
    assert ea.overall_band is None       # no reading/listening band to average
    assert ea.status == models.AttemptStatus.graded


def test_overall_band_rounds_quarter_up(db_session):
    # Station bands 6.0 and 6.5 average to exactly 6.25. IELTS rounds .25 UP to
    # 6.5 (Python's banker's round() would wrongly give 6.0).
    owner = f.make_user(db_session, role=models.UserRole.teacher)
    student = f.make_user(db_session)
    exam = f.make_exam(db_session, owner)
    ea = f.make_attempt(db_session, exam, student)

    # Station 1: 26/40 scaled -> reading band 6.0. Use 13 of 20 correct (scaled 26).
    st1 = f.make_station(db_session, exam, owner, skill="reading", position=1)
    sa1 = f.make_station_attempt(db_session, ea, st1)
    for i in range(20):
        q = f.make_question(db_session, st1, models.QuestionType.mcq,
                            correct_index=1, display_order=i + 1)
        f.make_answer(db_session, sa1, q, choice_index=1 if i < 13 else 0)

    # Station 2: 27/40 scaled -> reading band 6.5. Use 27 of 40 correct.
    st2 = f.make_station(db_session, exam, owner, skill="reading", position=2)
    sa2 = f.make_station_attempt(db_session, ea, st2)
    for i in range(40):
        q = f.make_question(db_session, st2, models.QuestionType.mcq,
                            correct_index=1, display_order=i + 1)
        f.make_answer(db_session, sa2, q, choice_index=1 if i < 27 else 0)
    db_session.flush()

    autograde_exam_attempt(db_session, ea.id)
    db_session.refresh(sa1)
    db_session.refresh(sa2)
    db_session.refresh(ea)
    assert sa1.band == 6.0
    assert sa2.band == 6.5
    assert ea.overall_band == 6.5      # 6.25 rounded up, not banker's-rounded to 6.0


def test_missing_exam_attempt_returns_none(db_session):
    assert autograde_exam_attempt(db_session, 999999) is None
