# IM-MASTER-APPS — Memory

**Purpose of this file:** a running checkpoint log. At every meaningful
checkpoint — a decision made, a component finished, a direction changed — a new
entry gets appended at the top of §3. Reading §2 + the top two entries of §3
should be enough to pick the work back up cold, without re-reading the other
docs.

Newest entry first. Keep entries short. Link out to the other docs instead of
repeating their content here.

---

## 1. One-line summary

Rebuilding IM Master — knitwear style master data for PT In Fashion, today an
Excel workbook — as a Postgres + FastAPI + React application on the same stack
the other VM applications run, starting from an empty database.

---

## 2. Stable facts (rarely change)

| Thing | Value |
|---|---|
| Domain | Sweater/knitwear style master data — styles, colorways, yarn BOM, prices, measurements |
| Seasons | `F26` = Fall 2026, `S27` = Spring 2027. Letter + year; the sheet's `SEASON` counter (57, 58) gives the order — **S27 is the newer season** |
| Prices | **Wholesale and SY are separate prices; a style needs both.** SY is not a discount off wholesale |
| Replaces | `S27_IM_MASTER.xlsx` and one workbook per season before it |
| Stack | Postgres 16 + FastAPI + React/Vite + nginx, one `docker-compose.yml` |
| Layout | `backend/` · `frontend/` · `docs/` at the repo root |
| Data at start | **Empty.** No migration, no Excel reseed — decided 2026-09-10 |
| Repo | **TBD** — not decided (`github_SOP.md` §2) |
| Push policy | **Commit only, do not push**, until the remote is agreed |
| Owner | Denandro (AI Automation Engineer). Data entry: PT In Fashion office staff |

**Sibling projects worth copying patterns from:**
`ymal-project` (this doc set, compose shape, FastAPI + Postgres + nginx layout),
`wholesale-order-entry` (the same stack already running on the VM),
`../im-master` (the previous Node/SQLite version — **read for the domain model,
do not inherit the schema**).

**Standing constraints:**

- Office staff must not need a terminal. If it is slower than Excel it will not
  be used, and correctness will not compensate.
- Concurrent editing is normal, not exceptional — it is a main reason for the
  rebuild.
- Files sit on a Google Drive shared drive. Develop from a **local clone**; named
  Docker volumes, never bind mounts (`caveats.md` §7).
- Excel stays authoritative until Phase 4 passes. There is always a fallback.

---

## 3. Checkpoint log

### 2026-09-21 — Checkpoint 4: the Salesforce feed is the first deliverable

Why the database is worth it, settled. Not "spreadsheets are bad" — the IM is
already a machine input. `im-to-sales-force` parses this workbook and pushes it
to Salesforce.

Measured: 13.7 MB file → **53 MB of sheet XML** (May copy: 92 MB). Streaming it
with the stdlib, discarding values, takes 1.5 s; pandas building a 4,766 × 249
DataFrame costs several times that, after the file syncs down from Drive. Then
four pipeline steps and an 84-entry field map kept up to date **by hand**, with
`header_row=56` hardcoded (F26 is 54, S27 is 57) and column-letter fallbacks —
against a sheet where 247 of 254 headers moved in three months. It maps 12 BOM
slots; S27 has 21, so the rest never arrive.

From the database that is one query. Added `v_salesforce_export`, whose column
names **are** the Salesforce API field names, so the mapping becomes part of the
schema. `schema.md` §10.

**Decision:** the Salesforce feed is the first thing to build — it needs no
entry screens, works while the sheet is still where people work, and forces the
golden test (computed values vs the sheet, to the cent) before anyone depends on
the numbers.

**Correction:** `prd.md` listed "safe concurrent editing" as a primary goal. The
IM is a Google Sheet, which already does that. The real drivers are this feed
and the silent errors in `schema.md` §7.

---

### 2026-09-21 — Checkpoint 3: schema checked against S27

Profiled `Copy of S27 IM MASTER.xlsx` (19 Aug) the same way as F26 and compared.
**The 19 tables hold both seasons.** Column kinds land almost identically —
88 formula columns in each. Same grain, same banner-row collections, same labour
formula, same duty model, same sizes, same materials list, same three parameter
rows.

Four column-level changes came out of it: `gauge` is **text** (S27 has `2I`),
`styles` needs **both** sample (S27) and sale (F26) price, `retail_markups`
becomes an array (S27 uses 2.2/2.25/2.3), and `markets` must cover S27's
FOB Bali / Diverse / EFSN / Ellis and the SY channel.

**Column letters are dead as an identifier, proven twice:** only 11 of 201
shared headers sit in the same column across seasons — and within S27 alone,
**247 of 254 headers moved between the May and August copies**. Header *text*
also drifts (`WHS` vs `WHS MARK`), so an importer would need a per-season
field→header map (`sheet_column_map`, a 20th table) — only if we ever import.

See `schema.md` §9. Open: is SY really a market (S27 carries a separate SY
price block)?

---

### 2026-09-19 — Checkpoint 2: schema v2 — store inputs, compute the rest

Re-read the **live** `F26 IM MASTER.xlsx` (Google Sheets export saved into this
folder; 4,684 data rows / 311 styles, about half the May copy). This time read
which cells are formulas. Of 236 columns: **88 formula, 54 colour slots, 38 typed,
31 empty, 25 constant all season.** The formulas are plain arithmetic over the
typed inputs and ~35 rate cells in rows 51–53 (exchange rate 16,000, labour
35,061 IDR/h × 1.6, DHL 13.91 USD/kg, duty 29% / 28.5% …).

**Direction change:** compute the 88 formula columns in a view
(`v_sku_costing`) instead of storing them. Reverses `columns.md` §8.1. Rates move
to `season_rates`; the 15 season-constant text fields to `seasons`. See
`schema.md` v2.

Found along the way: content code fully determines duty category; boxes are a
3-item list; rows 1–32 are a materials price list (yarns, zippers, buttons);
the style code is `CONCATENATE(CAT,SEASON,CONTENT,GAUGE,STYLE,#)`.

**Not safe yet:** `#` as a key (`#99` = two styles; five styles have two
numbers). Empty-box weight is a fixed cell, so the 48 cm box is costed at
1.32 kg in 971 rows vs 1.6 kg in row 53 — decision needed before the golden test.

**Next step:** answers to `schema.md` §8, then the migration and the 20-style
golden test (computed view vs the sheet's own values, to the cent).

---

### 2026-09-10 — Checkpoint 1: doc set written, project scoped

Nine documents written into `docs/`, following the convention established in
`ymal-project`. The folder previously held only `memory.md` with its header and
no content; `backend/` and `frontend/` are still empty.

**Three decisions taken, all of them shaping everything downstream:**

| Decision | Choice | Why |
|---|---|---|
| **Stack** | Postgres + FastAPI + React/Vite + Docker | Matches `wholesale-order-entry` and `ymal-project` already on the VM. Same compose shape, same backup tooling, same operational knowledge. The old app's single SQLite file was one writer on one machine, and the file was also the backup plan. |
| **Data** | **Start empty** | No migration from the old SQLite, no re-extraction from the S27 Excel. Clean schema, no inherited spreadsheet columns. |
| **Repo** | **Undecided** | `github_SOP.md` written with the branch model and secret rules; remote left TBD. Committing locally only. |

**What starting empty costs, and the mitigation.** With no data, nothing pushes
back on a wrong schema — the field that cannot hold a real value fails months
later instead of immediately, and the awkward styles that break schemas never
arrive on their own. So `strategy.md` Phase 2 requires **10–15 real styles
entered through the API, chosen from the S27 Excel because they are awkward**,
and Phase 0 requires walking three real styles field-by-field on paper. Read the
Excel for the hard cases even though we are not importing it. Full argument in
`caveats.md` §1.

**The schema rules are currently guesses.** `logic.md` carries **eleven
UNCONFIRMED rules** derived from the old app's schema and the Excel layout, not
from anyone who makes sweaters — BOM tolerance, name uniqueness, price currency,
whether SKUs are composed by a rule. They are collected as the Phase 0 checklist
in `logic.md` §6. **None should be implemented until confirmed:** a guessed rule
that is enforced blocks a legitimate style at 4pm, someone fudges a percentage to
get past it, and the constraint ends up guaranteeing wrong data.

**Two items put on a parallel track** because they have external clocks
(`strategy.md` §2):

- **Measure the Excel baseline** — time to enter a style, error rate. Only
  capturable while Excel is still how the work is done. Once people use the app
  it is gone permanently and no improvement can ever be shown.
- **Name a data owner and a cutover date.** Without a date this becomes a
  permanent half-migration with two sources of truth diverging weekly
  (`caveats.md` §2).

**Next step:** Phase 0 — agree the record. `config-contract.md` §3–§5 is the
proposal; the ❓ marks are what needs answering. It is the one phase engineering
cannot complete alone, and it has no owner yet.
