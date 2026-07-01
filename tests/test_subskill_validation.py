from backend.routers.tests_io import _clean_sub_skill


def test_valid_value_kept():
    assert _clean_sub_skill("gap_fill", "short") == "gap_fill"


def test_unknown_mcq_clamps_to_multiple_choice():
    assert _clean_sub_skill("nonsense", "mcq") == "multiple_choice"


def test_missing_short_clamps_to_short_answer():
    assert _clean_sub_skill(None, "short") == "short_answer"


def test_explain_question_gets_none():
    assert _clean_sub_skill("whatever", "explain") is None
