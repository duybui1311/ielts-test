"""Allow retakes: drop the one-attempt-per-exam unique constraint.

(exam_id, user_id) on exam_attempts is no longer unique — students can retake
practice tests (mock tests stay once-only, enforced in the start endpoint).
A plain composite index replaces it for the latest-attempt lookups.

Revision ID: 0006_allow_retakes
Revises: 0005_customer_readiness
Create Date: 2026-07-05
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_allow_retakes"
down_revision = "0005_customer_readiness"
branch_labels = None
depends_on = None


def _constraint_names(bind):
    insp = sa.inspect(bind)
    uniques = {c["name"] for c in insp.get_unique_constraints("exam_attempts")}
    indexes = {i["name"] for i in insp.get_indexes("exam_attempts")}
    return uniques, indexes


def upgrade() -> None:
    bind = op.get_bind()
    uniques, indexes = _constraint_names(bind)
    if "uq_exam_user" in uniques:
        op.drop_constraint("uq_exam_user", "exam_attempts", type_="unique")
    elif "uq_exam_user" in indexes:  # some backends surface it as a unique index
        op.drop_index("uq_exam_user", table_name="exam_attempts")
    _, indexes = _constraint_names(bind)
    if "ix_exam_attempts_exam_user" not in indexes:
        op.create_index(
            "ix_exam_attempts_exam_user", "exam_attempts", ["exam_id", "user_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    uniques, indexes = _constraint_names(bind)
    if "ix_exam_attempts_exam_user" in indexes:
        op.drop_index("ix_exam_attempts_exam_user", table_name="exam_attempts")
    if "uq_exam_user" not in uniques:
        # NOTE: fails if a user meanwhile has several attempts on one exam —
        # duplicates must be pruned by hand before downgrading.
        op.create_unique_constraint(
            "uq_exam_user", "exam_attempts", ["exam_id", "user_id"]
        )
