"""A background behind a colourway's name, separate from the pen on the name.

style_colorways.mark is the colour the name is written in. This is the colour
behind it. They are set independently and mean different things to whoever is
working the collection, so they are two columns rather than one.

Revision ID: 0018_colorway_highlight
Revises: 0017_drop_matrix_star
Create Date: 2026-09-30
"""
from alembic import op

revision = "0018_colorway_highlight"
down_revision = "0017_drop_matrix_star"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE style_colorways ADD COLUMN highlight text")


def downgrade() -> None:
    op.execute("ALTER TABLE style_colorways DROP COLUMN IF EXISTS highlight")
