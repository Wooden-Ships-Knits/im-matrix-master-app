"""A style that exists but has no place on the sheet yet.

Adding a style to a collection puts it at the end, which is right when you
know it belongs there. It is wrong when the garment is going somewhere in the
middle and nobody has decided where — the team would add it, scroll to the
bottom, and drag it back up past thirty cards.

Parked styles are held in a tray on the Matrix screen instead. They are real
styles, editable like any other, but they are not in the running order and do
not print. Dropping one onto a card is what places it, and placing it is what
unparks it — set_matrix_order clears this flag for everything it numbers, so
the two can never disagree.

Revision ID: 0021_matrix_parked
Revises: 0020_matrix_construction
Create Date: 2026-10-01
"""
from alembic import op

revision = "0021_matrix_parked"
down_revision = "0020_matrix_construction"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE styles ADD COLUMN matrix_parked boolean NOT NULL DEFAULT false")
    # Every style that exists today has a place on the sheet, so none of them
    # are parked; the default covers it.


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_parked")
