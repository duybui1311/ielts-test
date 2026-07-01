"""Test bootstrap: provide dummy env so backend modules import without a real DB.

`backend.service.database` builds a SQLAlchemy engine at import time, and config
reads JWT_SECRET, so we set harmless placeholders. SQLAlchemy does not connect
until a query runs, and these unit tests only exercise pure logic, so no database
is needed.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://u:p@localhost:5432/testdb")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-1234")
