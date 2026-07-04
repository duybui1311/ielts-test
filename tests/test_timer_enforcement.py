"""Server-side exam timer: the clock is anchored to ExamAttempt.started_at, so
refreshing the page can't restart it, and answers stop being accepted once the
limit (plus a small in-flight grace) has passed."""
from datetime import datetime, timedelta, timezone

from backend.routers.student_flow import ANSWER_GRACE_SECONDS, _seconds_left


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


def _make_attempt(client, time_limit_min=60):
    """Teacher imports a 1-question exam; a fresh student starts an attempt.
    Returns (attempt_id, question_id, student_headers)."""
    email, pw = _seed_teacher(client)
    th = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    payload = {
        "name": "Timed", "difficulty": "medium", "time_limit_min": time_limit_min,
        "access_code": "1234",
        "sections": [{
            "position": 1, "skill": "reading", "title": "P", "passage_md": "The cat sat.",
            "questions": [
                {"qtype": "mcq", "prompt": "Q1", "options": ["a", "b"],
                 "correct_index": 0, "sub_skill": "multiple_choice", "display_order": 1},
            ],
        }],
    }
    exam_id = client.post("/api/tests/import", json=payload, headers=th).json()["exam_id"]

    reg = client.post("/api/auth/register", json={"email": "t@x.io", "password": "studentpass1"})
    sh = {"Authorization": f"Bearer {reg.json()['token']}"}
    code = next(c["join_code"] for c in client.get("/api/teacher/classes", headers=th).json()
                if c["name"] == "Sandbox")
    client.post("/api/classes/join", json={"code": code}, headers=sh)

    start = client.post("/api/attempts/start", json={"exam_id": exam_id}, headers=sh).json()
    qid = start["sections"][0]["questions"][0]["id"]
    return start, qid, sh


def _age_attempt(client, attempt_id, seconds):
    """Backdate started_at so the attempt's clock has `seconds` already elapsed."""
    from backend.service import models
    db = client.session_factory()
    try:
        ea = db.query(models.ExamAttempt).filter(models.ExamAttempt.id == attempt_id).first()
        ea.started_at = datetime.now(timezone.utc) - timedelta(seconds=seconds)
        db.commit()
    finally:
        db.close()


def test_fresh_attempt_reports_full_clock(client):
    start, _qid, _sh = _make_attempt(client, time_limit_min=60)
    # seconds_left is anchored server-side and present in the start payload.
    assert start["seconds_left"] is not None
    assert 60 * 60 - 30 <= start["seconds_left"] <= 60 * 60


def test_refresh_resumes_the_server_clock(client):
    start, _qid, sh = _make_attempt(client, time_limit_min=60)
    attempt_id = start["attempt_id"]
    _age_attempt(client, attempt_id, seconds=30 * 60)  # 30 minutes gone

    content = client.get(f"/api/attempts/{attempt_id}/content", headers=sh).json()
    # A refresh must NOT hand back the full 60 minutes.
    assert content["seconds_left"] <= 30 * 60
    assert content["seconds_left"] > 25 * 60


def test_answers_rejected_after_time_plus_grace(client):
    start, qid, sh = _make_attempt(client, time_limit_min=60)
    attempt_id = start["attempt_id"]
    _age_attempt(client, attempt_id, seconds=60 * 60 + ANSWER_GRACE_SECONDS + 5)

    r = client.post(f"/api/attempts/{attempt_id}/answer",
                    json={"question_id": qid, "choice_index": 0}, headers=sh)
    assert r.status_code == 409
    assert "Time is up" in r.json()["detail"]

    # The expired attempt reports an exhausted clock but can still be submitted.
    content = client.get(f"/api/attempts/{attempt_id}/content", headers=sh).json()
    assert content["seconds_left"] == 0
    submit = client.post(f"/api/attempts/{attempt_id}/submit", headers=sh)
    assert submit.status_code == 200
    assert submit.json()["status"] == "graded"


def test_answers_accepted_within_grace(client):
    start, qid, sh = _make_attempt(client, time_limit_min=60)
    attempt_id = start["attempt_id"]
    # Just past the limit but inside the grace window: in-flight saves land.
    _age_attempt(client, attempt_id, seconds=60 * 60 + 5)

    r = client.post(f"/api/attempts/{attempt_id}/answer",
                    json={"question_id": qid, "choice_index": 0}, headers=sh)
    assert r.status_code == 200


def test_answers_rejected_after_submit(client):
    start, qid, sh = _make_attempt(client)
    attempt_id = start["attempt_id"]
    assert client.post(f"/api/attempts/{attempt_id}/submit", headers=sh).status_code == 200

    r = client.post(f"/api/attempts/{attempt_id}/answer",
                    json={"question_id": qid, "choice_index": 0}, headers=sh)
    assert r.status_code == 409
    assert "already submitted" in r.json()["detail"]


def test_seconds_left_handles_naive_and_aware_timestamps():
    class _Exam:
        time_limit_min = 60

    class _Attempt:
        started_at = None

    a = _Attempt()
    # Naive UTC (how Postgres returns the column) and aware both work.
    a.started_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=10)
    naive_left = _seconds_left(a, _Exam())
    assert 49 * 60 < naive_left <= 50 * 60

    a.started_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    aware_left = _seconds_left(a, _Exam())
    assert 49 * 60 < aware_left <= 50 * 60

    # No started_at (legacy row) or no limit -> unenforced.
    a.started_at = None
    assert _seconds_left(a, _Exam()) is None
    _Exam.time_limit_min = 0
    a.started_at = datetime.now(timezone.utc)
    assert _seconds_left(a, _Exam()) is None
