"""The yarn split: material and colour become things, the name becomes a label.

docs/yarn-split.md, executed. Three parts:

  * `yarn_materials` — the seven yarn bases (YY, YST, YCA, YAC, YTX, YP,
    BJ), one row each. A NEW table, not the existing `materials`: that one
    turned out to be per-season costing rows (five copies of NEW GRASSY,
    one per season, each with its price) and styles point at it for
    costing. A registry and a price list are different things.
  * `colors` — ALASKA NIGHT, BLUSH CHAMPAGNE…, once each, with a `family`
    column for the workbook's COLOR FAMILY (filled by the stock importer).
  * `yarn_colors` — becomes the pairing: material + colour + code, parsed
    out of the name it already had. The name column STAYS, and the BOM
    (`colorway_yarns`) keeps pointing here — nothing downstream moves.

The parse: `YCA BLACK B - 1708 B` → material YCA, colour BLACK B, code
1708 B — split at the FIRST " - ". `YTX - 031` has no colour name (YTX
colours are numbered): colour stays NULL, which is why color_id is
nullable. Trims and the import's stray rows match no material prefix and
are left entirely unparsed, exactly as they were.

`material_id` was a column pointing at the costing table, NULL on every
row since 0001; it is retargeted to `yarn_materials` rather than left to
confuse the next reader.

Revision ID: 0030_yarn_split
Revises: 0029_stock_3m
Create Date: 2026-11-25
"""
from alembic import op

revision = "0030_yarn_split"
down_revision = "0029_stock_3m"
branch_labels = None
depends_on = None

MATERIALS = ["YY", "YST", "YCA", "YAC", "YTX", "YP", "BJ"]


def upgrade() -> None:
    op.execute("""
        CREATE TABLE yarn_materials (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            code text NOT NULL UNIQUE,
            description text
        )
    """)
    op.execute("INSERT INTO yarn_materials (code) VALUES "
               + ", ".join(f"('{m}')" for m in MATERIALS))

    op.execute("""
        CREATE TABLE colors (
            id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name text NOT NULL UNIQUE,
            family text
        )
    """)

    op.execute("""
        ALTER TABLE yarn_colors
            DROP CONSTRAINT yarn_colors_material_id_fkey,
            ADD CONSTRAINT yarn_colors_material_id_fkey
                FOREIGN KEY (material_id) REFERENCES yarn_materials(id),
            ADD COLUMN color_id bigint REFERENCES colors(id)
    """)

    # One statement parses, the rest join on its result. Split at the FIRST
    # " - ", prefix off the front; a row with no dash is all colour, a row
    # whose rest starts with the dash (YTX - 031) is all code.
    op.execute(r"""
        WITH parsed AS (
            SELECT y.id,
                   split_part(btrim(y.name), ' ', 1) AS pre,
                   NULLIF(btrim((regexp_match(
                       btrim(substr(btrim(y.name),
                                    length(split_part(btrim(y.name), ' ', 1)) + 1)),
                       '^(.*?)[[:space:]]*-[[:space:]]+(.+)$'))[1]), '') AS colour_dash,
                   btrim((regexp_match(
                       btrim(substr(btrim(y.name),
                                    length(split_part(btrim(y.name), ' ', 1)) + 1)),
                       '^(.*?)[[:space:]]*-[[:space:]]+(.+)$'))[2]) AS code_dash,
                   NULLIF(btrim(substr(btrim(y.name),
                       length(split_part(btrim(y.name), ' ', 1)) + 1)), '') AS rest
              FROM yarn_colors y
             WHERE split_part(btrim(y.name), ' ', 1)
                   IN ('YY','YST','YCA','YAC','YTX','YP','BJ')
        ), shaped AS (
            SELECT id, pre,
                   CASE WHEN code_dash IS NOT NULL THEN colour_dash ELSE rest END AS colour,
                   code_dash AS code
              FROM parsed
        )
        , ins AS (
            INSERT INTO colors (name)
            SELECT DISTINCT colour FROM shaped WHERE colour IS NOT NULL
            ON CONFLICT (name) DO NOTHING
        )
        UPDATE yarn_colors y
           SET prefix = s.pre,
               color_code = s.code,
               material_id = m.id
          FROM shaped s
          JOIN yarn_materials m ON m.code = s.pre
         WHERE y.id = s.id
    """)
    # color_id in a second pass: the CTE above inserts the colours and the
    # same statement cannot also read them back.
    op.execute(r"""
        UPDATE yarn_colors y
           SET color_id = c.id
          FROM colors c
         WHERE y.material_id IS NOT NULL
           AND c.name = CASE
                 WHEN y.color_code IS NOT NULL THEN
                     NULLIF(btrim((regexp_match(
                         btrim(substr(btrim(y.name), length(y.prefix) + 1)),
                         '^(.*?)[[:space:]]*-[[:space:]]+(.+)$'))[1]), '')
                 ELSE NULLIF(btrim(substr(btrim(y.name), length(y.prefix) + 1)), '')
               END
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE yarn_colors
            DROP COLUMN IF EXISTS color_id,
            DROP CONSTRAINT IF EXISTS yarn_colors_material_id_fkey
    """)
    op.execute("UPDATE yarn_colors SET material_id = NULL,"
               " prefix = NULL, color_code = NULL")
    op.execute("""
        ALTER TABLE yarn_colors
            ADD CONSTRAINT yarn_colors_material_id_fkey
                FOREIGN KEY (material_id) REFERENCES materials(id)
    """)
    op.execute("DROP TABLE IF EXISTS colors")
    op.execute("DROP TABLE IF EXISTS yarn_materials")
