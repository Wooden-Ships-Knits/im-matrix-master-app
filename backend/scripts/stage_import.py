"""Stage an extract run into the database: one import batch, rows kept raw.

    docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
        python scripts/stage_import.py /app/import/20261126-042921

What this stage does NOT do is interpret anything. The .jsonl lands in
`import_rows` as it was written, one row per workbook row under its
`sheet` and `row_no`, and the file's own identity (name, sha256, modified
time) plus the notes of the read land on the `import_batches` row.

That is the whole point of a staging layer: the load can be re-run, or run
again next month against a changed resolver, without opening the workbook
again — and a figure on the board can always be traced back to the file and
the row it came from.

A batch is `staged` until the loader accepts it. Readers take the newest
`loaded` batch, so staging is safe at any time: nothing on screen moves
until scripts/load_yarn_stock.py runs.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import pool, transaction  # noqa: E402


def stage(run_dir: Path, source_code: str, label: str | None, force: bool) -> int | None:
    meta = json.loads((run_dir / f"{source_code}.meta.json").read_text(encoding="utf-8"))
    jsonl = run_dir / f"{source_code}.jsonl"
    file_info = (meta.get("files") or [{}])[0]

    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, file_name, status FROM import_batches
             WHERE source_code = %s AND file_sha256 = %s AND status = 'loaded'
             ORDER BY id DESC LIMIT 1
        """, (source_code, file_info.get("sha256")))
        same = cur.fetchone()
    if same and not force:
        print(f"already loaded as batch {same[0]} ({same[1]}): same sha256, nothing staged."
              "\nPass --force to stage it again.")
        return None

    rows = [json.loads(line) for line in jsonl.read_text(encoding="utf-8").splitlines() if line]
    with transaction() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO import_batches (source_code, file_name, file_sha256,
                                        file_modified_at, label, status, row_count, notes)
            VALUES (%s, %s, %s, %s, %s, 'staged', %s, %s)
            RETURNING id
        """, (source_code, Path(file_info.get("path", "")).name, file_info.get("sha256"),
              file_info.get("modified"), label or run_dir.name, len(rows),
              json.dumps(meta.get("notes") or [])))
        batch_id = cur.fetchone()[0]
        cur.executemany(
            "INSERT INTO import_rows (batch_id, sheet, row_no, data)"
            " VALUES (%s, %s, %s, %s)",
            [(batch_id, r["sheet"], r["row_no"], json.dumps(r["data"])) for r in rows])
    print(f"staged batch {batch_id}: {len(rows)} rows from {file_info.get('path')}")
    for n in meta.get("notes") or []:
        print("  note:", n)
    print(f"next: python scripts/load_yarn_stock.py --write")
    return batch_id


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", help="an extract run folder (…/import/<stamp>)")
    ap.add_argument("--source", default="yarn_analysis")
    ap.add_argument("--label")
    ap.add_argument("--force", action="store_true",
                    help="stage a file already loaded (same sha256) again")
    args = ap.parse_args()
    pool.open()          # the API opens the pool in its lifespan; a script must
    stage(Path(args.run_dir), args.source, args.label, args.force)


if __name__ == "__main__":
    main()
