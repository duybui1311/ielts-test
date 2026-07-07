"""Lock the database against direct Supabase Data API access.

The backend is the ONLY intended database client (it connects as the table
owner, so none of this affects it). But Supabase also exposes every `public`
table through its PostgREST Data API to the `anon` / `authenticated` roles —
which held full grants on all 30 tables with RLS disabled, i.e. anyone with
the project's (public by design) anon key could read and write everything.

Two independent locks, so regressing one still leaves the other:
1. Enable ROW LEVEL SECURITY on every public table with **no policies** —
   deny-by-default for every role that doesn't own the table.
2. Revoke all table/sequence privileges from `anon` and `authenticated`,
   including default privileges for future tables.

Revision ID: 0007_row_level_security
Revises: 0006_allow_retakes
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0007_row_level_security"
down_revision = "0006_allow_retakes"
branch_labels = None
depends_on = None

_SUPABASE_API_ROLES = ("anon", "authenticated")


def _public_tables(bind) -> list[str]:
    return sa.inspect(bind).get_table_names(schema="public")


def _role_exists(bind, role: str) -> bool:
    return bool(bind.execute(
        sa.text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": role}
    ).scalar())


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":  # SQLite test databases: nothing to lock
        return

    for table in _public_tables(bind):
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')

    for role in _SUPABASE_API_ROLES:
        if not _role_exists(bind, role):
            continue
        op.execute(f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role}")
        op.execute(f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {role}")
        # Future tables created by the app user shouldn't be granted either.
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"REVOKE ALL ON TABLES FROM {role}"
        )
        op.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"REVOKE ALL ON SEQUENCES FROM {role}"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    # Only RLS is reverted; the revoked anon/authenticated grants are NOT
    # restored (there is no legitimate direct-API access to restore).
    for table in _public_tables(bind):
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY')
