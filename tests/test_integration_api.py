"""End-to-end API tests against a real (in-memory SQLite) database.

Spins the FastAPI app with an isolated SQLite DB per test (no lifespan, so the
production Postgres engine is never touched) and drives the real HTTP endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def client():
    import backend.service.models  # noqa: F401  (registers tables on Base)
    from backend.service.database import Base, get_db
    from backend.main import app

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def _override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    c = TestClient(app)                 # no context manager => lifespan not run
    c.session_factory = TestSession
    yield c
    app.dependency_overrides.clear()


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


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"


def test_register_then_login(client):
    r = client.post("/api/auth/register", json={
        "email": "stu@x.io", "password": "studentpass1", "full_name": "Stu",
    })
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "student"
    assert r.json()["token"]
    # Same credentials log in.
    tok = _token(client, "stu@x.io", "studentpass1")
    assert tok


def test_register_rejects_short_password(client):
    r = client.post("/api/auth/register", json={"email": "a@b.io", "password": "short"})
    assert r.status_code == 400


def test_login_rejects_bad_credentials(client):
    r = client.post("/api/auth/login", json={"email": "nobody@x.io", "password": "whatever12"})
    assert r.status_code == 401


def test_import_requires_authentication(client):
    r = client.post("/api/tests/import", json={"name": "x", "sections": []})
    assert r.status_code in (401, 403)


def test_import_forbidden_for_students(client):
    reg = client.post("/api/auth/register", json={"email": "s2@x.io", "password": "studentpass1"})
    tok = reg.json()["token"]
    r = client.post(
        "/api/tests/import",
        json={"name": "x", "difficulty": "medium", "sections": []},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert r.status_code == 403


def test_teacher_import_export_roundtrip_and_subskill_clamp(client):
    email, pw = _seed_teacher(client)
    headers = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    payload = {
        "name": "Reading 1", "difficulty": "medium", "time_limit_min": 60, "access_code": "1234",
        "sections": [{
            "position": 1, "skill": "reading", "title": "Section 1",
            "passage_md": "The cat sat on the mat. It can be seen clearly.",
            "questions": [
                {"qtype": "mcq", "prompt": "Q1", "options": ["a", "b"],
                 "correct_index": 0, "sub_skill": "garbage", "display_order": 1},
                {"qtype": "short", "prompt": "Q2", "accept_answers": ["cat"],
                 "sub_skill": "gap_fill", "display_order": 2},
            ],
        }],
    }
    r = client.post("/api/tests/import", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    exam_id = r.json()["exam_id"]

    exp = client.get(f"/api/tests/{exam_id}/export", headers=headers)
    assert exp.status_code == 200, exp.text
    questions = exp.json()["sections"][0]["questions"]
    # N1: an off-vocab sub_skill on an MCQ is clamped; a valid one is preserved.
    assert questions[0]["sub_skill"] == "multiple_choice"
    assert questions[1]["sub_skill"] == "gap_fill"
