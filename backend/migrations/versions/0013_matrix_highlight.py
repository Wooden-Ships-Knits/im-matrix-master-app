"""A highlighter the team can put on a card.

The workbook has a row above each style that gets coloured in by hand, with
no fixed meaning — it marks whatever the collection is being worked through
for that week. So this stores which colour, not what it means.

A name rather than a hex. The palette is a presentation choice and will be
argued about; the data should survive someone deciding that green was too
bright. Unconstrained for the same reason the checklist steps are: a fourth
colour should be a line of CSS, not a migration.

Revision ID: 0013_matrix_highlight
Revises: 0012_matrix_order
Create Date: 2026-09-30
"""
from alembic import op

revision = "0013_matrix_highlight"
down_revision = "0012_matrix_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN matrix_highlight text")


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_highlight")
