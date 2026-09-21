# IM Master — Versions

Newest first. A version is cut when the project changes phase, not on a schedule.

---

## v0.1 — design complete, nothing built

**2026-09-21** · commit `c3ac3a8` · 21 commits · 16 documents · 4,794 lines

The state of the project **before testing the plan**. Everything here is design
and the evidence behind it. **No database, no code, no data has been created.**

### What v0.1 rests on

Four full seasons were profiled with one method, plus the embedded F25 price
sheet and the Matrix Master workbook:

| | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| Season number | 55 | 56 | 57 | 58 |
| Header row | 61 | 57 | 54 | 57 |
| Columns | 259 | 254 | 236 | 255 |
| Styles | 325 | 270 | 311 | 222 |
| **Formula columns** | 94 | **88** | **88** | **88** |

Everything below was measured in those files, not assumed.

### What was established

- **The model is stable.** Exactly 88 calculated columns, three seasons running.
- **The calculation chain is fully decoded** — every cost, duty, freight, landed
  cost and margin, back to ~35 rate cells.
- **Rates change occasionally, not every season** — labour 32,687 → 35,061 →
  35,061 → 37,607; exchange rate held three seasons then moved.
- **Column letters are unusable.** 247 of 254 headers moved inside S27 in three
  months. Header text is nearly stable.
- **Collections live in banner rows**, not a column, and close the block above.
- **`season_number` = 2 × YY + 4 (Spring) / + 5 (Fall)** — verified on four seasons.
- **The SKU is generated and embeds the season**, so the same style has a
  different SKU every season.
- **Identity drifts in every direction** — names renamed, numbers reused,
  48–60% of a carried style's colour tags do not survive the season.
- **Substitutions are scoped to a style**, and are almost never recorded: one
  instance (`YCA INDIGO - 860 (INDIA SEA SUB)`) in four seasons.
- **F26 lost the size column.** Three of four seasons record it; F26 alone doesn't.

### Decisions taken

| # | Decision | Where |
|---|---|---|
| 1 | **Store inputs, calculate the rest** — the 88 formula columns become a view | `schema.md` §1 |
| 2 | Every table keyed on its **own identity id**; no business value is a key | `schema.md` §4.0 |
| 3 | **Wholesale and SY are separate price tracks**, both required | `schema.md` §4.3 |
| 4 | `season_number`, `code` and `name` are **generated** from type + year | `schema.md` §4.1.1 |
| 5 | **19 tables, 5 views, ~190 columns** | `schema.md` §11 |
| 6 | Empty-box weight: **match the sheet first**, fix it as a visible change | `schema.md` §8 |
| 7 | Material cost: **one price per style**, for parity with the sheet | `schema.md` §8 |
| 8 | Substitution: **one "Sub to" field** now; notice/event model deferred | `identity.md` §6 |
| 9 | **Keep the existing React front end**; replace Node/SQLite with Postgres + FastAPI | — |
| 10 | The **Salesforce feed is the first deliverable** — no entry screens needed | `schema.md` §10 |
| 11 | **Operator** runs the IM and the Matrix, so the app becomes where they work and exports the same outputs | — |

### Still open

1. **Who sets prices** — Operator, or does it hand off (the Matrix legend says
   price problems go to Bu Novi)?
2. **Which integration model**, pending the user review — app as the source, or
   app alongside the sheet.
3. When a colour is substituted mid-season, does the **old tag stay sellable**?
4. **How far back to link products** — S26 onward, or the archive back to 2006.
5. Host and port for deployment.
6. What `sub group` means — the one field with no evidence anywhere.

### Deliberately not in v0.1

- No migration, no schema created, no data loaded.
- No adoption document — it waits on the user review.
- The substitution notice/event model — deferred to one field.
- Any import of S26 / F26 / S27.

### The documents

| Document | Lines | What it is |
|---|---|---|
| `prd.md` | 213 | Why, who for, what's in and out |
| `strategy.md` | 228 | Phases with checkable exit criteria |
| `schema.md` | 930 | **The schema** — tables, columns, calculations, open decisions |
| `identity.md` | 286 | Why a stable key is the point; substitution |
| `season-drift.md` | 205 | What changes between four seasons |
| `columns.md` | 509 | The original column-by-column profile |
| `matrix-master.md` | 208 | The range review, and how it fits |
| `plan.md` | 404 | The first build plan |
| `backend.md` | 269 | Stack, layout, API surface, deployment |
| `frontend.md` | 156 | Screens and interaction rules |
| `flow.md` | 194 | Where each kind of correctness is enforced |
| `logic.md` | 202 | Domain rules, with the unconfirmed ones marked |
| `config-contract.md` | 326 | The earlier v1 contract — superseded by `schema.md` |
| `caveats.md` | 222 | Risks and unvalidated assumptions |
| `github_SOP.md` | 262 | Branch model and secrets |
| `memory.md` | 180 | Checkpoint log |

`flow.drawio` holds the flow as a diagram.

### What v0.2 should contain

1. **The FastAPI skeleton** answering the seven endpoints `api.js` already calls,
   so the existing React screens run against Python.
2. **The Alembic migration** for the 19 tables.
3. **The golden test** — 20 real styles computed and diffed against the sheet's
   own values, to the cent. Nothing depends on the calculations until it passes.
