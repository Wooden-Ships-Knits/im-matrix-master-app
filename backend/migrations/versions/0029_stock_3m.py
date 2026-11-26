"""The 3-month availability, beside the full season.

The physical board's legend reads "AV 3 MONTHS / AV FULL SEASON" under both
bars — each chip is a pair, not one number. 0028 stored only the full-season
half; these two columns hold the 3-month half, same source sheet, columns
AV 3 MONTHS (NO PROJECTION) and AV 3 MONTHS WITH PROJECTION.

Revision ID: 0029_stock_3m
Revises: 0028_color_table
Create Date: 2026-11-24
"""
from alembic import op

revision = "0029_stock_3m"
down_revision = "0028_color_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE yarn_colors
            ADD COLUMN qty_with_proj_3m numeric,
            ADD COLUMN qty_without_proj_3m numeric
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE yarn_colors
            DROP COLUMN IF EXISTS qty_with_proj_3m,
            DROP COLUMN IF EXISTS qty_without_proj_3m
    """)
