"""Per-style overrides for the fields the UI actually edits.

schema.md §4.1 keeps fifteen fields on `seasons` because each holds a single
value for a whole season, with the note: "if a style ever needs a different
value, add a nullable override column then". The client is that need — its
Packaging, Shipping and Yarn sections edit them per style.

NULL here means "use the season default". Nothing is moved off `seasons`.

Revision ID: 0002_style_overrides
Revises: 0001_initial
Create Date: 2026-09-21
"""
from alembic import op

revision = "0002_style_overrides"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

# (column, type) — NULL = fall back to the season default where one exists.
COLUMNS = [
    # identity the old app carried that v2 derives or had no home for
    ("sku_code", "text"),
    ("sub_group", "text"),
    # channel flags, edited as two checkboxes
    ("sell_sy", "boolean NOT NULL DEFAULT true"),
    ("sell_000", "boolean NOT NULL DEFAULT true"),
    # season defaults, overridable per style
    ("construction", "text"),
    ("composition_care", "text"),
    ("color_sequence", "text"),
    ("tension", "text"),
    ("logo_label", "text"),
    ("details", "text"),
    ("bagging_method", "text"),
    ("polybag_sticker", "text"),
    ("packing_method", "text"),
    ("packing_in_box", "text"),
    ("box_labeling", "text"),
    ("ship_via", "text"),
    ("hang_tag", "text"),
    ("special_instructions", "text"),
    # customs, until duty_categories is populated per season
    ("hs_code", "text"),
    ("duty_category", "text"),
    # the 000 (wholesale) price the old app carried alongside SY
    ("price_000", "numeric(12,2)"),
    # the UI edits box dimensions directly; box_type_id stays for when a
    # box list is introduced (schema.md §2.3)
    ("box_length_cm", "numeric(8,2)"),
    ("box_depth_cm", "numeric(8,2)"),
    ("box_height_cm", "numeric(8,2)"),
    # style-level default; style_sizes.pcs_per_box remains the per-size value
    ("pcs_per_box", "smallint"),
]


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.execute(f"ALTER TABLE styles ADD COLUMN {name} {type_};")


def downgrade() -> None:
    for name, _ in COLUMNS:
        op.execute(f"ALTER TABLE styles DROP COLUMN IF EXISTS {name};")
