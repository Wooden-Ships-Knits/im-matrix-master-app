"""Remember which X/S grading factor a style uses.

Only S/M is a real measurement. The sheet derives the rest from it, and says
so in the formulas: M/L is =S/M*1.1 and X/L is =M/L*1.1, so 1.21 of S/M.

X/S is the one that varies. Both 0.9 and 0.92 appear as literals, per style
and in every season — 439 against 82 in S27, 88 against 310 in F26. Spring
leans one way and Fall the other, but neither is a rule, so the choice has to
be stored rather than inferred.

The default is 0.9. Existing rows are left at the default and their stored
weights are untouched: some styles were hand-adjusted (=REF+0.002, or a
literal subtraction) and recomputing them here would quietly change data the
sheet states outright.

Revision ID: 0005_xs_weight_factor
Revises: 0004_costing_view
Create Date: 2026-09-22
"""
from alembic import op

revision = "0005_xs_weight_factor"
down_revision = "0004_costing_view"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE styles
            ADD COLUMN xs_weight_factor numeric(4,3) NOT NULL DEFAULT 0.9
    """)
    # Only the two the sheet actually uses.
    op.execute("""
        ALTER TABLE styles
            ADD CONSTRAINT styles_xs_weight_factor_ck
            CHECK (xs_weight_factor IN (0.9, 0.92))
    """)
    # Where the imported weights already say which factor was used, keep it.
    op.execute("""
        UPDATE styles s SET xs_weight_factor = 0.92
        FROM (
            SELECT ss.style_id,
                   max(ss.finished_wt_kg) FILTER (WHERE z.code = 'X/S') AS xs,
                   max(ss.finished_wt_kg) FILTER (WHERE z.code = 'S/M') AS sm
            FROM style_sizes ss JOIN sizes z ON z.id = ss.size_id
            GROUP BY ss.style_id
        ) w
        WHERE w.style_id = s.id AND w.sm > 0
          AND abs(w.xs / w.sm - 0.92) < 0.0005
    """)


def downgrade():
    op.execute("ALTER TABLE styles DROP CONSTRAINT styles_xs_weight_factor_ck")
    op.execute("ALTER TABLE styles DROP COLUMN xs_weight_factor")
