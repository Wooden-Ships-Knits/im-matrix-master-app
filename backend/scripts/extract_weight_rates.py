"""Read each season's weight rates out of its workbook and emit SQL.

The tolerance, distribution and pricing weights are not typed anywhere in this
repository. Every season's sheet states them in its own formulas —

    LOW TOLERANCE    =CR58-(CR58*4%)      or  =CC62*$CD$60
    HIGH TOLERANCE   =CR58+(CR58*4%)
    DISTRIBUTION WT  =CR58+0.009
    WT FOR PRICING   =CU58*1.04           or  =CF62*$CG$60

— so they are read from there, the same way the labour rate is. A season whose
sheet does not state one is left NULL rather than filled in from another
season, because nothing guarantees they match.

    /usr/bin/python3 backend/scripts/extract_weight_rates.py
    /usr/bin/python3 backend/scripts/extract_weight_rates.py --sql | \
        docker compose exec -T db psql -U im_master -d im_master
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet import Sheet  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SEASONS = ["S25", "F25", "S26", "F26", "S27"]

PCT = re.compile(r"\*\s*([0-9.]+)\s*%")
CELL = re.compile(r"\$([A-Z]+)\$([0-9]+)")
PLUS = re.compile(r"\+\s*([0-9.]+)\s*$")
TIMES = re.compile(r"\*\s*([0-9.]+)\s*$")


def _letters(sh, name):
    """Every column carrying this header, matched exactly or by prefix.

    The sheet's names are longer than they read: the pricing weight column is
    "WT FOR PRICING INFO - NOT FOR PRODUCTION".
    """
    key = " ".join(name.upper().split())
    if key in sh._by_name:
        return sh._by_name[key]
    for k in sh._by_name:
        if k.startswith(key):
            return sh._by_name[k]
    return []


def _first_formula(sh, letters):
    """The first formula found on any of these columns, below the header."""
    sh.load_formulas(letters)
    for ri in sorted(sh.formulas):
        for letter in letters:
            f = sh.formulas[ri].get(letter)
            if f:
                return f
    return None


def _cell_value(sh, formula):
    """The value of the single $COL$ROW a formula points at, if it has one."""
    refs = CELL.findall(formula or "")
    if len(refs) != 1:
        return None
    col, row = refs[0]
    try:
        return float(sh.rows.get(int(row), {}).get(col))
    except (TypeError, ValueError):
        return None


def tolerance(sh, name, sign):
    """0.96 from `-(x*4%)`, or the rate cell the formula multiplies by."""
    f = _first_formula(sh, _letters(sh, name))
    if not f:
        return None
    m = PCT.search(f)
    if m:
        return round(1 + sign * float(m.group(1)) / 100.0, 6)
    return _cell_value(sh, f)


def rates_for(season):
    sh = Sheet(str(ROOT / f"{season} IM MASTER.xlsx"), season)
    out = {
        "wt_tolerance_low": tolerance(sh, "LOW TOLERANCE", -1),
        "wt_tolerance_high": tolerance(sh, "HIGH TOLERANCE", +1),
        "distribution_wt_add_kg": None,
        "pricing_wt_factor": None,
    }
    f = _first_formula(sh, _letters(sh, "DISTRIBUTION WT"))
    if f:
        m = PLUS.search(f)
        if m:
            out["distribution_wt_add_kg"] = float(m.group(1))
    f = _first_formula(sh, _letters(sh, "WT FOR PRICING"))
    if f:
        m = TIMES.search(f)
        out["pricing_wt_factor"] = float(m.group(1)) if m else _cell_value(sh, f)
    return out


COLS = ["wt_tolerance_low", "wt_tolerance_high",
        "distribution_wt_add_kg", "pricing_wt_factor"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sql", action="store_true", help="emit SQL instead of a table")
    args = ap.parse_args()

    found = {s: rates_for(s) for s in SEASONS}

    if not args.sql:
        print("%-6s %-10s %-10s %-10s %-10s" % ("", *COLS))
        for s in SEASONS:
            print("%-6s %-10s %-10s %-10s %-10s"
                  % (s, *[found[s][c] if found[s][c] is not None else "-" for c in COLS]))
        return

    print("BEGIN;")
    for s in SEASONS:
        r = found[s]
        sets = [f"{c} = {r[c]}" for c in COLS if r[c] is not None]
        if not sets:
            continue
        cols = [c for c in COLS if r[c] is not None]
        vals = ", ".join(str(r[c]) for c in cols)
        print(
            f"INSERT INTO season_rates (season_id, {', '.join(cols)})\n"
            f"SELECT id, {vals} FROM seasons WHERE code = '{s}'\n"
            f"ON CONFLICT DO NOTHING;"
        )
        print(
            f"UPDATE season_rates SET {', '.join(sets)}\n"
            f" WHERE season_id = (SELECT id FROM seasons WHERE code = '{s}');"
        )
    print("COMMIT;")


if __name__ == "__main__":
    main()
