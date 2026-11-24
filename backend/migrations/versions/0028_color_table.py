"""The Color Table: palettes, swatch colour and stock quantities.

The team keeps a hand-arranged board of the season's yarn colours — groups
like "Overpriced" or "Open Color" with a swatch per colour and how much of
it is available. Until now that lived outside the app. This gives
yarn_colors the four facts the board shows that the BOM import never knew:

  * palette_id — which named group the colour is pinned under. NULL is most
    rows: a colour nobody has sorted is not in a group, and the page shows
    it under "Unsorted" rather than inventing one.
  * hex — what the swatch looks like. Typed in by a person; the yarn names
    ("YST ARTIC FOX - 507") carry no colour a machine could derive.
  * qty_with_proj / qty_without_proj — kilos available counting and not
    counting projected orders. Entered by hand for the colours that matter;
    NULL means nobody has said, which is different from 0 (none left).

Palettes are a lookup table, unlike GARMENT_PARTS (0027), because they are
the team's own vocabulary: the whole point is making a new group on the day
a new story is planned, without a deploy.

ON DELETE SET NULL: deleting a palette un-sorts its colours instead of
taking them off the board.

Revision ID: 0028_color_table
Revises: 0027_bom_component
Create Date: 2026-11-24
"""
from alembic import op

revision = "0028_color_table"
down_revision = "0027_bom_component"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE yarn_palettes (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name text NOT NULL UNIQUE,
            sort_order smallint NOT NULL DEFAULT 0
        )
    """)
    op.execute("""
        ALTER TABLE yarn_colors
            ADD COLUMN palette_id bigint REFERENCES yarn_palettes(id)
                ON DELETE SET NULL,
            ADD COLUMN hex text,
            ADD COLUMN qty_with_proj numeric,
            ADD COLUMN qty_without_proj numeric
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE yarn_colors
            DROP COLUMN IF EXISTS palette_id,
            DROP COLUMN IF EXISTS hex,
            DROP COLUMN IF EXISTS qty_with_proj,
            DROP COLUMN IF EXISTS qty_without_proj
    """)
    op.execute("DROP TABLE IF EXISTS yarn_palettes")
