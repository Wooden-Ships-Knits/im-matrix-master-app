"""The circles are about where a garment came FROM, not where it is going.

Built the wrong way round: the two circles above the photo were filled from
the NEXT season's channels, and the ring on them was a hand-applied mark. They
are meant to say this style is a repeat OF A PAST season — F26 running again
what F25 ran.

Only the columns holding the hand-applied ring are renamed here. The circles'
fill is computed, so that moves in repo.py with no migration; and
repeats_next / next_season_loaded stay exactly as they are, because the Sales
History verdict (repeat + sold over threshold) really is forward-looking and
reads them.

What the ring colours mean is NOT settled — see docs/caveats.md §"The circle
rings". Orange is meant to be "ran in the two previous seasons"; yellow is
meant to be "ran before, but that past season is not confirmed yet", and what
makes a season confirmed has not been decided. So the ring stays hand-applied
for now and nothing here derives it.

Revision ID: 0023_past_season_rings
Revises: 0022_name_history
Create Date: 2026-10-02
"""
from alembic import op

revision = "0023_past_season_rings"
down_revision = "0022_name_history"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Renamed rather than dropped and re-added: these hold marks the team has
    # already applied, and the mark means the same thing on the same circle.
    op.execute("ALTER TABLE styles RENAME COLUMN next_sy_mark TO past_sy_mark")
    op.execute("ALTER TABLE styles RENAME COLUMN next_000_mark TO past_000_mark")


def downgrade() -> None:
    op.execute("ALTER TABLE styles RENAME COLUMN past_sy_mark TO next_sy_mark")
    op.execute("ALTER TABLE styles RENAME COLUMN past_000_mark TO next_000_mark")
