"""questions.task_instructions — the instruction block printed above each IELTS
task ("Complete the notes below. Write ONE WORD ONLY..."), so the test screen
can group questions into official-style task boxes.

Revision ID: 0004_task_instructions
Revises: 0003_question_formats
Create Date: 2026-07-03
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_task_instructions"
down_revision = "0003_question_formats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The 0001 baseline delegates to create_all, which already includes this
    # column on fresh databases — only add it when actually missing.
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("questions")}
    if "task_instructions" not in cols:
        op.add_column("questions", sa.Column("task_instructions", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("questions")}
    if "task_instructions" in cols:
        op.drop_column("questions", "task_instructions")
