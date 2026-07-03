"""Password reset, email verification and class-join flows."""
from backend.service import models


def _register(client, email="flow@x.io", pw="studentpass1"):
    r = client.post("/api/auth/register", json={"email": email, "password": pw})
    assert r.status_code == 201, r.text
    return r.json()


def _raw_token(client, user_id, purpose):
    """Grab the raw token indirectly: issue via the API path, then rebuild from
    the DB is impossible (hashed) — so issue one directly with the helper."""
    from backend.routers.auth import _issue_token, RESET_TOKEN_TTL
    db = client.session_factory()
    try:
        return _issue_token(db, user_id, purpose, RESET_TOKEN_TTL)
    finally:
        db.close()


def test_register_is_always_student_and_unverified(client):
    out = _register(client, "sneaky@x.io")
    assert out["role"] == "student"          # requested roles are ignored
    assert out["email_verified"] is False
    r = client.post("/api/auth/register",
                    json={"email": "sneaky2@x.io", "password": "studentpass1", "role": "teacher"})
    assert r.json()["role"] == "student"


def test_password_reset_roundtrip(client):
    out = _register(client, "reset@x.io", "oldpassword1")
    # Forgot always answers 200, even for unknown emails (no enumeration).
    assert client.post("/api/auth/forgot", json={"email": "nobody@x.io"}).status_code == 200

    raw = _raw_token(client, out["user_id"], "reset")
    r = client.post("/api/auth/reset", json={"token": raw, "password": "newpassword1"})
    assert r.status_code == 200, r.text
    # Old password dead, new one works, token burned.
    assert client.post("/api/auth/login", json={"email": "reset@x.io", "password": "oldpassword1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "reset@x.io", "password": "newpassword1"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": raw, "password": "another111"}).status_code == 400


def test_email_verification_roundtrip(client):
    out = _register(client, "verify@x.io")
    raw = _raw_token(client, out["user_id"], "verify")
    assert client.post("/api/auth/verify", json={"token": raw}).status_code == 200
    login = client.post("/api/auth/login", json={"email": "verify@x.io", "password": "studentpass1"}).json()
    assert login["email_verified"] is True


def test_google_login_unconfigured_returns_503(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    r = client.post("/api/auth/google", json={"credential": "x"})
    assert r.status_code == 503


def test_join_class_bad_code_404(client):
    out = _register(client, "joiner@x.io")
    h = {"Authorization": f"Bearer {out['token']}"}
    assert client.post("/api/classes/join", json={"code": "NOPE99"}, headers=h).status_code == 404


def test_report_access_control(client):
    from tests.test_integration_api import _seed_teacher, _token
    email, pw = _seed_teacher(client)
    th = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    # student in the teacher's Sandbox class (created by an import)
    client.post("/api/tests/import", headers=th, json={
        "name": "T", "sections": [{"position": 1, "skill": "reading", "title": "S",
        "questions": [{"qtype": "short", "prompt": "Q", "accept_answers": ["a"]}]}]})
    stu = _register(client, "kid@x.io")
    sh = {"Authorization": f"Bearer {stu['token']}"}
    code = next(c["join_code"] for c in client.get("/api/teacher/classes", headers=th).json())
    client.post("/api/classes/join", json={"code": code}, headers=sh)

    outsider = _register(client, "other@x.io")
    oh = {"Authorization": f"Bearer {outsider['token']}"}

    assert client.get(f"/api/report/student/{stu['user_id']}", headers=sh).status_code == 200
    assert client.get(f"/api/report/student/{stu['user_id']}", headers=th).status_code == 200
    assert client.get(f"/api/report/student/{stu['user_id']}", headers=oh).status_code == 403


def test_mock_exam_type_roundtrip(client):
    from tests.test_integration_api import _seed_teacher, _token
    email, pw = _seed_teacher(client)
    th = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    r = client.post("/api/tests/import", headers=th, json={
        "name": "Mock 1", "exam_type": "exam",
        "sections": [{"position": 1, "skill": "reading", "title": "S",
        "questions": [{"qtype": "short", "prompt": "Q", "accept_answers": ["a"]}]}]})
    exam_id = r.json()["exam_id"]
    assert client.get(f"/api/tests/{exam_id}/export", headers=th).json()["exam_type"] == "exam"
    assert any(e["id"] == exam_id and e["is_mock"]
               for e in client.get("/api/exams", headers=th).json())
