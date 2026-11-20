"""Which part of the garment a yarn line is for.

A pullover is not knitted from one yarn in one place. The body can be a
2-ply cotton while the collar, cuffs and hem are a rib in something else, and
until now the bill of materials said only "this colourway uses these yarns"
with no way to say which went where. The team read it off the drawing
instead.

NULL means the line is for the whole garment, which is what all 8,465
existing lines mean: nobody has ever split one. So this adds a distinction
without claiming any line has been placed.

Deliberately not a lookup table. The parts of a pullover are a short, fixed
vocabulary that belongs to the drawing — a part with no shape on the
blueprint cannot be pointed at, so a row somebody adds to a table would be a
part nothing can select.

Revision ID: 0027_bom_component
Revises: 0026_design_marks
Create Date: 2026-11-18
"""
from alembic import op

revision = "0027_bom_component"
down_revision = "0026_design_marks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE colorway_yarns ADD COLUMN component text")
    # No backfill and no default: an existing line is for the whole garment,
    # and NULL is how that is said. Writing 'body' on all of them would claim
    # 8,465 decisions nobody made.


def downgrade() -> None:
    op.execute("ALTER TABLE colorway_yarns DROP COLUMN IF EXISTS component")
