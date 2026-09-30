"""A ring the team can put round either next-season circle.

The circles say which channels the next season's version of a style is set to
sell through. The ring is an annotation on top of that — like the highlighter
bar and the colourway pen, it means whatever the collection is being worked
through for, and the app only records which colour.

Two columns rather than one: the circles are marked independently, and a style
is routinely wanted on one channel and questioned on the other.

Revision ID: 0015_circle_rings
Revises: 0014_colorway_mark
Create Date: 2026-09-30
"""
from alembic import op

revision = "0015_circle_rings"
down_revision = "0014_colorway_mark"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN next_sy_mark text")
    op.execute("ALTER TABLE styles ADD COLUMN next_000_mark text")


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS next_sy_mark")
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS next_000_mark")
