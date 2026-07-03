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
