"""What a style and its colourways have been called before.

Names change mid-season, and until now nothing recorded it: style_name was
overwritten and the old spelling was gone. That is the single biggest source
of wrong sales figures here — Shopify and Salesforce keep selling under the
name they were given, so a rename splits one garment's sales in two. F26's
RIHANNA CARDI CHUNKY COTTON was S26's RIHANNA CHUNKY CARDI COTTON, and 463
units landed on neither.

Two jobs from one table:

  - the editor shows it, so a rename is visible rather than silent
  - the sales matcher reads it, so a figure filed under the old name still
    finds its garment

Deliberately not keyed to style_colorways.id: save_style replaces a style's
colourways wholesale, so those ids do not survive a save. Colour history is
matched by name and chained — old -> new -> whatever it is called now.

There is no `changed_by`: this application has no accounts (app/auth.py), and
a column that could only ever be guessed at is worse than no column.

Revision ID: 0022_name_history
Revises: 0021_matrix_parked
Create Date: 2026-10-01
"""
from alembic import op

revision = "0022_name_history"
down_revision = "0021_matrix_parked"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE name_history (
            id          bigserial PRIMARY KEY,
            style_id    bigint NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
            scope       text   NOT NULL CHECK (scope IN ('style', 'colorway')),
            old_value   text   NOT NULL,
            new_value   text   NOT NULL,
            changed_at  timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX name_history_style ON name_history (style_id, changed_at DESC)")
    # The matcher reads every colourway rename for a season at once.
    op.execute("CREATE INDEX name_history_scope ON name_history (scope)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS name_history")
