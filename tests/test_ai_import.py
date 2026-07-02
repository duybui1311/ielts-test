import pytest
from fastapi import HTTPException

from backend.routers.ai_import import _finalize, _loads_json, _validate_usable


def test_loads_json_plain_fenced_and_noisy():
    assert _loads_json('{"a": 1}') == {"a": 1}
    assert _loads_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert _loads_json('Here is your test: {"a": 1} — done') == {"a": 1}


def test_finalize_clamps_mcq_and_subskill():
    r = _finalize({
        "sections": [{
            "skill": "reading",
            "questions": [
                {"qtype": "mcq", "prompt": "Q1", "options": ["a", "b"],
                 "correct_index": 9, "sub_skill": "bogus"},
                {"qtype": "short", "prompt": "Q2", "accept_answers": ["x"],
                 "sub_skill": "gap_fill"},
            ],
        }],
    })
    q = r["sections"][0]["questions"]
    assert q[0]["correct_index"] == 0            # out-of-range clamped to 0
    assert q[0]["sub_skill"] == "multiple_choice"  # invalid vocab clamped
    assert q[1]["sub_skill"] == "gap_fill"        # valid vocab preserved
    assert r["difficulty"] == "medium"            # default filled


def test_finalize_writing_section_is_explain_only():
    r = _finalize({
        "name": "W", "sections": [{
            "skill": "writing",
            "questions": [{"qtype": "short", "prompt": "Task 1",
                           "sub_skill": "gap_fill", "explanation": "x"}],
        }],
    })
    q = r["sections"][0]["questions"][0]
    assert q["qtype"] == "explain"
    assert "sub_skill" not in q
    assert "explanation" not in q


def test_validate_usable_defaults_name_and_rejects_empty():
    ok = _validate_usable({"name": "  ", "sections": [
        {"skill": "reading", "questions": [{"qtype": "short", "prompt": "Q1"}]}]})
    assert ok["name"] == "Imported test"
    with pytest.raises(HTTPException) as exc:
        _validate_usable({"name": "X", "sections": []})
    assert exc.value.status_code == 422
    # Sections without a single question are just as unusable in the builder.
    with pytest.raises(HTTPException) as exc:
        _validate_usable({"name": "X", "sections": [{"skill": "reading", "questions": []}]})
    assert exc.value.status_code == 422
