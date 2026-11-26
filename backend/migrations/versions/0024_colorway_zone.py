"""Which band of the colourway list a colour sits in.

The list is ruled into three: the sample colour above a black line, the main
colours between the lines, and a third band below a red line. Until now the
bands were positional — the black rule was drawn after whichever colour
happened to be first — so a colour could not be moved between them.

Storing the band makes it draggable, and makes the two add buttons mean
something: each adds into the band it sits under.

Backfilled so the cards look the same the moment this runs: the first
colourway of every style becomes the sample, which is exactly where the black
rule was being drawn.

Revision ID: 0024_colorway_zone
Revises: 0023_past_season_rings
Create Date: 2026-10-02
"""
from alembic import op

revision = "0024_colorway_zone"
down_revision = "0023_past_season_rings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE style_colorways
            ADD COLUMN zone text NOT NULL DEFAULT 'main'
            CHECK (zone IN ('sample', 'main', 'extra'))
    """)
    # The first colour of each style is the sample — where the rule already
    # was. DISTINCT ON picks it by the same order the card lists them in.
    op.execute("""
        UPDATE style_colorways SET zone = 'sample'
         WHERE id IN (
            SELECT DISTINCT ON (style_id) id
              FROM style_colorways
             ORDER BY style_id, sort_order, ws_tag_color
         )
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE style_colorways DROP COLUMN IF EXISTS zone")
