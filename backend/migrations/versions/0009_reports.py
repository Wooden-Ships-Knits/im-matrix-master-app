"""Reports the operator prepares and the boss signs off.

The first piece of workflow in the application. A report is a named view of
the data at a moment — a season's pricing, a costing check — that someone
prepares, submits, and someone else approves or sends back.

`filters` holds the browse filters the report covers, so it can be reopened
and exported rather than being a frozen copy. The numbers therefore move if
the data moves; a report is a request to look at something, not a snapshot.
Freezing one is a later decision and would want its own table.

prepared_by and decided_by are free text for now. There is no login, and a
shared password would not say who anyway (prd.md §10.8). When named accounts
exist these become the place the name lands rather than something typed.

Revision ID: 0009_reports
Revises: 0008_style_attributes
Create Date: 2026-09-23
"""
from alembic import op

revision = "0009_reports"
down_revision = "0008_style_attributes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE reports (
        id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        title         text NOT NULL,
        kind          text NOT NULL DEFAULT 'style list',
        season_id     bigint REFERENCES seasons(id) ON DELETE SET NULL,
        filters       jsonb NOT NULL DEFAULT '{}'::jsonb,
        note          text,
        status        text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','submitted','approved','rejected')),
        prepared_by   text,
        decided_by    text,
        decision_note text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        submitted_at  timestamptz,
        decided_at    timestamptz
    )
    """)
    op.execute("CREATE INDEX reports_status_idx ON reports (status, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reports")
