"""Read each season's material price list, and which one every style uses.

Two things come out of one place. Above the header, each workbook carries a
small table — YARN / FABRIC NAME, CODE, EXCHANGERATE, RP COST / KG +10% TAX —
and the price column of that table is the same column the per-style raw
material cost is calculated in.

Every style's formula then names the row it costs against:

    RAW MATERIALS BY WT: YARN/ FABRIC   =(CU58*$FN$6)
                                                  ^ row 6 of the price list

So the style-to-material link is stated by the sheet, not inferred from the
yarn names. That matters: matching "YCA BREAKER WHITE" to a material by its
prefix would have to decide that YTX means the material called YAR, and be
wrong about it silently.

    /usr/bin/python3 backend/scripts/materials_from_sheet.py            # preview
    /usr/bin/python3 backend/scripts/materials_from_sheet.py --json out.json
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet import Sheet, split_description  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SEASONS = ["S25", "F25", "S26", "F26", "S27"]

NAME_LABEL = "YARN / FABRIC NAME"
CODE_LABEL = "CODE"
PRICE_LABEL = "RP COST / KG"
CELL = re.compile(r"\$([A-Z]+)\$([0-9]+)")


def _col_index(letter):
    n = 0
    for ch in letter:
        n = n * 26 + (ord(ch) - 64)
    return n


def _label_columns(sh):
    """The name / code / price columns, found by their row-1 labels."""
    found = {}
    for letter, value in sh.rows.get(1, {}).items():
        v = " ".join(value.upper().split())
        if v.startswith(NAME_LABEL):
            found.setdefault("name", letter)
        elif v == CODE_LABEL:
            found.setdefault("code", letter)
        elif v.startswith(PRICE_LABEL):
            found.setdefault("price", letter)
    return found


def price_list(sh):
    """{row: {name, code, price}} for the block above the header."""
    cols = _label_columns(sh)
    if "price" not in cols:
        return {}, cols
    out = {}
    for ri in range(2, sh.header_row):
        row = sh.rows.get(ri, {})
        raw = row.get(cols["price"])
        try:
            price = float(raw)
        except (TypeError, ValueError):
            continue
        out[ri] = {
            "name": row.get(cols.get("name", "")) or None,
            "code": row.get(cols.get("code", "")) or None,
            "price_idr": price,
        }
    return out, cols


def style_rows(sh):
    """{style name: referenced price row} from the raw material formula."""
    col = sh.col("RAW MATERIALS BY WT: YARN/ FABRIC", "RAW MATERIALS")
    sh.load_formulas([col])
    out = {}
    for ri, cells in sh.data_rows():
        name, _size = split_description(sh.value(cells, "DESCRIPTION") or "")
        if not name or name in out:
            continue
        formula = sh.formulas.get(ri, {}).get(col)
        refs = CELL.findall(formula or "")
        # One absolute reference means one price cell. A formula with none is
        # a typed constant; with several it is doing something else, and
        # guessing which reference is the price would be inventing an answer.
        if len(refs) == 1:
            out[name] = int(refs[0][1])
    return out


def for_season(season):
    sh = Sheet(str(ROOT / f"{season} IM MASTER.xlsx"), season)
    prices, cols = price_list(sh)
    used = style_rows(sh)
    return sh, prices, used, cols


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="write the whole mapping to this file")
    args = ap.parse_args()

    everything = {}
    for season in SEASONS:
        sh, prices, used, cols = for_season(season)
        counts = collections.Counter(used.values())
        named = sum(1 for r in prices.values() if r["name"])
        print(f"=== {season} ===  price list in column {cols.get('price')}, "
              f"{len(prices)} rows ({named} named)")
        print(f"    styles with a price row: {len(used)}")
        for row, n in counts.most_common(6):
            entry = prices.get(row, {})
            label = entry.get("name") or entry.get("code") or "(no name or code)"
            price = entry.get("price_idr")
            print("      row %-3s %-30s %12s  <- %d styles"
                  % (row, str(label)[:30],
                     f"{price:,.2f}" if price else "no price", n))
        unknown = [r for r in counts if r not in prices]
        if unknown:
            print("      rows referenced with no price: %s" % sorted(unknown))
        everything[season] = {"prices": prices, "styles": used}

    if args.json:
        Path(args.json).write_text(json.dumps(everything, indent=2))
        print(f"\nwrote {args.json}")


if __name__ == "__main__":
    main()
