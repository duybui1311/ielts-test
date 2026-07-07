"""Shared test fixtures for the whole backend suite.

Every test runs against an in-memory SQLite database, wired in by overriding the
`get_db` dependency, so nothing ever touches the real Supabase Postgres. We pin a
valid `JWT_SECRET` before the app is imported so token signing/verification works.

Isolation model: one fresh engine **per test** (see `_engine`). The `client`,
`db`/`db_session` and any data fixtures all bind to that single per-test engine,
so rows written through the ORM are visible to API calls and vice-versa, and every
test starts from an empty schema without any cross-test cleanup.

This file is the single canonical conftest: the former `backend/tests/` suite was
folded in here, so there is no second `client`/`get_db` override fighting this one.
"""
import logging
import os

# Must be set before any backend module (config/database/auth_deps) is imported.
# A dummy Postgres URL keeps the real engine constructable (it's built lazily and
# never connected, since we override get_db below); the QueuePool kwargs in
# database.py are only valid for a non-SQLite engine. The JWT secret is comfortably
# over the 32-char minimum.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg2://test:test@localhost:5432/test"
)
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-definitely-long-enough-123456")
# Test fixtures sign in far more often than any human — turn off BOTH the per-IP
# auth limiter and the global per-IP request limiter (added in the security-
# hardening pass) so the combined suite's request volume never trips a 429.
os.environ.setdefault("AUTH_RATE_LIMIT_DISABLED", "1")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.service.config import settings
from backend.service.database import Base, get_db
from backend.service import models  # noqa: F401 — registers all tables on Base
from backend.service.auth_deps import create_access_token
from backend.service.subskills import SUB_SKILLS

# Force a valid secret even if a local .env supplied a different/short one, so the
# auth flow under test is deterministic and satisfies the length guard.
settings.JWT_SECRET = "test-jwt-secret-that-is-definitely-long-enough-123456"


# ------------------------------ database wiring ------------------------------

@pytest.fixture()
def _engine():
    """A fresh in-memory SQLite database for a single test.

    StaticPool keeps one underlying connection so every session in the test sees
    the same schema and rows. We deliberately do NOT swallow schema-build errors:
    a schema that fails to build is a real bug, and silently masking it would make
    unrelated tests fail in confusing ways."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        logging.exception("Failed to build the test database schema")
        raise
    yield engine
    engine.dispose()


@pytest.fixture()
def _session_factory(_engine):
    return sessionmaker(bind=_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def client(_session_factory):
    """FastAPI TestClient bound to this test's in-memory DB.

    Constructed without the context-manager form on purpose: that avoids firing
    the app lifespan (which would call create_all against the real engine). The
    `get_db` override is installed for the test and removed on teardown, so it
    never leaks into another test."""
    def _override_get_db():
        db = _session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    c = TestClient(app)
    # Back-compat: several tests build rows directly via `client.session_factory()`
    # on the same engine the client reads from.
    c.session_factory = _session_factory
    yield c
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture()
def db_session(_session_factory):
    """A plain ORM session bound to this test's in-memory DB, for exercising the
    service layer directly. Shares the engine with `client`, so data committed
    here is visible to API calls in the same test."""
    db = _session_factory()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture()
def db(db_session):
    """Alias for `db_session` — lets data fixtures/tests request `db` directly."""
    return db_session


# ----------------------------- auth helpers ------------------------------

def _auth_headers(user):
    """Bearer header for a user, minted straight from the signing helper so we
    don't depend on a login round-trip (teacher self-signup is disabled)."""
    return {"Authorization": f"Bearer {create_access_token(user.id, user.role.value)}"}


def _make_user(db, *, role, email, full_name):
    u = models.User(email=email, full_name=full_name, role=role,
                    password_hash="x", is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def teacher_user(db):
    return _make_user(db, role=models.UserRole.teacher,
                      email="teacher@test.io", full_name="Teacher T")


@pytest.fixture()
def student_user(db):
    return _make_user(db, role=models.UserRole.student,
                      email="student@test.io", full_name="Student S")


@pytest.fixture()
def teacher_headers(teacher_user):
    return _auth_headers(teacher_user)


@pytest.fixture()
def student_headers(student_user):
    return _auth_headers(student_user)


# --------------------------- exam scaffolding ----------------------------
# NOTE: skill (reading/listening/writing/speaking) is a Station column; the
# Exam.exam_type enum is only practice|exam. So a "reading exam" is an exam
# whose station carries skill="reading".

def _class_and_exam(db, owner, name, stations=1):
    klass = models.Class(name=f"Class for {name}", owner_id=owner.id)
    db.add(klass)
    db.flush()
    exam = models.Exam(
        class_id=klass.id, name=name, exam_type=models.ExamType.exam,
        difficulty=models.DifficultyLevel.medium, total_stations=stations,
        time_limit_min=60, access_code_hash="x", created_by=owner.id,
    )
    db.add(exam)
    db.flush()
    return klass, exam


def _station(db, exam, owner, skill, position):
    case = models.Case(title=f"{skill} passage", body_md="Passage body.",
                       created_by=owner.id)
    db.add(case)
    db.flush()
    st = models.Station(exam_id=exam.id, position=position, case_id=case.id,
                        skill=skill)
    db.add(st)
    db.flush()
    return st


def _add_reading_questions(db, station):
    """7 MCQ (correct_index set) + 3 short (accept_answers set), sub_skills from
    the closed SUB_SKILLS list."""
    order = 1
    for i in range(7):
        db.add(models.Question(
            station_id=station.id, qtype=models.QuestionType.mcq,
            prompt=f"MCQ {i + 1}", options_json=["A", "B", "C", "D"],
            correct_index=1, sub_skill=SUB_SKILLS[i % len(SUB_SKILLS)],
            display_order=order))
        order += 1
    for i in range(3):
        db.add(models.Question(
            station_id=station.id, qtype=models.QuestionType.short,
            prompt=f"Short {i + 1}", accept_answers=["paris", "paris city"],
            sub_skill="short_answer", display_order=order))
        order += 1


@pytest.fixture()
def reading_exam(db, teacher_user):
    _, exam = _class_and_exam(db, teacher_user, "Reading Exam")
    st = _station(db, exam, teacher_user, "reading", 1)
    _add_reading_questions(db, st)
    db.commit()
    db.refresh(exam)
    return exam


@pytest.fixture()
def listening_exam(db, teacher_user):
    _, exam = _class_and_exam(db, teacher_user, "Listening Exam")
    st = _station(db, exam, teacher_user, "listening", 1)
    for i in range(40):
        db.add(models.Question(
            station_id=st.id, qtype=models.QuestionType.mcq, prompt=f"L{i + 1}",
            options_json=["A", "B", "C", "D"], correct_index=i % 4,
            sub_skill="multiple_choice", display_order=i + 1))
    db.commit()
    db.refresh(exam)
    return exam


@pytest.fixture()
def mixed_exam(db, teacher_user):
    """4 stations: reading(10Q) + listening(40Q) + writing(1 explain task) +
    speaking(1 explain task)."""
    _, exam = _class_and_exam(db, teacher_user, "Mixed Exam", stations=4)
    r = _station(db, exam, teacher_user, "reading", 1)
    _add_reading_questions(db, r)
    l = _station(db, exam, teacher_user, "listening", 2)
    for i in range(40):
        db.add(models.Question(
            station_id=l.id, qtype=models.QuestionType.mcq, prompt=f"L{i + 1}",
            options_json=["A", "B", "C", "D"], correct_index=0,
            sub_skill="multiple_choice", display_order=i + 1))
    w = _station(db, exam, teacher_user, "writing", 3)
    db.add(models.Question(station_id=w.id, qtype=models.QuestionType.explain,
                           prompt="Write an essay.", display_order=1))
    sp = _station(db, exam, teacher_user, "speaking", 4)
    db.add(models.Question(station_id=sp.id, qtype=models.QuestionType.explain,
                           prompt="Speak for two minutes.", display_order=1))
    db.commit()
    db.refresh(exam)
    return exam


@pytest.fixture()
def exam_attempt_with_answers(db, student_user, reading_exam):
    """An attempt on reading_exam pre-filled with 5 correct MCQ, 2 correct short,
    2 wrong MCQ and 1 wrong short. Returns
    (exam_attempt, station_attempt, questions_by_id, answers)."""
    station = reading_exam.stations[0]
    questions = sorted(station.questions, key=lambda q: q.display_order)
    mcqs = [q for q in questions if q.qtype == models.QuestionType.mcq]    # 7
    shorts = [q for q in questions if q.qtype == models.QuestionType.short]  # 3

    ea = models.ExamAttempt(exam_id=reading_exam.id, user_id=student_user.id,
                            status=models.AttemptStatus.submitted)
    db.add(ea)
    db.flush()
    sa = models.StationAttempt(exam_attempt_id=ea.id, station_id=station.id,
                               status=models.AttemptStatus.submitted)
    db.add(sa)
    db.flush()

    answers = []

    def _add(question, **kw):
        a = models.Answer(station_attempt_id=sa.id, question_id=question.id, **kw)
        db.add(a)
        answers.append(a)

    for q in mcqs[:5]:                       # 5 correct MCQ
        _add(q, choice_index=q.correct_index)
    for q in mcqs[5:7]:                       # 2 wrong MCQ
        _add(q, choice_index=(q.correct_index + 1) % 4)
    for q in shorts[:2]:                      # 2 correct short (normalised)
        _add(q, value_text="  PARIS ")
    for q in shorts[2:3]:                     # 1 wrong short
        _add(q, value_text="london")

    db.commit()
    questions_by_id = {q.id: q for q in questions}
    return ea, sa, questions_by_id, answers


@pytest.fixture()
def writing_task(db, teacher_user):
    """Academic Task 1 (chart) task. The chart image lives on the TASK."""
    t = models.WritingTask(
        task_type="task1", title="Chart Description",
        prompt_md="The chart below shows sales over five years. Describe it.",
        image_url="https://abc.supabase.co/storage/v1/object/public/writing-charts/c.png",
        time_limit_min=20, min_words=150, created_by=teacher_user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture()
def writing_submission(db, student_user, writing_task):
    text = "The chart shows a clear upward trend in sales across the five years."
    s = models.WritingSubmission(
        task_id=writing_task.id, user_id=student_user.id,
        response_text=text, word_count=len(text.split()),
        status="submitted",  # ai_result defaults to None
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s
