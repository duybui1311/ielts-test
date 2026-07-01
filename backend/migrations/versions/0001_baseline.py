"""baseline schema (matches the app's create_all)

Revision ID: 0001_baseline
Revises:
Create Date: 2026-07-01

This baseline creates the entire current schema by delegating to the same
SQLAlchemy metadata the app uses, so it is guaranteed identical to `create_all`.
Adoption on an existing database: run `alembic stamp head` (marks it applied
without re-running). Fresh databases: `alembic upgrade head`.
"""

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from alembic import op
    from backend.service.database import Base
    import backend.service.models  # noqa: F401  (register tables)

    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    from alembic import op
    from backend.service.database import Base
    import backend.service.models  # noqa: F401

    Base.metadata.drop_all(bind=op.get_bind())
