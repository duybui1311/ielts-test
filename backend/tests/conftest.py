"""Shared test fixtures.

Tests run against an in-memory SQLite database that is created fresh per test
session and wired in by overriding the `get_db` dependency, so nothing ever
touches the real Supabase Postgres. We also pin a valid `JWT_SECRET` before the
app is imported so token signing/verification works under test.
"""
import os

# Must be set before any backend module (config/database/auth_deps) is imported.
# A dummy Postgres URL keeps the real engine constructable in CI (it's built
# lazily and never connected, since we override get_db below); the QueuePool
# kwargs in database.py are only valid for a non-SQLite engine. The JWT secret
# is comfortably over the 32-char minimum.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg2://test:test@localhost:5432/test"
)
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-definitely-long-enough-123456")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.service.config import settings
from backend.service.database import Base, get_db
from backend.service import models  # noqa: F401 — registers all tables on Base

# Force a valid secret even if a local .env supplied a different/short one, so
# the auth flow under test is deterministic and satisfies the length guard.
settings.JWT_SECRET = "test-jwt-secret-that-is-definitely-long-enough-123456"

# Single in-memory database shared across connections (StaticPool) so every
# session in a test sees the same schema and rows.
_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def _create_schema():
    """Build the test schema. Prefer the full model set; if any model proves
    incompatible with SQLite, fall back to just the User table so the auth and
    health tests can still run."""
    try:
        Base.metadata.create_all(bind=_engine)
    except Exception:
        models.User.__table__.create(bind=_engine, checkfirst=True)


_create_schema()


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db


@pytest.fixture()
def client():
    # Constructed without the context-manager form on purpose: that avoids
    # firing the app lifespan (which would call create_all against the real
    # Supabase engine).
    return TestClient(app)
