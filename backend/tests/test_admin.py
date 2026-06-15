"""Admin user-management endpoints: create accounts (teachers) and reset
passwords. Covers the happy path, the role guard, and validation."""
from backend.service import models
from backend.service.auth_deps import create_access_token


def _admin(db):
    u = models.User(email="admin@test.io", full_name="Admin A",
                    role=models.UserRole.admin, password_hash="x", is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _headers(u):
    return {"Authorization": f"Bearer {create_access_token(u.id, u.role.value)}"}


def test_admin_creates_teacher_who_can_login(client, db):
    admin = _admin(db)
    r = client.post("/api/admin/users", headers=_headers(admin), json={
        "email": "NewTeach@test.io", "password": "secret12",
        "full_name": "New Teach", "role": "teacher"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["role"] == "teacher"
    assert body["email"] == "newteach@test.io"  # normalised to lower-case

    # the new teacher can sign in immediately with the chosen password
    login = client.post("/api/auth/login",
                        json={"email": "newteach@test.io", "password": "secret12"})
    assert login.status_code == 200
    assert login.json()["role"] == "teacher"


def test_non_admin_cannot_create_users(client, teacher_headers):
    r = client.post("/api/admin/users", headers=teacher_headers, json={
        "email": "x@test.io", "password": "secret12", "role": "teacher"})
    assert r.status_code == 403


def test_create_user_rejects_short_password(client, db):
    admin = _admin(db)
    r = client.post("/api/admin/users", headers=_headers(admin), json={
        "email": "shortpw@test.io", "password": "abc", "role": "teacher"})
    assert r.status_code == 400


def test_create_user_rejects_bad_role(client, db):
    admin = _admin(db)
    r = client.post("/api/admin/users", headers=_headers(admin), json={
        "email": "weird@test.io", "password": "secret12", "role": "wizard"})
    assert r.status_code == 400


def test_create_user_rejects_duplicate_email(client, db, student_user):
    admin = _admin(db)
    r = client.post("/api/admin/users", headers=_headers(admin), json={
        "email": student_user.email, "password": "secret12", "role": "teacher"})
    assert r.status_code == 409


def test_admin_resets_password(client, db, student_user):
    admin = _admin(db)
    r = client.post(f"/api/admin/users/{student_user.id}/password",
                    headers=_headers(admin), json={"password": "brandnew12"})
    assert r.status_code == 200

    login = client.post("/api/auth/login",
                        json={"email": student_user.email, "password": "brandnew12"})
    assert login.status_code == 200


def test_reset_password_missing_user_404(client, db):
    admin = _admin(db)
    r = client.post("/api/admin/users/999999/password",
                    headers=_headers(admin), json={"password": "brandnew12"})
    assert r.status_code == 404
