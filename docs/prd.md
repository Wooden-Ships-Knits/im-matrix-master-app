# IM Master — Product Requirements

**Project:** IM Master — knitwear style master data for PT In Fashion
**Repo folder:** `im-master-app`
**Status:** Draft — pending discussion
**Last updated:** 2026-09-10

---

## 1. Background

Style master data at PT In Fashion lives in an Excel workbook — `S27_IM_MASTER.xlsx`
and one sibling per season before it. Every sweater style, every colorway, every
yarn line, every price and measurement sits in one file with hundreds of columns,
opened and edited by several people.

A first web version of this exists (`../im-master`, Node + SQLite, one commit
pushed). It proved the shape of the problem and is worth reading for the domain
model. It is **not** the basis of this project: this is a rebuild on the stack
the rest of our applications run on, starting from an **empty database**.

Why rebuild rather than extend:

- The old app is a single SQLite file on one machine. Two people editing at once
  is not a supported story, and the file is the backup strategy.
- It does not deploy the way our other applications deploy. `wholesale-order-entry`
  and `ymal-project` both run as Postgres + FastAPI + nginx on the VM. IM Master
  being the odd one out costs us every time it needs attention.
- The Excel-derived schema was inherited wholesale. Some of it is real structure,
  some of it is spreadsheet layout that got promoted to columns by accident. A
  fresh start is a chance to separate the two.

**We are starting with no data.** Agreed 2026-09-10. Nothing is migrated from the
old SQLite file and nothing is re-extracted from the Excel on day one. See §8
Phase 0 for what that implies, and `caveats.md` §1 for the risk it carries.

---

## 2. Problem statement

Style master data is held in a spreadsheet that cannot enforce its own rules,
cannot be safely edited by more than one person, and cannot tell anyone what
changed, when, or why.

---

## 3. Goals

**Primary**

1. **One authoritative record per style.** Not a file, not a copy, not a tab —
   a row, with a known shape and enforced constraints.
2. **Safe concurrent editing.** Two people working the same season at the same
   time is normal, not an incident.
3. **Data that is right by construction.** Percentages that must total 100 do.
   A SKU that must be unique is. The database refuses what the spreadsheet
   silently accepted.
4. **Deploys like everything else we run.** Same compose shape, same VM, same
   backup story as the sibling applications.

**Secondary**

5. An API other tools can read, so the next automation that needs style data
   does not start with "export the Excel".
6. A change history — who changed a price, and when.

---

## 4. Non-goals (explicitly out of scope for v1)

- **Migrating the S27 data.** Explicitly deferred (§1). If and when it happens,
  it is its own phase with its own exit criteria.
- Replacing the ERP, or anything downstream of costing and production.
- Purchase orders, production tracking, shipment booking.
- Public or customer-facing access. This is an internal office tool.
- A mobile app. Mobile-legible in a browser is enough.
- Automatic price calculation from the BOM. v1 stores prices as entered; deriving
  them is a real project with real approval requirements (`logic.md` §5).

---

## 5. Success metrics

> **Needs agreement before build starts.** The honest baseline is "how long a
> style takes to enter today, and how often it is wrong" — and nobody has
> measured either.

| Metric | Baseline (Excel) | Target |
|---|---|---|
| Time to enter one new style, start to finish | TBD — must measure | ≤ baseline |
| Styles with an incomplete required field | TBD — likely non-zero | 0 (blocked at save) |
| BOM percentage errors per season | TBD | 0 (blocked at save) |
| Duplicate SKUs in a season | TBD | 0 (unique constraint) |
| People able to edit at once without conflict | 1 | all of them |
| Time to answer "what changed on this style" | not answerable | seconds |

**Measure the first two before the app replaces anything.** Sit with whoever
enters styles for one afternoon. It is an hour of work and it is the only
baseline we will ever be able to capture.

---

## 6. Users

| User | Need |
|---|---|
| **Merchandising / office staff** | Enter and edit a style quickly, without fighting the form. The primary user; if it is slower than Excel it will not be used. |
| **Production / costing** | Read yarn BOM and weights, trust that they are current |
| **Management** | Browse a season, export, answer questions without asking for a file |
| **Us (engineering)** | A schema that holds, an API that is stable, a backup that restores |

---

## 7. Requirements

### Must have (v1)

- **Style CRUD** — create, browse, search, edit, delete, with season / style
  name / colorway / size filters.
- **The full style record on one screen**, sectioned: identity, sizes, colorways,
  yarn BOM, knit details, prices, packaging, shipping, measurements.
- **Colorways per style**, each with its own yarn BOM (yarn, percentage, ends).
- **Per-size data** — which sizes a style comes in, finished weight per size,
  point-of-measure values per size.
- **Reference lists that teach themselves** — a yarn, collection, sub group or
  packing method typed once is offered next time. This is what keeps spelling
  consistent, and it is the single most valued behaviour of the old app.
- **Validation at save**, in a transaction. Partial styles never land.
- **Style photo upload.**
- **Concurrent-edit safety** — a second editor is told, not silently overwritten.
- **Backup and restore** that someone other than its author can perform.

### Should have

- Change history per style (who, when, what field).
- Export a season to Excel/CSV — the office will ask for this on week one.
- Duplicate a style as the starting point for a new one. Most new styles are
  variations, and re-typing is where errors come from.
- Draft vs active status, so half-entered styles do not pollute a search.

### Could have (later)

- S27 data import, if the decision is revisited.
- Costing roll-up from BOM + yarn prices.
- Size-grading assistance for measurements.
- Read API consumed by other internal automations.

### Won't have (v1)

- Per-user permissions beyond "office staff can edit". Everyone who can reach it
  can edit it. Revisit when there is a reason to.
- Approval workflows.
- Anything requiring a second hosted service.

---

## 8. What to do — phases

Detail and exit criteria in `strategy.md`. Summary:

**Phase 0 — Agree the record.** What a style *is*, as a schema. The one decision
everything else is built on, and the one an empty-database start makes both
easier and more dangerous (`caveats.md` §1).

**Phase 1 — Backend skeleton.** Postgres + FastAPI + Docker, the schema live,
migrations running, health endpoint answering.

**Phase 2 — API.** Style CRUD, reference lists, search. Verified against the API
before any UI exists.

**Phase 3 — Frontend.** Browse and the style editor.

**Phase 4 — Real use.** Photos, export, change history, backups, and the first
real season entered by real staff.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Empty start means the schema is never tested against real variety** | High | Enter 10–15 real styles by hand in Phase 2, chosen to be awkward |
| Schema is wrong and found late | High | Phase 0 exit criteria; migrations from day one so change is routine |
| Slower to use than Excel → staff do not adopt it | High | Measure the baseline (§5); watch someone use it in Phase 3 |
| Two sources of truth while Excel is still live | High | Set a cutover date; until then Excel is authoritative and the app is a pilot |
| Nobody is sure who owns data entry | Medium | Name an owner in Phase 0 |
| Google Drive folder used as a working directory | Medium | Develop from a local clone; the VM runs from a clone (`caveats.md` §7) |
| Backups exist but are never tested | Medium | Restore drill in Phase 4, written down in the README |

---

## 10. Open questions

1. **What is the cutover?** When does the app become authoritative and the Excel
   stop being edited? Without a date this becomes a permanent second system.
2. Starting empty — is the intent that **S27 is never loaded**, or that it is
   loaded later once the schema has settled? These are very different projects.
3. Who owns data entry day to day, and who signs off that the schema is right?
4. Which fields are genuinely **required** to save a style? The spreadsheet
   required nothing, so this has never been decided.
5. Does anything downstream consume the Excel today — a costing sheet, a report,
   a macro? Those become integration requirements the day Excel stops updating.
6. Does IM Master need to reach the Shopify catalog, or is it purely internal?
7. Where does it run — the same VM as the other stacks, and on which port?
8. Is per-user login needed for the change history to be worth anything, or is
   a shared login acceptable in v1?
