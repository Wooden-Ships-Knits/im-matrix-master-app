"""The yarn pipeline: imported figures become facts with a batch, not columns.

Until now the stock importer UPDATEd four columns on `yarn_colors`, so the
file's figures and a person's typing lived in the same place: a re-run wiped
hand edits, nothing recorded which file the numbers came from, and the 61
rows the file holds that we cannot place were printed to a terminal and
forgotten.

The shape here is the one the ERP project uses for the same workbook
(database-manangement-erp, erp/db/load + erp/db/schema), ported to our
tables. Four layers, each with one job:

  * `import_batches` / `import_rows` — one batch per file read, with its
    sha256, its modified time and the reason a newer file was passed over;
    every row's raw JSON kept under `sheet!row_no`. The raw layer stays in
    the database, so a load can be re-run or traced without the workbook.
  * `yarn_stock_lines` — one row per yarn PER BATCH: the four AV figures the
    board shows, on hand, on PO, the O4 status, the colour family, and a
    `detail` jsonb for the long tail. Readers take the newest loaded batch
    (`latest_import_batch`), so a failed load leaves the previous file live.
  * `yarn_aliases` — "this text means that yarn", confirmed by a person.
    The resolver tries it first, so a workbook spelling is answered once
    instead of going missing on every run.
  * `review_rules` / `review_items` — the queue. A row nobody can place is
    a question with a reason, not a silent skip. Confirming one writes an
    alias and the next load places it by itself.

The figures already on the board came from YARN ANALYSIS NOV 10 through the
0029-era importer. They are moved into a batch named after that file rather
than dropped: the board keeps its numbers through this migration, and the
first real extract supersedes them with a batch that has a sha256.

`yarn_colors` keeps the two facts a person owns — hex and palette — and
loses the four qty columns: the imported figure now has exactly one home.

Revision ID: 0031_yarn_pipeline
Revises: 0030_yarn_split
Create Date: 2026-11-26
"""
from alembic import op

revision = "0031_yarn_pipeline"
down_revision = "0030_yarn_split"
branch_labels = None
depends_on = None

QTY = ("qty_with_proj", "qty_without_proj",
       "qty_with_proj_3m", "qty_without_proj_3m")

# The rules a load can raise. Severity is the operator's cue, the description
# is what the queue shows: a rule without a readable description is a rule
# nobody acts on.
RULES = [
    ("YARN_UNPARSED", "error",
     "Not a yarn reference",
     "The text is not 'PREFIX COLOUR - CODE' with one of our yarn prefixes "
     "(YY, YST, YCA, YAC, YTX, YP, BJ) and a supplier code, so it cannot "
     "point at a yarn. Annotations such as CANCEL RELEASE land here."),
    ("YARN_UNKNOWN_CODE", "warning",
     "Yarn code we do not have",
     "Prefix and code parse, but no yarn in the table carries them. Either "
     "the BOM has never used this colour, or our name for it differs."),
    ("YARN_CODE_NAME_CONFLICT", "error",
     "Code belongs to another colour",
     "Prefix and code exist under a different colour name. Code and name "
     "must both agree, or a person must confirm the alias — guessing here "
     "is how one yarn becomes two."),
    ("YARN_LIST_DUPLICATE", "warning",
     "Two rows for one yarn in the file",
     "Two rows of the workbook resolve to the same yarn. The later sheet's "
     "figures are the ones loaded; the other row is recorded here."),
]


def upgrade() -> None:
    op.execute("""
        CREATE TABLE import_batches (
            id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            source_code      text NOT NULL,
            file_name        text,
            file_sha256      text,
            file_modified_at timestamptz,
            label            text,
            status           text NOT NULL DEFAULT 'staged'
                             CHECK (status IN ('staged', 'loaded', 'failed')),
            row_count        int  NOT NULL DEFAULT 0,
            notes            jsonb NOT NULL DEFAULT '[]'::jsonb,
            started_at       timestamptz NOT NULL DEFAULT now(),
            loaded_at        timestamptz
        )
    """)
    op.execute("COMMENT ON TABLE import_batches IS "
               "'One file read, with its sha256, its modified time and the "
               "notes of the read (why a newer file was passed over).'")
    op.execute("CREATE INDEX import_batches_source_idx"
               " ON import_batches (source_code, id DESC)")

    op.execute("""
        CREATE TABLE import_rows (
            batch_id bigint NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            sheet    text   NOT NULL,
            row_no   int    NOT NULL,
            data     jsonb  NOT NULL,
            PRIMARY KEY (batch_id, sheet, row_no)
        )
    """)
    op.execute("COMMENT ON TABLE import_rows IS "
               "'The staged file, one row of raw JSON per workbook row. Kept "
               "so a load can be re-run or traced without the workbook.'")

    # The newest loaded batch of a source. Every reader goes through this, so
    # a staged-but-unloaded batch (or a failed one) changes nothing on screen.
    op.execute("""
        CREATE FUNCTION latest_import_batch(p_source text) RETURNS bigint
        LANGUAGE sql STABLE AS $$
            SELECT max(id) FROM import_batches
             WHERE source_code = p_source AND status = 'loaded'
        $$
    """)

    op.execute("""
        CREATE TABLE yarn_stock_lines (
            id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            batch_id            bigint NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
            locator             text   NOT NULL,
            tab                 text,
            yarn_text           text   NOT NULL,
            yarn_color_id       bigint REFERENCES yarn_colors(id) ON DELETE SET NULL,
            resolved_by         text,
            stock_on            date,
            qty_without_proj    numeric(14,3),
            qty_with_proj       numeric(14,3),
            qty_without_proj_3m numeric(14,3),
            qty_with_proj_3m    numeric(14,3),
            on_hand_kg          numeric(14,3),
            on_po_kg            numeric(14,3),
            o4_prev             text,
            o4_now              text,
            color_family        text,
            detail              jsonb NOT NULL DEFAULT '{}'::jsonb,
            UNIQUE (batch_id, locator),
            -- One line per yarn per batch. NULLs are distinct in Postgres, so
            -- this constrains the placed rows and lets every unplaced one
            -- through: the loader keeps the later sheet and files the other
            -- row under YARN_LIST_DUPLICATE.
            UNIQUE (batch_id, yarn_color_id)
        )
    """)
    op.execute("COMMENT ON TABLE yarn_stock_lines IS "
               "'PPIC''s YARN ANALYSIS per yarn, as stated, per batch. The "
               "figures are never edited here: a person''s facts live on "
               "yarn_colors (hex, palette).'")
    op.execute("CREATE INDEX yarn_stock_lines_color_idx"
               " ON yarn_stock_lines (yarn_color_id)")

    op.execute("""
        CREATE VIEW v_yarn_stock_latest AS
        SELECT l.*
          FROM yarn_stock_lines l
         WHERE l.batch_id = latest_import_batch('yarn_analysis')
           AND l.yarn_color_id IS NOT NULL
    """)

    op.execute("""
        CREATE TABLE yarn_aliases (
            id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            alias_text    text   NOT NULL,
            source_code   text   NOT NULL DEFAULT '*',
            yarn_color_id bigint NOT NULL REFERENCES yarn_colors(id) ON DELETE CASCADE,
            note          text,
            confirmed_by  text,
            confirmed_at  timestamptz NOT NULL DEFAULT now(),
            UNIQUE (alias_text, source_code)
        )
    """)
    op.execute("COMMENT ON TABLE yarn_aliases IS "
               "'Confirmed spelling -> yarn. Tried before any parsing, so a "
               "name the workbook writes its own way is answered once.'")

    op.execute("""
        CREATE TABLE review_rules (
            code        text PRIMARY KEY,
            severity    text NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
            title       text NOT NULL,
            description text NOT NULL
        )
    """)
    op.execute("""
        CREATE TABLE review_items (
            id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            rule_code  text   NOT NULL REFERENCES review_rules(code),
            entity     text   NOT NULL DEFAULT 'yarn',
            batch_id   bigint REFERENCES import_batches(id) ON DELETE SET NULL,
            locator    text,
            raw_value  text   NOT NULL,
            detail     jsonb  NOT NULL DEFAULT '{}'::jsonb,
            status     text   NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'confirmed', 'dismissed')),
            seen_at    timestamptz NOT NULL DEFAULT now(),
            closed_at  timestamptz,
            closed_by  text,
            -- Keyed on the value, not the batch: the same unplaceable text in
            -- next month's file is the same question, already answered.
            UNIQUE (rule_code, raw_value)
        )
    """)
    op.execute("COMMENT ON TABLE review_items IS "
               "'What a load could not place, with its reason. Confirming an "
               "item writes a yarn_aliases row; the next load places it.'")
    op.execute("CREATE INDEX review_items_open_idx"
               " ON review_items (status, rule_code)")
    # Dollar-quoted: these descriptions are prose and will grow apostrophes.
    op.execute("INSERT INTO review_rules (code, severity, title, description) VALUES "
               + ", ".join("(" + ", ".join(f"$r${v}$r$" for v in row) + ")"
                           for row in RULES))

    # ---- the codeless BJ rows, under the rule the resolver actually uses
    # 0030 split every name at the first " - ", which made the sewing thread
    # "BJ BREAKER WHITE - NATURAL" a colour BREAKER WHITE with the code
    # NATURAL. app/yarn_names.py requires a code to look like a code (digits,
    # one optional letter), so those six BJ rows are name-only while the other
    # 31, which do carry a code, keep the parse they have. Only the six are
    # touched; anything wider would rewrite good rows.
    #
    # Two statements, not one with a CTE: a data-modifying CTE and the query
    # around it see the same snapshot, so an UPDATE cannot join the colours
    # its own CTE just inserted (0030 hit this and said so).
    op.execute(r"""
        INSERT INTO colors (name)
        SELECT DISTINCT btrim(substr(btrim(y.name), 4))
          FROM yarn_colors y
         WHERE btrim(upper(y.name)) LIKE 'BJ %'
           AND btrim(upper(y.name)) !~ '^BJ .+[[:space:]]*-[[:space:]]*[0-9]+( ?[A-Z])?$'
           AND btrim(substr(btrim(y.name), 4)) <> ''
        ON CONFLICT (name) DO NOTHING
    """)
    op.execute(r"""
        UPDATE yarn_colors y
           SET prefix = 'BJ', color_code = NULL, color_id = c.id
          FROM colors c
         WHERE btrim(upper(y.name)) LIKE 'BJ %'
           AND btrim(upper(y.name)) !~ '^BJ .+[[:space:]]*-[[:space:]]*[0-9]+( ?[A-Z])?$'
           AND c.name = btrim(substr(btrim(y.name), 4))
    """)

    # ---- the figures on the board today, into a batch named after their file
    op.execute("""
        INSERT INTO import_batches (source_code, file_name, label, status,
                                    loaded_at, notes)
        VALUES ('yarn_analysis', 'YARN ANALYSIS NOV 10.xlsx',
                'migrated from yarn_colors', 'loaded', now(),
                '["Figures moved out of the yarn_colors columns by migration 0031.",
                  "No sha256: the 0029-era importer did not record which copy it read.",
                  "Superseded by the first extract that does."]'::jsonb)
    """)
    op.execute("""
        INSERT INTO yarn_stock_lines (
            batch_id, locator, yarn_text, yarn_color_id, resolved_by, stock_on,
            qty_without_proj, qty_with_proj, qty_without_proj_3m, qty_with_proj_3m,
            color_family, detail)
        SELECT b.id, 'migrated!' || y.id, y.name, y.id, 'migrated', DATE '2026-11-10',
               y.qty_without_proj, y.qty_with_proj,
               y.qty_without_proj_3m, y.qty_with_proj_3m,
               c.family, '{"migrated": true}'::jsonb
          FROM yarn_colors y
          LEFT JOIN colors c ON c.id = y.color_id
          CROSS JOIN (SELECT max(id) id FROM import_batches
                       WHERE label = 'migrated from yarn_colors') b
         WHERE y.qty_without_proj IS NOT NULL OR y.qty_with_proj IS NOT NULL
            OR y.qty_without_proj_3m IS NOT NULL OR y.qty_with_proj_3m IS NOT NULL
    """)
    op.execute("""
        UPDATE import_batches b
           SET row_count = (SELECT count(*) FROM yarn_stock_lines l
                             WHERE l.batch_id = b.id)
         WHERE b.label = 'migrated from yarn_colors'
    """)

    op.execute("ALTER TABLE yarn_colors "
               + ", ".join(f"DROP COLUMN {c}" for c in QTY))


def downgrade() -> None:
    op.execute("ALTER TABLE yarn_colors "
               + ", ".join(f"ADD COLUMN {c} numeric(14,3)" for c in QTY))
    # Back where they were, from the batch the board was reading.
    op.execute("""
        UPDATE yarn_colors y
           SET qty_without_proj = l.qty_without_proj,
               qty_with_proj = l.qty_with_proj,
               qty_without_proj_3m = l.qty_without_proj_3m,
               qty_with_proj_3m = l.qty_with_proj_3m
          FROM v_yarn_stock_latest l
         WHERE l.yarn_color_id = y.id
    """)
    op.execute("DROP VIEW IF EXISTS v_yarn_stock_latest")
    op.execute("DROP TABLE IF EXISTS review_items")
    op.execute("DROP TABLE IF EXISTS review_rules")
    op.execute("DROP TABLE IF EXISTS yarn_aliases")
    op.execute("DROP TABLE IF EXISTS yarn_stock_lines")
    op.execute("DROP TABLE IF EXISTS import_rows")
    op.execute("DROP TABLE IF EXISTS import_batches")
    op.execute("DROP FUNCTION IF EXISTS latest_import_batch(text)")
