"""Test bootstrap: provide dummy env so backend modules import without a real DB.

`backend.service.database` builds a SQLAlchemy engine at import time, and config
reads JWT_SECRET, so we set harmless placeholders. SQLAlchemy does not connect
until a query runs, and these unit tests only exercise pure logic, so no database
is needed.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://u:p@localhost:5432/testdb")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-1234")
# Test fixtures sign in far more often than any human — skip the per-IP window.
os.environ.setdefault("AUTH_RATE_LIMIT_DISABLED", "1")


import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def client():
    """FastAPI TestClient over an isolated in-memory SQLite DB (no lifespan)."""
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
