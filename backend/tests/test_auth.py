"""Auth flow tests: registration, login, and token-based access control.

Each test registers under its own email so the shared in-memory DB (the unique
email/username constraints) doesn't cause cross-test collisions.
"""


def _register(client, email, password="secret123"):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )


def test_register_student_returns_token(client):
    resp = _register(client, "newstudent@example.com")
    assert resp.status_code == 201
    body = resp.json()
    assert body["token"]
    assert body["role"] == "student"


def test_register_duplicate_email_is_409(client):
    _register(client, "dupe@example.com")
    resp = _register(client, "dupe@example.com")
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


def test_register_short_password_is_400(client):
    resp = _register(client, "shortpw@example.com", password="abc123")  # 6 chars
    assert resp.status_code == 400
    assert "8 characters" in resp.json()["detail"]


def test_register_blank_password_is_400(client):
    resp = _register(client, "blankpw@example.com", password="        ")  # whitespace only
    assert resp.status_code == 400
    assert "required" in resp.json()["detail"].lower()


def test_register_eight_char_password_succeeds(client):
    # Exactly the minimum length is accepted.
    resp = _register(client, "eightok@example.com", password="12345678")
    assert resp.status_code == 201


def test_change_password_below_min_is_400(client):
    token = _register(client, "changepw@example.com", password="secret123").json()["token"]
    resp = client.post(
        "/api/me/password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "secret123", "new_password": "short1"},  # 6 chars
    )
    assert resp.status_code == 400
    assert "8 characters" in resp.json()["detail"]


def test_login_with_valid_credentials_returns_token(client):
    _register(client, "loginok@example.com", password="secret123")
    resp = client.post(
        "/api/auth/login",
        json={"email": "loginok@example.com", "password": "secret123"},
    )
    assert resp.status_code == 200
    assert resp.json()["token"]


def test_login_with_wrong_password_is_401(client):
    _register(client, "wrongpw@example.com", password="secret123")
    resp = client.post(
        "/api/auth/login",
        json={"email": "wrongpw@example.com", "password": "not-the-password"},
    )
    assert resp.status_code == 401


def test_protected_endpoint_requires_token(client):
    # No Authorization header -> 401.
    assert client.get("/api/me").status_code == 401

    # Valid Bearer token -> 200 with the user's profile.
    token = _register(client, "protected@example.com").json()["token"]
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "protected@example.com"


def test_student_token_rejected_on_teacher_route(client):
    token = _register(client, "studentrole@example.com").json()["token"]
    resp = client.get(
        "/api/teacher/classes",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
