"""questions.paraphrases — paraphrase map for the explanation feature

Revision ID: 0002_question_paraphrases
Revises: 0001_baseline
Create Date: 2026-07-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_question_paraphrases"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The 0001 baseline delegates to create_all, which already includes this
    # column on fresh databases — only add it where it's actually missing.
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("questions")}
    if "paraphrases" not in cols:
        op.add_column("questions", sa.Column("paraphrases", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("questions")}
    if "paraphrases" in cols:
        op.drop_column("questions", "paraphrases")
