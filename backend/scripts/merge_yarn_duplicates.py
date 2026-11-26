"""Collapse yarn rows that are one real yarn stored twice.

    docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
        python scripts/merge_yarn_duplicates.py            # dry run
    ... scripts/merge_yarn_duplicates.py --write

The mapping is the safe set measured in docs/yarn-split.md §4 — groups that
differ only in spelling, spacing or a missing code — plus the two spacing
variants of YCA BLACK B. It is written out literally, row by row, because
this file IS the record of the repoint: a BOM line moved by a rule nobody
can re-read is a BOM line nobody can move back.

What a merge does, per group:
  * colorway_yarns lines on the dropped row repoint to the kept row;
  * board facts (palette, hex, quantities) fill the kept row's NULLs from
    the dropped row — never overwrite a value the kept row already has;
  * the dropped row is deleted. Its name is recorded here.

DELIBERATELY NOT HERE:
  * YCA BLACK B - 1708 vs - 1708 B — ANSWERED 24 Nov 2026: they are
    DIFFERENT yarns. Never add that pair to MERGES; two swatches on the
    board is correct.
  * YP TX 030/031 vs YTX - 030/031 — still open (typo or real YP colour,
    1 BOM line each). Add to MERGES only when the yarn buyer answers.

The two bracketed YCA INDIGO rows carry a substitution instruction in
their name ("FOR SY CHANGE TO YCA TWILIGHT SKY - 701"); the instruction
has no column to live in yet, so it survives only in this file and in
yarn-split.md §2 until the split gives substitutions a home.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import pool, transaction  # noqa: E402

# keep                              <- drop (exact names, as stored)
MERGES = [
    ("YCA BREAKER WHITE - 658", "YCA BREAKER WHITE"),
    ("YCA KHAKI - 749", "YCA KHAKI"),
    ("YCA APPLE RED - 925", "YCA APPLE RED"),
    ("YCA RED CHILE - 772", "YCA RED CHILE- 772"),
    ("YCA RED CHILE - 772", "YCA RED CHILE"),
    ("YCA INDIGO - 860",
     "YCA INDIGO - 860 (FOR SY CHANGE TO YCA TWILIGHT SKY - 701)"),
    ("YCA INDIGO - 860", "YCA INDIGO - 860 (INDIA SEA SUB)"),
    ("YST WAXED LODEN - 775", "YST WAXED LODEN - 77"),
    ("YST DARK CEDAR - 891", "YST DARK CEDAR"),
    ("YST GNARLED PINE - 821", "YST GNARLED PINE - 82"),
    ("YST CAPRICE PINK - 537", "YST CAPRICE PINK"),
    ("BJ RED GINGER - 933", "BJ RED GINGER"),
    ("BJ SANDSTONE - 183", "BJ SANDSTONE"),
    ("BJ ALMOND BUTTER - 735", "BJ ALMOND BUTTER"),
    ("BJ GOLD - 8271", "BJ GOLD- 8271"),
    ("BJ VERDIGRIS - 9510", "BJ VERDIGRIS"),
    # The two spacing variants of BLACK B. 1708 and 1708 B themselves are
    # confirmed DIFFERENT yarns (see the docstring) — only spacing merges.
    ("YCA BLACK B - 1708 B", "YCA BLACK B -1708 B"),
    ("YCA BLACK B - 1708", "YCA BLACK B -1708"),
]

# The board facts a dropped row may donate where the kept row has none.
CARRY = ("palette_id", "hex", "qty_with_proj", "qty_without_proj",
         "qty_with_proj_3m", "qty_without_proj_3m")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    pool.open()

    moved_total, merged = 0, 0
    with transaction() as conn:
        with conn.cursor() as cur:
            for keep_name, drop_name in MERGES:
                cur.execute("SELECT id FROM yarn_colors WHERE name = %s",
                            (keep_name,))
                keep = cur.fetchone()
                cur.execute("SELECT id FROM yarn_colors WHERE name = %s",
                            (drop_name,))
                drop = cur.fetchone()
                if drop is None:
                    print(f"done already: {drop_name!r} is gone")
                    continue
                if keep is None:
                    raise SystemExit(f"keep row missing: {keep_name!r}")
                cur.execute(
                    "UPDATE colorway_yarns SET yarn_color_id = %s"
                    " WHERE yarn_color_id = %s", (keep[0], drop[0]))
                moved = cur.rowcount
                sets = ", ".join(
                    f"{c} = COALESCE(k.{c}, d.{c})" for c in CARRY)
                cur.execute(
                    f"UPDATE yarn_colors k SET {sets}"
                    "  FROM yarn_colors d"
                    " WHERE k.id = %s AND d.id = %s", (keep[0], drop[0]))
                cur.execute("DELETE FROM yarn_colors WHERE id = %s",
                            (drop[0],))
                print(f"{drop_name!r} -> {keep_name!r}  ({moved} BOM lines)")
                moved_total += moved
                merged += 1
            if not args.write:
                # transaction() forbids a bare rollback; raising unwinds it.
                print(f"\ndry run — {merged} merges, {moved_total} BOM lines"
                      " would move; nothing written")
                raise SystemExit(0)
    print(f"\napplied: {merged} merges, {moved_total} BOM lines moved")


if __name__ == "__main__":
    main()
