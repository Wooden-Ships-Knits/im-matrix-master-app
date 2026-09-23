"""Give every style a product, so the same garment is one thing across seasons.

A product is the sweater; a style is that sweater in one season. Sales reports
merge on the product, which is the whole reason this application exists
(identity.md).

This links only what is certain: styles whose names match exactly. That
catches the repeats where nobody renamed anything. Renames are not guessed at
here — the sheet's SIMILAR & REPEAT PRICE note suggests many more, but it is a
pricing comparison, not a statement that two styles are the same garment, and
merging sales on a guess is the one mistake that would be hard to notice.
Those are confirmed one at a time in the editor.

Idempotent: run it again after an import and only the new styles change.

    docker compose exec backend python -m scripts.link_products
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import pool, transaction  # noqa: E402


def main():
    with transaction() as conn:
        with conn.cursor() as cur:
            # One product per distinct name. The earliest season the name
            # appears in supplies the spelling and the first_season.
            cur.execute("""
                INSERT INTO products (display_name, first_season_id)
                SELECT DISTINCT ON (upper(btrim(s.style_name)))
                       s.style_name, s.season_id
                FROM styles s
                JOIN seasons se ON se.id = s.season_id
                WHERE btrim(coalesce(s.style_name, '')) <> ''
                  AND NOT EXISTS (
                      SELECT 1 FROM products p
                      WHERE upper(btrim(p.display_name)) = upper(btrim(s.style_name)))
                ORDER BY upper(btrim(s.style_name)), se.season_number
            """)
            created = cur.rowcount

            cur.execute("""
                UPDATE styles s SET product_id = p.id
                FROM products p
                WHERE upper(btrim(p.display_name)) = upper(btrim(s.style_name))
                  AND s.product_id IS DISTINCT FROM p.id
            """)
            linked = cur.rowcount

            # Every name a product has gone by, per season. This is what a
            # later rename gets added to, and what a sales feed looks up.
            cur.execute("""
                INSERT INTO product_identifiers (product_id, kind, value, season_id)
                SELECT DISTINCT s.product_id, 'style_name', s.style_name, s.season_id
                FROM styles s
                WHERE s.product_id IS NOT NULL
                  AND btrim(coalesce(s.style_name, '')) <> ''
                ON CONFLICT DO NOTHING
            """)
            aliases = cur.rowcount

            cur.execute("""
                SELECT count(*) FROM (
                    SELECT product_id FROM styles WHERE product_id IS NOT NULL
                    GROUP BY product_id HAVING count(DISTINCT season_id) > 1) t
            """)
            repeating = cur.fetchone()[0]

    print(f"products created : {created}")
    print(f"styles linked    : {linked}")
    print(f"name aliases     : {aliases}")
    print(f"products running in more than one season: {repeating}")


if __name__ == "__main__":
    pool.open()
    try:
        main()
    finally:
        pool.close()
