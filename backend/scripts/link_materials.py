"""Link every style to the material its raw material cost is calculated from.

Reads the mapping out of the workbooks (see materials_from_sheet.py) and emits
SQL. Run it from the host, because the workbooks are there, and pipe the SQL
into the database:

    /usr/bin/python3 backend/scripts/link_materials.py            # preview
    /usr/bin/python3 backend/scripts/link_materials.py --sql | \
        docker compose exec -T db psql -U im_master -d im_master

Materials are matched on season and price, not on name. The price is what the
formula actually points at, and the names do not agree between the sheet and
what is already seeded — the sheet calls row 6 "COTTON ACRYLIC" and keeps the
"60/40" in the next column, so matching by name would create a second material
at the same price and split the styles between them.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from materials_from_sheet import SEASONS, for_season  # noqa: E402


def quote(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def statements(season, prices, used):
    """Materials that are actually referenced, then the style links."""
    out = []
    rows = sorted({r for r in used.values() if r in prices})
    for row in rows:
        m = prices[row]
        name = m["name"] or m["code"] or f"row {row}"
        out.append(
            "INSERT INTO materials (season_id, code, name, kind, unit, price_idr)\n"
            f"SELECT se.id, {quote(m['code'])}, {quote(name)}, 'yarn', 'kg',"
            f" {m['price_idr']}\n"
            f"  FROM seasons se WHERE se.code = {quote(season)}\n"
            "   AND NOT EXISTS (SELECT 1 FROM materials x\n"
            "        WHERE x.season_id = se.id\n"
            f"          AND round(x.price_idr, 4) = round({m['price_idr']}::numeric, 4));"
        )

    by_row = {}
    for style, row in used.items():
        if row in prices:
            by_row.setdefault(row, []).append(style)

    for row, styles in sorted(by_row.items()):
        price = prices[row]["price_idr"]
        names = ", ".join(quote(s) for s in sorted(styles))
        out.append(
            "UPDATE styles s SET material_id = m.id\n"
            "  FROM materials m, seasons se\n"
            f" WHERE se.code = {quote(season)} AND s.season_id = se.id\n"
            "   AND m.season_id = se.id\n"
            f"   AND round(m.price_idr, 4) = round({price}::numeric, 4)\n"
            f"   AND s.style_name IN ({names});"
        )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sql", action="store_true", help="emit SQL instead of a summary")
    args = ap.parse_args()

    if args.sql:
        print("BEGIN;")
    total_styles = 0
    for season in SEASONS:
        _sh, prices, used, _cols = for_season(season)
        linked = {s: r for s, r in used.items() if r in prices}
        total_styles += len(linked)
        if args.sql:
            print(f"\n-- {season}: {len(linked)} styles")
            for s in statements(season, prices, used):
                print(s)
        else:
            missing = len(used) - len(linked)
            print(f"{season}: {len(linked)} styles linked"
                  + (f", {missing} referenced a row with no price" if missing else ""))
    if args.sql:
        print("\nCOMMIT;")
    else:
        print(f"\n{total_styles} styles would be linked in total")


if __name__ == "__main__":
    main()
