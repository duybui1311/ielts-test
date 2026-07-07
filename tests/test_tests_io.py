"""Tests for the test import endpoint (POST /api/tests/import).

Focus: the closed-vocabulary validation added at the API boundary. Malformed
enum values (skill / difficulty / qtype) must be rejected with a 422, not raise
deep in the handler and surface as a 500.
"""


def _valid_body():
    return {
        "name": "Sample Test",
        "difficulty": "medium",
        "sections": [
            {
                "position": 1,
                "skill": "reading",
                "title": "Passage 1",
                "passage_md": "Some passage text.",
                "questions": [
                    {
                        "qtype": "mcq",
                        "prompt": "Q1?",
                        "options": ["A", "B", "C", "D"],
                        "correct_index": 1,
                        "sub_skill": "multiple_choice",
                        "display_order": 1,
                    }
                ],
            }
        ],
    }


def test_import_valid_returns_exam_id(client, teacher_headers):
    resp = client.post("/api/tests/import", headers=teacher_headers, json=_valid_body())
    assert resp.status_code == 200
    body = resp.json()
    assert body["exam_id"]
    assert body["sections"] == 1


def test_import_requires_teacher(client, student_headers):
    resp = client.post("/api/tests/import", headers=student_headers, json=_valid_body())
    assert resp.status_code == 403


def test_import_invalid_skill_is_422(client, teacher_headers):
    body = _valid_body()
    body["sections"][0]["skill"] = "mathematics"
    resp = client.post("/api/tests/import", headers=teacher_headers, json=body)
    assert resp.status_code == 422


def test_import_invalid_difficulty_is_422(client, teacher_headers):
    body = _valid_body()
    body["difficulty"] = "extreme"
    resp = client.post("/api/tests/import", headers=teacher_headers, json=body)
    assert resp.status_code == 422


def test_import_invalid_qtype_is_422(client, teacher_headers):
    body = _valid_body()
    body["sections"][0]["questions"][0]["qtype"] = "essay"
    resp = client.post("/api/tests/import", headers=teacher_headers, json=body)
    assert resp.status_code == 422
