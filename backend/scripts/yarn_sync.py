"""The monthly yarn import, in one command: extract, stage, load.

    # see what the newest file would do (nothing on the board moves):
    docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
        python scripts/yarn_sync.py
    # and apply it:
    ... python scripts/yarn_sync.py --write

The three stages stay separate files, because they have separate jobs and
separate failure modes (scripts/extract_yarn_analysis.py, stage_import.py,
load_yarn_stock.py). This is only the handle on the door.

Without --write the run still extracts and stages: both are additive, and a
staged batch changes nothing anyone can see — readers take the newest
LOADED batch. What --write decides is whether this file becomes the one the
Color Table shows.

Where it reads from: /app/source, which is the project folder unless
YARN_ANALYSIS_DIR points the mount at the Drive's YARN ANALYSIS folder
(docker-compose.dev.yml). Given a folder it picks the newest workbook whose
stock column is filled in; given a file it reads that file.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import pool  # noqa: E402
from extract_yarn_analysis import extract, report  # noqa: E402
from load_yarn_stock import load  # noqa: E402
from stage_import import stage  # noqa: E402

SOURCE = "yarn_analysis"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=os.environ.get("YARN_SOURCE", "/app/source"),
                    help="the workbook, or the folder to pick the newest from")
    ap.add_argument("--out", default="/app/import")
    ap.add_argument("--write", action="store_true",
                    help="make this file the one the board reads")
    ap.add_argument("--force", action="store_true",
                    help="stage a file already loaded (same sha256) again")
    args = ap.parse_args()

    pool.open()
    print("1. reading the workbook")
    out_dir, meta = extract(args.source, args.out)
    report(out_dir, meta)

    print("\n2. staging it")
    batch = stage(out_dir, SOURCE, None, args.force)
    if batch is None:
        return

    print("\n3. loading it")
    load(batch, SOURCE, args.write)
    if not args.write:
        print(f"\nnothing on the board moved. To apply this batch:"
              f"\n  python scripts/load_yarn_stock.py --batch {batch} --write")


if __name__ == "__main__":
    main()
