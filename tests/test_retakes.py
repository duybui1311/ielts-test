"""Retake policy: practice tests can be retaken after grading (each retake is a
fresh attempt); an unfinished attempt always resumes; mock tests are once-only
like the official exam."""


def _seed_teacher(client, email="teacher@x.io", password="teachpass1"):
    from backend.service import models
    from backend.routers.auth import hash_password
    db = client.session_factory()
    try:
        db.add(models.User(
            email=email, full_name="Teacher", role=models.UserRole.teacher,
            password_hash=hash_password(password), is_active=True,
        ))
        db.commit()
    finally:
        db.close()
    return email, password


def _token(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _setup(client, exam_type="practice"):
    """Import a 1-question exam and enrol a fresh student. Returns (exam_id, sh)."""
    email, pw = _seed_teacher(client)
    th = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    payload = {
        "name": "Retakeable", "difficulty": "medium", "time_limit_min": 60,
        "access_code": "1234", "exam_type": exam_type,
        "sections": [{
            "position": 1, "skill": "reading", "title": "P", "passage_md": "The cat sat.",
            "questions": [
                {"qtype": "mcq", "prompt": "Q1", "options": ["a", "b"],
                 "correct_index": 0, "sub_skill": "multiple_choice", "display_order": 1},
            ],
        }],
    }
    exam_id = client.post("/api/tests/import", json=payload, headers=th).json()["exam_id"]
    reg = client.post("/api/auth/register", json={"email": "r@x.io", "password": "studentpass1"})
    sh = {"Authorization": f"Bearer {reg.json()['token']}"}
    code = next(c["join_code"] for c in client.get("/api/teacher/classes", headers=th).json()
                if c["name"] == "Sandbox")
    client.post("/api/classes/join", json={"code": code}, headers=sh)
    return exam_id, sh


def _start(client, exam_id, sh):
    r = client.post("/api/attempts/start", json={"exam_id": exam_id}, headers=sh)
    assert r.status_code == 200, r.text
    return r.json()


def test_unfinished_attempt_resumes(client):
    exam_id, sh = _setup(client)
    first = _start(client, exam_id, sh)
    again = _start(client, exam_id, sh)
    assert again["attempt_id"] == first["attempt_id"]
    assert again["status"] == "draft"


def test_practice_test_can_be_retaken(client):
    exam_id, sh = _setup(client, exam_type="practice")
    first = _start(client, exam_id, sh)
    assert client.post(f"/api/attempts/{first['attempt_id']}/submit", headers=sh).status_code == 200

    retake = _start(client, exam_id, sh)
    assert retake["attempt_id"] != first["attempt_id"]
    assert retake["status"] == "draft"
    # The retake has its own answer sheet — nothing carried over.
    assert all(q["saved_answer"] is None
               for s in retake["sections"] for q in s["questions"])

    # The exam list reflects the caller's attempt state.
    exam = next(e for e in client.get("/api/exams", headers=sh).json() if e["id"] == exam_id)
    assert exam["attempt_count"] == 2
    assert exam["latest_attempt"]["id"] == retake["attempt_id"]
    assert exam["latest_attempt"]["status"] == "draft"

    # Both attempts keep their own results history.
    r1 = client.get(f"/api/attempts/{first['attempt_id']}/results", headers=sh)
    assert r1.status_code == 200
    assert r1.json()["status"] == "graded"


def test_mock_test_is_once_only(client):
    exam_id, sh = _setup(client, exam_type="exam")
    first = _start(client, exam_id, sh)
    assert client.post(f"/api/attempts/{first['attempt_id']}/submit", headers=sh).status_code == 200

    again = _start(client, exam_id, sh)
    # Same attempt handed back, already graded — the frontend routes to results.
    assert again["attempt_id"] == first["attempt_id"]
    assert again["status"] == "graded"

    exam = next(e for e in client.get("/api/exams", headers=sh).json() if e["id"] == exam_id)
    assert exam["is_mock"] is True
    assert exam["attempt_count"] == 1
