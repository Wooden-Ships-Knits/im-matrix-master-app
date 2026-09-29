"""Where a style sits on the Matrix Master sheet.

The order the cards are worked through is a decision the team makes together —
which garments sit beside each other when the boss reviews them — so it
belongs with the style rather than in whichever browser did the dragging.
This replaces the per-browser order the print sheet kept in localStorage.

Nullable on purpose. A style nobody has placed sorts after the ones that have
been, in name order, which is where a new style should appear: at the end of
its block, waiting to be put somewhere.

Not unique, and not a constraint: two styles sharing a number is a tie broken
by name, not an error worth refusing a save over.

Revision ID: 0012_matrix_order
Revises: 0011_style_steps
Create Date: 2026-09-29
"""
from alembic import op

revision = "0012_matrix_order"
down_revision = "0011_style_steps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN matrix_order integer")
    # The sheet reads a whole collection of one season at a time.
    op.execute("""
        CREATE INDEX styles_matrix_order
            ON styles (season_id, collection_id, matrix_order)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS styles_matrix_order")
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_order")
