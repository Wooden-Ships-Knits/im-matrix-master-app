"""A second bar on the card, and a star at the end of it.

The workbook carries more than one hand-applied mark per style — the legend
has a purple band and a separate star — so the card needs more than one place
to put them. Like the first bar, neither says anything the app understands.

The band is a colour name rather than a boolean even though it has one colour
today, so a second one is a line of CSS rather than a migration. The star is a
boolean because a star is either there or it is not.

Revision ID: 0016_matrix_band
Revises: 0015_circle_rings
Create Date: 2026-09-30
"""
from alembic import op

revision = "0016_matrix_band"
down_revision = "0015_circle_rings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN matrix_band text")
    op.execute("ALTER TABLE styles ADD COLUMN matrix_star boolean NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_band")
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_star")
