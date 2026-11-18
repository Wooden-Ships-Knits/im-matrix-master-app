"""Where each knit slot is pointed at on the garment photo.

The workbook's design sheet draws an arrow from "C1" to the body of the
sweater, "C2" to the yoke, "C3" to the argyle. Without them the sheet says
which yarns a style uses but not which part of the garment each one is, and
the person knitting it has to guess from the picture.

Stored as a map of slot to position — {"1": {"x": 0.34, "y": 0.22}} — rather
than a table, because it is presentation: a handful of coordinates per style,
always read and written together with the sheet, and never joined to, grouped
by, or filtered on.

The coordinates are FRACTIONS of the photo, 0 to 1, not pixels. The sheet is
read on a screen and printed on paper at different sizes, and a pixel offset
that was on the yoke in the browser would be somewhere else on the page.

A slot with no entry has not been placed yet and waits in the tray beside the
photo. That is a real state, not a missing one: a style can have four yarns
and only two of them worth pointing at.

Revision ID: 0026_design_marks
Revises: 0025_colorway_tag
Create Date: 2026-11-17
"""
from alembic import op

revision = "0026_design_marks"
down_revision = "0025_colorway_tag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE styles ADD COLUMN design_marks jsonb NOT NULL"
        " DEFAULT '{}'::jsonb")
    # Nothing to backfill. The arrows live in the workbook's drawing layer,
    # which the importer has never read, so every style starts unplaced.


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS design_marks")
