"""How much of the sales data can actually be matched to a style and colourway?

Read-only. Fetches a season through the existing Sales Report in web-apps —
their clients, their credentials, nothing copied — and checks the rows against
what PDM holds.

The answer decides the shape of the integration. Salesforce, Shopify and the
IM name colours independently, so the question is not whether some rows fail
to match but how many, and whether the misses look mechanical (case, spacing,
a slash) or genuinely different names.

Run with the web-apps venv, from that directory, so its .env and packages load:

    cd .../web-apps/services
    venv/bin/python .../im-master-app/backend/scripts/probe_sales_match.py \
        --season F26 --start 2026-08-01 --end 2026-08-31
"""
import argparse
import collections
import json
import os
import re
import sys
import urllib.parse
import urllib.request

# Python puts this script's own directory first, which shadows the services
# tree we are run from. Their packages have to come before ours.
sys.path.insert(0, os.getcwd())

API = "http://localhost:8085"
WS = re.compile(r"\s+")


def norm(value):
    """Match the way get_or_create does: case- and whitespace-insensitive."""
    return WS.sub(" ", str(value or "").strip()).upper()


def ours(season):
    """{style name: {colour names}} from PDM, for this season."""
    url = f"{API}/api/styles/matrix?" + urllib.parse.urlencode({"season": season})
    with urllib.request.urlopen(url, timeout=60) as r:
        rows = json.load(r)
    out = {}
    for row in rows:
        out[norm(row["name"])] = {norm(c) for c in row["colorways"]}
    return out


def report(label, frame, styles):
    if frame is None or frame.empty:
        print(f"\n=== {label}: no rows ===")
        return
    print(f"\n=== {label}: {len(frame)} rows ===")
    cols = list(frame.columns)
    print("    columns:", ", ".join(cols))
    if not {"style", "color"} <= set(cols):
        print("    (no style/color columns — cannot match)")
        return

    style_hit = colour_hit = 0
    missed_styles = collections.Counter()
    missed_colours = collections.Counter()
    for _, row in frame.iterrows():
        s, c = norm(row["style"]), norm(row["color"])
        if s in styles:
            style_hit += 1
            if c in styles[s]:
                colour_hit += 1
            else:
                missed_colours[(row["style"], row["color"])] += 1
        else:
            missed_styles[row["style"]] += 1

    n = len(frame)
    print(f"    style matches a style we hold      : {style_hit} of {n}"
          f"  ({100.0 * style_hit / n:.1f}%)")
    print(f"    and the colour matches too         : {colour_hit} of {n}"
          f"  ({100.0 * colour_hit / n:.1f}%)")
    if missed_styles:
        print(f"    styles we do not have ({len(missed_styles)} distinct):")
        for name, k in missed_styles.most_common(8):
            print(f"      {str(name)[:56]:56} x{k}")
    if missed_colours:
        print(f"    colours that did not match ({len(missed_colours)} distinct):")
        for (s, c), k in missed_colours.most_common(8):
            print(f"      {str(s)[:34]:34} | {str(c)[:24]:24} x{k}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", required=True)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    args = ap.parse_args()

    from reports.sales_report.run import run  # noqa: E402 — needs their cwd

    print(f"PDM styles for {args.season}: ", end="", flush=True)
    styles = ours(args.season)
    print(f"{len(styles)}")

    result = run(start_date=args.start, end_date=args.end, season=args.season)
    report("SALESFORCE  -> WHS 000", result.get("salesforce"), styles)
    report("SHOPIFY     -> SY", result.get("shopify"), styles)


if __name__ == "__main__":
    main()
