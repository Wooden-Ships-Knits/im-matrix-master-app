"""Sold quantities, by style and colourway, per channel and period.

What the Sales History sheet prints. Salesforce fills WHS 000, Shopify fills
SY, both over one period.

Stored rather than fetched per view, for three reasons. Both sources are live
API calls, so printing would otherwise wait on Salesforce and Shopify being
up. The service that fetches them keeps only its newest result per report
type, so a sheet printed last month could not otherwise be reproduced. And a
figure someone signed off should not change underneath the signature.

source_style and source_color keep what the source actually said, so a row
that matches no style is still here to look at rather than silently dropped —
the two systems name colours independently and some will not line up.

Revision ID: 0010_style_sales
Revises: 0009_reports
Create Date: 2026-09-24
"""
from alembic import op

revision = "0010_style_sales"
down_revision = "0009_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE style_sales (
        id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        style_id      bigint REFERENCES styles(id) ON DELETE CASCADE,
        colorway_id   bigint REFERENCES style_colorways(id) ON DELETE CASCADE,
        season_id     bigint REFERENCES seasons(id) ON DELETE SET NULL,
        channel       text NOT NULL CHECK (channel IN ('WHS_000', 'SY')),
        quantity      integer NOT NULL DEFAULT 0,
        period_start  date NOT NULL,
        period_end    date NOT NULL,
        -- what the source called it, kept whether or not it matched
        source_style  text,
        source_color  text,
        fetched_at    timestamptz NOT NULL DEFAULT now(),
        CHECK (period_start <= period_end)
    )
    """)
    # One figure per colourway, channel and period. Re-running a fetch for the
    # same window replaces rather than accumulates.
    op.execute("""
        CREATE UNIQUE INDEX style_sales_unique
            ON style_sales (colorway_id, channel, period_start, period_end)
         WHERE colorway_id IS NOT NULL
    """)
    op.execute("""
        CREATE INDEX style_sales_lookup
            ON style_sales (style_id, channel, period_start, period_end)
    """)
    # Unmatched rows are found by this, and they are the ones worth reading.
    op.execute("""
        CREATE INDEX style_sales_unmatched ON style_sales (period_start)
         WHERE style_id IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS style_sales")
