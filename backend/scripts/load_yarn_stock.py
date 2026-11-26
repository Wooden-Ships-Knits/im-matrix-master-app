"""Load a staged YARN ANALYSIS batch into yarn_stock_lines, and ask about the rest.

    # report what would happen (default):
    docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
        python scripts/load_yarn_stock.py
    # apply:
    ... python scripts/load_yarn_stock.py --write

Every staged row becomes a yarn_stock_line, placed or not, so the batch
holds the whole file and a figure can be traced to its row. The board reads
only the placed ones (v_yarn_stock_latest).

Placing a row is app.yarn_names.resolve_yarn: alias, then the written text,
then prefix + code with the colour name agreeing. Nothing is guessed and no
yarn is ever created — the workbook is PPIC's catalogue of every colour they
track, and our table is what the BOM has actually used. Most rows that do
not place are simply colours we have never knitted with.

So a row only becomes a QUESTION when it carries a figure: stock, PO or any
of the four AV numbers. That is the difference between a queue someone works
through and a list of 858 rows nobody reads. The reason travels with it:

  YARN_UNPARSED            not a yarn reference ("CANCEL RELEASE")
  YARN_UNKNOWN_CODE        prefix + code parse, we have no such yarn
  YARN_CODE_NAME_CONFLICT  that code is ours, under another colour name
  YARN_LIST_DUPLICATE      two rows of the file place on one yarn

Answering a question writes a yarn_aliases row (the Color Table's review
panel does this), and the next load places it by itself.

The colour family is the one classification that lands on master data:
`colors.family` is where a colour family belongs, once, not per yarn and not
per batch.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.db import pool, transaction  # noqa: E402
from app.yarn_names import resolve_yarn, squash  # noqa: E402

FIGURES = ("on_hand_kg", "on_po_kg", "av_3m", "av_3m_proj", "av_full", "av_full_proj")
# Reasons that are an answerable question, and the rule each one is filed under.
QUESTION = {"unparsed": "YARN_UNPARSED",
            "unknown_code": "YARN_UNKNOWN_CODE",
            "code_name_conflict": "YARN_CODE_NAME_CONFLICT"}
# "Carries a figure" is the filter for a row we might simply never have used:
# 820 colours of PPIC's catalogue are not our business until they hold kilos.
# A code-name conflict is not about kilos — it says our master and PPIC's file
# disagree about what a code MEANS, which is worth knowing with zero stock.
ALWAYS_ASK = {"code_name_conflict"}


def carries_figures(ya: dict) -> bool:
    return sum(abs(ya.get(k) or 0) for k in FIGURES) > 0.05


def load(batch_id: int | None, source: str, write: bool) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        if batch_id is None:
            cur.execute("""
                SELECT id FROM import_batches
                 WHERE source_code = %s AND status = 'staged'
                 ORDER BY id DESC LIMIT 1
            """, (source,))
            row = cur.fetchone()
            if not row:
                raise SystemExit("no staged batch — run scripts/stage_import.py first")
            batch_id = row[0]
        cur.execute("SELECT file_name, file_sha256, status, row_count"
                    "  FROM import_batches WHERE id = %s", (batch_id,))
        batch = cur.fetchone()
        if batch is None:
            raise SystemExit(f"no batch {batch_id}")
        if batch[2] == "loaded":
            print(f"batch {batch_id} is already loaded; reloading it")

        cur.execute("SELECT sheet, row_no, data FROM import_rows"
                    " WHERE batch_id = %s ORDER BY sheet, row_no", (batch_id,))
        staged = cur.fetchall()

        # ---- resolve, in the order the file is written: the later row wins
        placed: dict[int, dict] = {}
        lines: list[dict] = []
        reasons: dict[str, int] = {}
        questions: list[tuple[str, str, str, dict]] = []
        for sheet, row_no, data in staged:
            ya = data.get("ya") or {}
            text = data.get("yarn_text") or ""
            locator = f"{sheet}!{row_no}"
            color_id, reason, detail = resolve_yarn(cur, text, source)
            reasons[reason] = reasons.get(reason, 0) + 1
            line = {"locator": locator, "tab": ya.get("tab") or sheet, "yarn_text": text,
                    "yarn_color_id": color_id, "resolved_by": reason, "ya": ya,
                    "status": data.get("status") or {}, "notes": data.get("notes") or {}}
            if color_id is not None:
                was = placed.get(color_id)
                if was is not None:
                    # Same yarn twice in one file. The later row is the one
                    # loaded; the earlier becomes the question.
                    was["yarn_color_id"] = None
                    was["resolved_by"] = "duplicate"
                    questions.append((
                        "YARN_LIST_DUPLICATE", was["locator"], was["yarn_text"],
                        {"written": squash(was["yarn_text"]), "kept": locator,
                         "kept_text": squash(text), "yarn_color_id": color_id}))
                placed[color_id] = line
            elif reason in QUESTION and (reason in ALWAYS_ASK or carries_figures(ya)):
                questions.append((QUESTION[reason], locator, text, detail))
            lines.append(line)

        print(f"batch {batch_id}: {batch[0]}  ({len(staged)} staged rows)")
        print("  resolved: " + ", ".join(f"{k} {v}" for k, v in sorted(reasons.items())))
        print(f"  placed on a yarn: {len(placed)}")
        print(f"  questions for the queue: {len(questions)}")
        by_rule: dict[str, int] = {}
        for rule, _loc, _raw, _d in questions:
            by_rule[rule] = by_rule.get(rule, 0) + 1
        for rule, n in sorted(by_rule.items()):
            print(f"    {rule}: {n}")
        if not write:
            print("  dry run — nothing written")
            return

    with transaction() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM yarn_stock_lines WHERE batch_id = %s", (batch_id,))
        cur.executemany("""
            INSERT INTO yarn_stock_lines (
                batch_id, locator, tab, yarn_text, yarn_color_id, resolved_by, stock_on,
                qty_without_proj, qty_with_proj, qty_without_proj_3m, qty_with_proj_3m,
                on_hand_kg, on_po_kg, o4_prev, o4_now, color_family, detail)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, [(batch_id, l["locator"], l["tab"], l["yarn_text"], l["yarn_color_id"],
               l["resolved_by"], l["ya"].get("stock_on"),
               l["ya"].get("av_full"), l["ya"].get("av_full_proj"),
               l["ya"].get("av_3m"), l["ya"].get("av_3m_proj"),
               l["ya"].get("on_hand_kg"), l["ya"].get("on_po_kg"),
               l["ya"].get("o4_prev"), l["ya"].get("o4_now"),
               l["ya"].get("color_family"),
               json.dumps({"old_name": l["ya"].get("old_name"),
                           "on_hand": l["ya"].get("on_hand") or [],
                           "status": {k: v for k, v in l["status"].items() if v},
                           "notes": l["notes"]}))
              for l in lines])

        for rule, locator, raw, detail in questions:
            cur.execute("""
                INSERT INTO review_items (rule_code, entity, batch_id, locator,
                                          raw_value, detail)
                VALUES (%s, 'yarn', %s, %s, %s, %s)
                ON CONFLICT (rule_code, raw_value) DO UPDATE
                   SET batch_id = EXCLUDED.batch_id,
                       locator = EXCLUDED.locator,
                       detail = EXCLUDED.detail,
                       seen_at = now()
            """, (rule, batch_id, locator, squash(raw), json.dumps(detail)))

        # The colour family belongs to the COLOUR, once — not to each yarn
        # that comes in it, and not to a batch.
        cur.execute("""
            UPDATE colors c SET family = l.color_family
              FROM yarn_stock_lines l
              JOIN yarn_colors y ON y.id = l.yarn_color_id
             WHERE l.batch_id = %s AND l.color_family IS NOT NULL
               AND c.id = y.color_id
               AND c.family IS DISTINCT FROM l.color_family
        """, (batch_id,))
        families = cur.rowcount

        cur.execute("""
            UPDATE import_batches
               SET status = 'loaded', loaded_at = now(),
                   row_count = (SELECT count(*) FROM yarn_stock_lines
                                 WHERE batch_id = %s)
             WHERE id = %s
        """, (batch_id, batch_id))

    print(f"  applied: batch {batch_id} is now the one the board reads"
          f" ({families} colour families set)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, help="a batch id (default: the newest staged one)")
    ap.add_argument("--source", default="yarn_analysis")
    ap.add_argument("--write", action="store_true", help="apply; without it, report only")
    args = ap.parse_args()
    pool.open()
    load(args.batch, args.source, args.write)


if __name__ == "__main__":
    main()
