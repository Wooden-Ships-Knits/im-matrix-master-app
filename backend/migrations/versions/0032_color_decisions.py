"""The decisions layer: colour subs, sub proposals, and the CSAT pages.

0031 made the Color Table state what PPIC's file says. This is the other
half of the ERP's Color Board (database-manangement-erp,
erp/app/color_board_api.py): what the team wants to DO about it.

Three things, all of them suggestions by people, none of them touching the
imported figures:

  * `yarn_subs` — "use 48 kg of TWILIGHT SKY to cover INDIGO's shortage",
    PPIC's own SUB COLOR column as a record rather than a cell. The minus
    colour's AV goes up by the kilos, the sub colour's goes down.
  * `yarn_proposals` — "in this colourway, knit YCA B instead of YCA A".
    One open proposal per colourway and yarn: proposing again replaces the
    old one, proposing the original yarn back withdraws it.
  * `csat_pages` — the Color Sequence Adjustment Table: colours laid out
    freely on a shared page to compare them, several named pages. (The ERP
    calls this the playground; CSAT is the name this team uses.)

Nothing is ever deleted. A change that is withdrawn or replaced keeps its
row, its timestamps and who closed it, because "why did we stop proposing
that" is a question somebody asks three months later.

One deliberate difference from the ERP: their board is rebuilt from the
files on every load, so colourway ids change and open proposals have to be
re-attached by label on every read. Ours are database rows that keep their
ids, so no relinking is needed — but the labels are still written onto each
row, because the record of what was proposed should read as words without
joining four tables.

The other difference: the ERP computes the kilos a proposal moves from the
order book times kg-per-piece. PDM has neither, so `kg` is typed by the
person proposing, and the AV-after figures move only for the changes that
carry one.

Revision ID: 0032_color_decisions
Revises: 0031_yarn_pipeline
Create Date: 2026-11-26
"""
from alembic import op

revision = "0032_color_decisions"
down_revision = "0031_yarn_pipeline"
branch_labels = None
depends_on = None

STATUS = "CHECK (status IN ('open', 'replaced', 'withdrawn'))"


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE yarn_subs (
            id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            short_id    bigint NOT NULL REFERENCES yarn_colors(id) ON DELETE CASCADE,
            short_label text   NOT NULL,
            sub_id      bigint NOT NULL REFERENCES yarn_colors(id) ON DELETE CASCADE,
            sub_label   text   NOT NULL,
            kg          numeric(12,2) NOT NULL CHECK (kg > 0 AND kg <= 100000),
            note        text,
            who         text,
            status      text NOT NULL DEFAULT 'open' {STATUS},
            created_at  timestamptz NOT NULL DEFAULT now(),
            closed_at   timestamptz,
            closed_by   text,
            CHECK (short_id <> sub_id)
        )
    """)
    op.execute("COMMENT ON TABLE yarn_subs IS "
               "'Kilos of one colour used to cover another colour''s shortage, "
               "as PPIC''s SUB COLOR column says it. Suggestions, never stock.'")
    # One OPEN sub per pair; the closed ones pile up behind it as history.
    op.execute("CREATE UNIQUE INDEX yarn_subs_one_open"
               " ON yarn_subs (short_id, sub_id) WHERE status = 'open'")
    op.execute("CREATE INDEX yarn_subs_open_idx ON yarn_subs (status)")

    op.execute(f"""
        CREATE TABLE yarn_proposals (
            id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            colorway_id   bigint NOT NULL REFERENCES style_colorways(id) ON DELETE CASCADE,
            season        text,
            style_name    text,
            colorway_name text,
            slots         text,
            from_id       bigint NOT NULL REFERENCES yarn_colors(id) ON DELETE CASCADE,
            from_label    text   NOT NULL,
            to_id         bigint NOT NULL REFERENCES yarn_colors(id) ON DELETE CASCADE,
            to_label      text   NOT NULL,
            kg            numeric(12,2) CHECK (kg IS NULL OR (kg >= 0 AND kg <= 100000)),
            note          text,
            who           text,
            status        text NOT NULL DEFAULT 'open' {STATUS},
            created_at    timestamptz NOT NULL DEFAULT now(),
            closed_at     timestamptz,
            closed_by     text,
            CHECK (from_id <> to_id)
        )
    """)
    op.execute("COMMENT ON TABLE yarn_proposals IS "
               "'Proposed yarn swaps per colourway. The BOM is not touched: "
               "a proposal is what somebody suggests, not what is knitted.'")
    op.execute("CREATE UNIQUE INDEX yarn_proposals_one_open"
               " ON yarn_proposals (colorway_id, from_id) WHERE status = 'open'")
    op.execute("CREATE INDEX yarn_proposals_open_idx ON yarn_proposals (status, to_id)")

    op.execute("""
        CREATE TABLE csat_pages (
            name       text PRIMARY KEY,
            title      text,
            focus_id   bigint REFERENCES yarn_colors(id) ON DELETE SET NULL,
            items      jsonb NOT NULL DEFAULT '[]'::jsonb,
            updated_at timestamptz NOT NULL DEFAULT now(),
            updated_by text
        )
    """)
    op.execute("COMMENT ON TABLE csat_pages IS "
               "'Color Sequence Adjustment Table: colours placed freely on a "
               "shared page to compare them. items = [{y, x, top}], x as a "
               "share of the page width so it survives a narrower screen.'")
    # Page 1 always exists: it is cleared, never deleted.
    op.execute("INSERT INTO csat_pages (name, title) VALUES ('default', 'Page 1')")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS csat_pages")
    op.execute("DROP TABLE IF EXISTS yarn_proposals")
    op.execute("DROP TABLE IF EXISTS yarn_subs")
