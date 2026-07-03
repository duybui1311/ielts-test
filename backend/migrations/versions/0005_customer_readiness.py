"""email verification, Google sign-in, class join codes, one-time auth tokens

Revision ID: 0005_customer_readiness
Revises: 0004_task_instructions
Create Date: 2026-07-03
"""
import secrets

import sqlalchemy as sa
from alembic import op

revision = "0005_customer_readiness"
down_revision = "0004_task_instructions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    user_cols = {c["name"] for c in insp.get_columns("users")}
    if "email_verified" not in user_cols:
        op.add_column("users", sa.Column("email_verified", sa.Boolean(), nullable=False,
                                         server_default=sa.false()))
        # Accounts that predate verification are grandfathered in — don't nag
        # every existing user to verify.
        bind.execute(sa.text("UPDATE users SET email_verified = TRUE"))
    if "google_sub" not in user_cols:
        op.add_column("users", sa.Column("google_sub", sa.String(64), nullable=True))
        op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])

    class_cols = {c["name"] for c in insp.get_columns("classes")}
    if "join_code" not in class_cols:
        op.add_column("classes", sa.Column("join_code", sa.String(12), nullable=True))
        op.create_unique_constraint("uq_classes_join_code", "classes", ["join_code"])
        # Backfill a code for every existing class so teachers can share them
        # without re-creating anything.
        rows = bind.execute(sa.text("SELECT id FROM classes")).fetchall()
        for (cid,) in rows:
            code = secrets.token_hex(3).upper()  # e.g. '9F3A1C'
            bind.execute(sa.text("UPDATE classes SET join_code = :c WHERE id = :i"),
                         {"c": code, "i": cid})

    if "auth_tokens" not in insp.get_table_names():
        op.create_table(
            "auth_tokens",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("purpose", sa.String(20), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False, index=True),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "auth_tokens" in insp.get_table_names():
        op.drop_table("auth_tokens")
    class_cols = {c["name"] for c in insp.get_columns("classes")}
    if "join_code" in class_cols:
        op.drop_constraint("uq_classes_join_code", "classes")
        op.drop_column("classes", "join_code")
    user_cols = {c["name"] for c in insp.get_columns("users")}
    if "google_sub" in user_cols:
        op.drop_constraint("uq_users_google_sub", "users")
        op.drop_column("users", "google_sub")
    if "email_verified" in user_cols:
        op.drop_column("users", "email_verified")
