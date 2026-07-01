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


def test_full_student_attempt_autograde_and_weakness(client):
    # Teacher creates a reading exam with a known answer key.
    email, pw = _seed_teacher(client)
    th = {"Authorization": f"Bearer {_token(client, email, pw)}"}
    payload = {
        "name": "Reading E2E", "difficulty": "medium", "time_limit_min": 60, "access_code": "1234",
        "sections": [{
            "position": 1, "skill": "reading", "title": "Passage",
            "passage_md": "The cat sat on the mat.",
            "questions": [
                {"qtype": "mcq", "prompt": "Q_MCQ", "options": ["cat", "dog"],
                 "correct_index": 0, "sub_skill": "multiple_choice", "display_order": 1},
                {"qtype": "short", "prompt": "Q_SHORT", "accept_answers": ["mat"],
                 "sub_skill": "sentence_completion", "display_order": 2},
            ],
        }],
    }
    exam_id = client.post("/api/tests/import", json=payload, headers=th).json()["exam_id"]

    # Student registers, sees the exam, and starts an attempt.
    reg = client.post("/api/auth/register", json={"email": "learner@x.io", "password": "studentpass1"})
    sh = {"Authorization": f"Bearer {reg.json()['token']}"}
    assert any(e["id"] == exam_id for e in client.get("/api/exams", headers=sh).json())

    start = client.post("/api/attempts/start", json={"exam_id": exam_id}, headers=sh).json()
    attempt_id = start["attempt_id"]
    qids = {q["prompt"]: q["id"] for s in start["sections"] for q in s["questions"]}

    # Answer the MCQ correctly and the short answer incorrectly.
    client.post(f"/api/attempts/{attempt_id}/answer",
                json={"question_id": qids["Q_MCQ"], "choice_index": 0}, headers=sh)
    client.post(f"/api/attempts/{attempt_id}/answer",
                json={"question_id": qids["Q_SHORT"], "value_text": "wrong"}, headers=sh)

    submit = client.post(f"/api/attempts/{attempt_id}/submit", headers=sh).json()
    assert submit["status"] == "graded"
    assert submit["overall_band"] == 5.5   # 1/2 correct -> scaled 20 -> reading band 5.5

    results = client.get(f"/api/attempts/{attempt_id}/results", headers=sh).json()
    sec = results["sections"][0]
    assert sec["raw_score"] == 1.0
    assert sec["band"] == 5.5
    by_prompt = {q["prompt"]: q for q in sec["questions"]}
    assert by_prompt["Q_MCQ"]["is_auto_correct"] is True
    assert by_prompt["Q_SHORT"]["is_auto_correct"] is False
    # Weakness chart reflects the missed short-answer sub-skill.
    weakness = {w["name"]: w["misses"] for w in results["weakness_chart"]}
    assert weakness.get("sentence_completion") == 1

    # The missed question was enqueued for spaced review.
    from backend.service import models
    db = client.session_factory()
    try:
        queued = db.query(models.ReviewQueue).all()
        assert len(queued) == 1
        assert queued[0].question_id == qids["Q_SHORT"]
    finally:
        db.close()
