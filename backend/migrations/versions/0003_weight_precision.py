"""Widen weights and percentages — the source carries 5 decimals.

Caught by a round trip: S27's X/L weight for RIHANNA CARDI CHUNKY COTTON is
0.39325, and numeric(8,4) silently returned 0.3933. Tolerances are the same
(0.28704), and a yarn percentage is 86.776859... once converted from the
sheet's fraction.

Rounding here would fail the golden test before it started.

Revision ID: 0003_weight_precision
Revises: 0002_style_overrides
Create Date: 2026-09-21
"""
from alembic import op

revision = "0003_weight_precision"
down_revision = "0002_style_overrides"
branch_labels = None
depends_on = None

WIDEN = [
    ("style_sizes", "pre_component_wt_kg", "numeric(10,5)", "numeric(8,4)"),
    ("style_sizes", "finished_wt_kg", "numeric(10,5)", "numeric(8,4)"),
    ("colorway_yarns", "percent", "numeric(9,6)", "numeric(7,4)"),
    ("season_rates", "plastic_wt_kg", "numeric(10,5)", "numeric(8,4)"),
    ("season_rates", "wt_tolerance_low", "numeric(10,5)", "numeric(8,4)"),
    ("season_rates", "wt_tolerance_high", "numeric(10,5)", "numeric(8,4)"),
    ("season_rates", "distribution_wt_add_kg", "numeric(10,5)", "numeric(8,4)"),
]


def upgrade() -> None:
    for table, column, new, _old in WIDEN:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {new};")


def downgrade() -> None:
    for table, column, _new, old in WIDEN:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {old};")
