# The yarn import pipeline

**Built 26 Nov 2026** (migration `0031_yarn_pipeline`). How PPIC's YARN
ANALYSIS becomes the kilos on the Color Table, and what happens to the rows
it cannot place.

The shape is taken from the ERP project
(`github.com/Wooden-Ships-Knits/database-manangement-erp`, `erp/db/load`,
`erp/db/schema/04_recon.sql`, `erp/app/builder/color_board.py`). Both systems
read the same workbook; reading it by two different sets of rules was the
drift worth closing first.

## Running it

```sh
# report what the newest file would do — nothing on the board moves
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T backend \
    python scripts/yarn_sync.py
# and apply it
... python scripts/yarn_sync.py --write
```

The backend container sees the workbooks through a read-only mount,
`${YARN_ANALYSIS_DIR:-.}:/app/source:ro` (docker-compose.dev.yml). By default
that is the project folder, where `YARN ANALYSIS NOV 10.xlsx` sits today. Set
`YARN_ANALYSIS_DIR` to the Drive folder —
`…/PTIF SERVER/YARN ANALYSIS/2026/11. NOV` — and the extractor picks the
newest usable file itself. Nothing is copied, and nothing is written back.

The stages can also be run one at a time, which is what you want when
something looks wrong:

```sh
python scripts/extract_yarn_analysis.py /app/source /app/import   # read
python scripts/stage_import.py /app/import/<stamp>                # stage
python scripts/load_yarn_stock.py                                 # report
python scripts/load_yarn_stock.py --write                         # apply
```

## The four layers

| Layer | Where | What it holds |
|---|---|---|
| Extract | `backend/scripts/extract_yarn_analysis.py` → `backend/import/<stamp>/` | `yarn_analysis.jsonl` + `.meta.json` (sha256, modified time, stock date, notes) |
| Stage | `stage_import.py` → `import_batches`, `import_rows` | the file's identity, and every row's raw JSON under `sheet!row_no` |
| Load | `load_yarn_stock.py` → `yarn_stock_lines`, `review_items` | one row per yarn **per batch**, placed or not; the questions |
| Read | `v_yarn_stock_latest` → `repo.color_table()` | the placed rows of the newest **loaded** batch |

Why a staging layer at all: the load can be re-run — next month, or against
a changed resolver — without opening the workbook again, and any figure on
the board can be traced to the file and the row it came from.

## The rules

**Which file.** PPIC starts next month's file by copying this one and adding
an empty ON HAND column, so the newest file by name is not always the newest
file with figures in it. A file whose newest ON HAND column holds less than
half the kilos of the column before it is passed over for the next older
one, and the reason goes into the batch notes. Names carrying COPY, TEST,
TEMPLATE, BACKUP, BEFORE or FREEZE are never read.

**Where the list ends.** At the pivot's own Grand Total. YCA keeps a loose
`YCA RAW WHITE Total` below it; rows down there are scratch.

**Which column is which.** By header text with alternates, never by column
letter: YAC spells it `OLS COLOR NAME`, YCA's header is on row 3 while the
others are on row 5, and the note column is `NOVI NOTE` on one tab and
`Nove Note` on another.

**Which yarn a row means** (`backend/app/yarn_names.py`), in order:

1. a confirmed alias (`yarn_aliases`), this source's first;
2. the written text, squashed — our yarn identity is still the whole label;
3. prefix + code, **and the colour name must agree too**.

Anything else is a named reason, never a guess:

| Reason | Means |
|---|---|
| `unparsed` | not a yarn reference ("CANCEL RELEASE") |
| `trim` | a trim (XZIP, STAMP …), not a colour |
| `unknown_code` | prefix + code parse, no yarn of ours carries them |
| `code_name_conflict` | that code is ours, under another colour name |

A code must look like a code: digits with at most one letter (`1708`,
`1708 B`, `009B`). BJ sewing thread is the one exception — six of its 37
rows are written by colour alone (`BJ BREAKER WHITE`), BJ has no sheet in
the workbook, so no code is coming for them, and BJ parses name-only.

**No loader ever creates a yarn.** The workbook is PPIC's catalogue of every
colour they track; `yarn_colors` is what the BOM has actually used. The gap
between them is a question, not an insert.

**What becomes a question.** Only a row that carries a figure — stock, PO or
any of the four AV numbers. On the Nov 10 file that is 99 of the 820 rows
that place on nothing; the other 721 are colours we have never knitted with
and are nobody's problem. A `code_name_conflict` always asks, with or
without stock, because it is about identity rather than kilos.

**Answering.** The Color Table's "to check" dialog writes a `yarn_aliases`
row and places that row's figures immediately. The next import places it
without anyone. "Not ours" closes the question without teaching the
resolver anything.

## What the Nov 10 file gave us

```
1209 rows read (630 YY+YST, 446 YCA, 114 YAC, 19 YP&YTX), stock 2026-11-10
  placed: 352      (352 by written text — the same 352 the old importer found)
  unknown_code: 820   of which 99 hold kilos  -> queue
  unparsed: 33        of which 1 holds kilos  -> queue ("YP TISTA", 2.1 kg)
  code_name_conflict: 4                       -> queue, always
```

The four conflicts are the pipeline earning its keep on the first run:

| The file says | Our master says |
|---|---|
| YCA BLUE BIRD - 087 | YCA CORNISH BLUE - 087 |
| YCA INKY NIGHT - 774 | YCA CORALICIOUS - 774 |
| YCA MIST - 001 | YCA BLACK - 001 |
| YST FLAMINGO - 187 | YST LILAC - 187 |

Each is either a rename PPIC made and we never saw, or a code typed wrong on
one side. Neither system can tell which, which is exactly why it is a
question for a person and not a rule.

## Still open

- **The 99 unknown codes that hold kilos.** Most look like colours the BOM
  has never used (`YAC BLUE GLEN - 975`, 4.9 kg). Worth one pass by someone
  who knows the catalogue: an alias where we spell it differently, "not
  ours" otherwise.
- **`colors.family` is still empty.** The workbook's COLOR FAMILY column is
  blank in the Nov 10 file; the loader fills the family the day the team
  fills that column.
- **Yarn identity.** Ours is the written label (`UNIQUE (prefix, name,
  color_code)` — and since Postgres treats NULLs as distinct, that
  constrains nothing at all for any row whose prefix or code is NULL,
  which is every trim and every codeless yarn). The
  ERP keys a yarn on family + code with the name as an attribute, which is
  the shape that makes a duplicate impossible. Changing ours touches the
  BOM, so it wants its own migration — and the review queue will show how
  many real conflicts there are first.
- ~~The season YARN STATUS columns are extracted but not shown.~~ **Done
  26 Nov 2026** (migration 0032, caveats §19): the board groups by Palette,
  O4 status or season palette, and the decisions layer — colour subs in
  kilos, yarn swaps proposed per colourway, the CSV export and CSAT —
  is built on top of the figures this pipeline loads.
- **No "Sync now" button yet.** The ERP has one, with a file lock, a settle
  window for a file PPIC may still be saving, and a per-run log. Ours is a
  command; the plumbing underneath it (sha256 skip, staged-vs-loaded) is
  already there.
