"""A colour the team puts on a colourway's name.

The workbook writes some colourway names in green and some in red. Like the
highlighter bar on the card, it carries no fixed meaning — it is a pen, and
what it means is whatever the collection is being worked through for.

A name, not a hex, for the same reason as matrix_highlight: the palette is a
presentation choice and the data should outlive an argument about it.

Nullable, meaning the ordinary colour. Most colourways will never carry one,
and a row per colourway saying "no mark" would be noise.

Revision ID: 0014_colorway_mark
Revises: 0013_matrix_highlight
Create Date: 2026-09-30
"""
from alembic import op

revision = "0014_colorway_mark"
down_revision = "0013_matrix_highlight"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE style_colorways ADD COLUMN mark text")


def downgrade() -> None:
    op.execute("ALTER TABLE style_colorways DROP COLUMN IF EXISTS mark")
