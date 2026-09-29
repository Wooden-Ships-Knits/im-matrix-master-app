"""The operator's checklist: which preparation steps a style has finished.

The Matrix Master workbook keeps this as a block of rows per style, greyed in
when done — IM, IM-P, Y%, P, S, C-PB, C-IM, SW-S, SW-R. It is a checklist, not
a pipeline: the rows are independent, in no fixed order, and a style can have
any combination finished.

A row exists only when a step is done; unticking deletes it. That is why the
step is a value rather than a column — this list has visibly grown over the
seasons, and the next step added should be data, not another migration. It
also means "done" cannot be half-recorded: there is a row, with who and when,
or there is nothing.

The vocabulary is NOT constrained by a CHECK. A typo is cheap to fix and
visible in the UI, whereas a constraint means a migration every time the
operators add a step — which is exactly the friction that keeps this kind of
thing in a spreadsheet.

Revision ID: 0011_style_steps
Revises: 0010_style_sales
Create Date: 2026-09-28
"""
from alembic import op

revision = "0011_style_steps"
down_revision = "0010_style_sales"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE style_steps (
        style_id  bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
        step      text   NOT NULL,
        done_by   text,
        done_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (style_id, step)
    )
    """)
    # The grid reads every step for a season at once, so the index that
    # matters is the one that finds a style's rows.
    op.execute("CREATE INDEX style_steps_by_step ON style_steps (step)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS style_steps")
