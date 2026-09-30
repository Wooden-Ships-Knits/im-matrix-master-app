"""Split the two Constructions apart.

There are two, and they were sharing one column:

  - the knit construction, on the Yarn screen. MACHINE KNIT on 1,240 styles,
    and that is what the existing data is.
  - the Matrix one, which the workbook fills with things like "Sido Bolong" —
    a stitch pattern, not how the garment is made.

styles.construction keeps the first, since it already holds it. This is the
second, and it starts empty: nothing imported has ever carried it, and
defaulting it to MACHINE KNIT would be asserting the wrong one on 1,464 rows.

Revision ID: 0020_matrix_construction
Revises: 0019_needs_photo
Create Date: 2026-09-30
"""
from alembic import op

revision = "0020_matrix_construction"
down_revision = "0019_needs_photo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE styles ADD COLUMN matrix_construction text")


def downgrade() -> None:
    op.execute("ALTER TABLE styles DROP COLUMN IF EXISTS matrix_construction")
