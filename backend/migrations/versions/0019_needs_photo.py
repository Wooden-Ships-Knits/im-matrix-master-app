"""NEED NEW PHOTO, from the workbook's legend.

The one hand-applied mark that says something specific: this style's picture
is wrong or missing and someone has to reshoot it. Unlike the bands and pens,
it has a fixed meaning, so it is a boolean rather than a colour.

It shares the row with the next-season circles — on the card that row shows
the circles, or this banner when it is set. A style that needs a photo is
being flagged for the photographer, and where it sells next season is not the
question being asked at that moment.

Revision ID: 0019_needs_photo
Revises: 0018_colorway_highlight
Create Date: 2026-09-30
"""
from alembic import op

revision = "0019_needs_photo"
down_revision = "0018_colorway_highlight"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE styles ADD COLUMN needs_photo boolean NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS needs_photo")
