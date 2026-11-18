"""How this style's colourways are named.

The workbook prints a short code under the repeat line of every column —
"TAG: C1", "TAG: C1/C2", "TAG: C1 STRIPE". It says which yarn-colour scheme
the names below it belong to, so a reader knows whether "YCA ALMOND BUTTER"
is the whole garment or one of two colours in it.

A free-text column rather than a lookup: the workbook writes whatever the
scheme is, and the vocabulary is still growing (C1, C2, STRIPE, and
combinations of them). A table of allowed tags would be a table nobody
maintains, and the first new scheme would be typed into the notes instead.

Revision ID: 0025_colorway_tag
Revises: 0024_colorway_zone
Create Date: 2026-11-16
"""
from alembic import op

revision = "0025_colorway_tag"
down_revision = "0024_colorway_zone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN colorway_tag text")
    # Nothing to backfill: the importer never read this row of the workbook,
    # so every style starts without a tag and the card prints the line blank.


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS colorway_tag")
