"""Which channel a style sells through, and where it is finished.

Both were already in the workbooks and both were being thrown away. The
DESCRIPTION carries them as suffixes — "ALEX STRIPED CREW COTTON - X/S - 000
ONLY" — and the importer kept only the name and the size.

It is not a small thing to miss: 2,282 rows say 000 ONLY and 1,357 say Shopify
only, so roughly half of every season is single-channel while the app claimed
all of it sold on both.

whs_channel is style level because that is how the editor shows it. The sheet
is very nearly consistent at that grain — within a (style, colourway) pair it
never disagrees, and only about ten styles a season split across channels by
colourway. Those are recorded as BOTH. style_colorways.whs_channel stays free
for the day that detail is wanted.

Revision ID: 0006_channel_and_finishing
Revises: 0005_xs_weight_factor
Create Date: 2026-09-22
"""
from alembic import op

revision = "0006_channel_and_finishing"
down_revision = "0005_xs_weight_factor"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE styles ADD COLUMN whs_channel text")
    op.execute("""
        ALTER TABLE styles ADD CONSTRAINT styles_whs_channel_ck
        CHECK (whs_channel IN ('SY ONLY', '000 ONLY', 'BOTH'))
    """)
    # FAF = finishing at factory, FAH = finishing at home. S25 spelled them
    # out ("FINISHING AT FACTORY", "FINISHING TAKE HOME") before the
    # abbreviations took over in F25.
    #
    # BOTH is allowed because the older sheets mean something different by
    # this. S26 onward gives a style one marker and it reads as a property of
    # the style: 161 FAF against 55 FAH in S26, and S27 has no style carrying
    # both. S25 and F25 instead list most styles twice, once costed at the
    # factory and once taken home — 78 styles in S25, 188 in F25. Choosing one
    # of those would be inventing an answer the sheet does not give.
    op.execute("ALTER TABLE styles ADD COLUMN finishing_location text")
    op.execute("""
        ALTER TABLE styles ADD CONSTRAINT styles_finishing_location_ck
        CHECK (finishing_location IN ('FAF', 'FAH', 'BOTH'))
    """)


def downgrade():
    op.execute("ALTER TABLE styles DROP CONSTRAINT styles_finishing_location_ck")
    op.execute("ALTER TABLE styles DROP COLUMN finishing_location")
    op.execute("ALTER TABLE styles DROP CONSTRAINT styles_whs_channel_ck")
    op.execute("ALTER TABLE styles DROP COLUMN whs_channel")
