"""Load a Sales Report run into IM Master.

Salesforce fills WHS 000, Shopify fills SY. The fetching stays in
web-apps/services; this only moves the rows across.

Run with the web-apps venv, from that directory, so its packages and .env
load. Either fetch fresh, or read a run it already saved:

    cd .../web-apps/services
    venv/bin/python .../backend/scripts/load_sales.py \
        --season F26 --start 2026-08-01 --end 2026-08-31            # fetch
    venv/bin/python .../backend/scripts/load_sales.py \
        --season F26 --start 2026-08-01 --end 2026-08-31 --from-output

--from-output reads the xlsx the last run wrote, which costs nothing and hits
no API. Worth preferring while working on the loading itself.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, os.getcwd())

API = os.getenv("IM_MASTER_API", "http://localhost:8085")

# Salesforce names the column `style`; Shopify names it `product_title`.
STYLE_COLUMNS = ("style", "product_title", "product_title_at_time_of_sale")


def rows_from(frame):
    """A DataFrame into the {style, color, quantity} the API takes."""
    if frame is None or getattr(frame, "empty", True):
        return []
    style_col = next((c for c in STYLE_COLUMNS if c in frame.columns), None)
    if not style_col or "color" not in frame.columns:
        raise SystemExit(
            f"cannot read this frame: columns are {list(frame.columns)}")
    out = []
    for _, r in frame.iterrows():
        out.append({"style": r[style_col], "color": r["color"],
                    "quantity": r["quantity"]})
    return out


def post(payload):
    req = urllib.request.Request(
        API + "/api/sales/import", method="POST",
        data=json.dumps(payload, default=str).encode(),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"import failed: {e.code} {e.read()[:300].decode()}")


def from_output(season, start, end):
    """The xlsx a previous run saved, rather than fetching again."""
    import pandas as pd
    from config.settings import OUTPUT_DIR

    found = {}
    for source, channel in (("salesforce", "WHS_000"), ("shopify", "SY")):
        path = Path(OUTPUT_DIR) / f"{source}_sales_data_{start}_to_{end}_{season}.xlsx"
        if not path.exists():
            raise SystemExit(f"no saved run at {path}\n"
                             "drop --from-output to fetch it")
        found[channel] = pd.read_excel(path)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", required=True)
    ap.add_argument("--start", required=True)
    ap.add_argument("--end", required=True)
    ap.add_argument("--from-output", action="store_true",
                    help="read the last saved run instead of fetching")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.from_output:
        frames = from_output(args.season, args.start, args.end)
    else:
        from reports.sales_report.run import run
        result = run(start_date=args.start, end_date=args.end, season=args.season)
        frames = {"WHS_000": result.get("salesforce"), "SY": result.get("shopify")}

    for channel, frame in frames.items():
        rows = rows_from(frame)
        if args.dry_run:
            print(f"{channel}: {len(rows)} rows (dry run)")
            for r in rows[:3]:
                print("   ", r)
            continue
        summary = post({"season": args.season, "start_date": args.start,
                        "end_date": args.end, "channel": channel, "rows": rows})
        print(f"{channel}: {summary['matched']} matched, "
              f"{summary['unmatched']} unmatched, of {summary['rows']}")


if __name__ == "__main__":
    main()
