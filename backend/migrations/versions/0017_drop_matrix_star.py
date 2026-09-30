"""Drop matrix_star: the star follows the band rather than standing alone.

It was added in 0016 as a mark of its own. It is not one — a banded style is
starred and an unbanded one is not, so the column could only ever repeat what
matrix_band already says, and two fields that must agree eventually will not.

No data is lost: nothing was ever starred.

Revision ID: 0017_drop_matrix_star
Revises: 0016_matrix_band
Create Date: 2026-09-30
"""
from alembic import op

revision = "0017_drop_matrix_star"
down_revision = "0016_matrix_band"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_star")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE styles ADD COLUMN matrix_star boolean NOT NULL DEFAULT false")
