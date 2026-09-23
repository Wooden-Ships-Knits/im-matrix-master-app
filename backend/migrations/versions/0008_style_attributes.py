"""The garment attributes the Matrix screen collects.

These describe what the sweater is, rather than what it costs: how it is
finished at the bottom, what the sleeves are like, whether it is printed or
distressed, and which style it repeats from.

All text, and deliberately not constrained. Nothing in the five workbooks
states the vocabulary, so it teaches itself the way the packing and yarn
fields do — the alternative is inventing a list and being wrong about it.
`ply` is the exception: it is a count.

base_body and print_placement already existed and are reused rather than
duplicated.

Revision ID: 0008_style_attributes
Revises: 0007_prod_minutes_packing_volume
Create Date: 2026-09-23
"""
from alembic import op

revision = "0008_style_attributes"
down_revision = "0007_prod_minutes_packing_volume"
branch_labels = None
depends_on = None

COLUMNS = [
    ("bottom_type", "text"),
    ("bottom_rib", "text"),
    ("similar_style_past", "text"),   # the style this one repeats from
    ("distressed", "text"),
    ("sleeve_category", "text"),
    ("sleeve_length", "text"),
    ("length_category", "text"),
    ("yarn_type", "text"),            # YCA, YST, YAC, YTX, YP
    ("ply", "smallint"),
]


def upgrade() -> None:
    for name, kind in COLUMNS:
        op.execute(f"ALTER TABLE styles ADD COLUMN {name} {kind}")


def downgrade() -> None:
    for name, _kind in COLUMNS:
        op.execute(f"ALTER TABLE styles DROP COLUMN {name}")
