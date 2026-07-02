"""questions.qformat / correct_indices / select_count — native IELTS formats

Revision ID: 0003_question_formats
Revises: 0002_question_paraphrases
Create Date: 2026-07-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_question_formats"
down_revision = "0002_question_paraphrases"
branch_labels = None
depends_on = None

_COLUMNS = [
    ("qformat", sa.String(20)),
    ("correct_indices", sa.JSON()),
    ("select_count", sa.Integer()),
]


def upgrade() -> None:
    # The 0001 baseline delegates to create_all, which already includes these
    # columns on fresh databases — only add the ones actually missing.
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("questions")}
    for name, type_ in _COLUMNS:
        if name not in cols:
            op.add_column("questions", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("questions")}
    for name, _ in _COLUMNS:
        if name in cols:
            op.drop_column("questions", name)
