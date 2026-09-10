# IM Master — End-to-End Flow

**Created 2026-09-10.** How data moves through the system, and where each kind of
correctness is enforced.

---

## 1. The governing idea: one write path

The Excel workbook's failure is not that it is a spreadsheet. It is that it has
**no single write path**. Anyone can change any cell, from any copy, in any
order, and nothing checks anything. Two people with the file open produce two
truths and no way to tell which is which.

Everything here follows from fixing that:

| Concern | Where it is enforced | Why there |
|---|---|---|
| **Shape** — types, ranges, required | Pydantic, at the API door | Cheapest place to reject; gives field-addressed errors free |
| **Rules** — BOM totals, uniqueness | `im_master/validation.py` | Cross-field logic that Pydantic cannot see |
| **Integrity** — FKs, cascades, unique | Postgres constraints | The last line. Holds even if a bug bypasses the layers above |
| **Atomicity** — all or nothing | one transaction per save | A half-saved style is worse than a rejected one |
| **Conflict** — who wins | optimistic version check | Someone's afternoon is not silently discarded |

The frontend duplicates some of these checks for fast feedback. **That is a
convenience, not the enforcement point.** Every rule is enforced server-side
whether the form checked it or not.

---

## 2. Full picture

```
┌──────────────────────────────────────────────────────────────┐
│ BROWSER — React SPA, served by nginx                         │
│   Home · Browse · Style editor                               │
└──────────────────────────┬───────────────────────────────────┘
                           │  same origin, /api/*
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ nginx (web container)                                        │
│   /            → built SPA assets, SPA fallback              │
│   /api/*       → proxy to api:8000  (upstream via variable,  │
│                  so web boots even when api is down)         │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ FastAPI (api container)                                      │
│                                                              │
│   routers/     HTTP in, HTTP out                             │
│      ↓         Pydantic: shape, types, ranges                │
│   im_master/   domain rules — logic.md §2                    │
│      ↓         knows nothing about HTTP                      │
│   db.py        transaction() — one per save                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Postgres (db container, pgdata volume)                       │
│   styles ─┬─ style_sizes                                     │
│           ├─ colorways ── bom_lines                          │
│           └─ measurements                                    │
│   reference: seasons · sizes · yarns · collections ·         │
│              sub_groups · packing_methods                    │
│   constraints + cascades = the last line of defence          │
└──────────────────────────────────────────────────────────────┘

     photos → uploads volume (NOT the database, NOT the image)
              back these up alongside pg_dump — see backend.md §10
```

---

## 3. Saving a style — the path that matters

The editor holds the whole style. Save sends the whole style. Here is what
happens to it:

```
  1. Browser        Save clicked
                    │  client-side checks already ran (BOM total shown live)
                    │  PUT /api/styles/42  { style, sizes, colorways[bom], measurements }
                    │  + the version read at load time
                    ▼
  2. nginx          proxy to api:8000
                    ▼
  3. Pydantic       types, ranges, required fields
                    │  ✗ → 422 with a field-addressed error list
                    ▼
  4. Domain rules   BOM totals 100 per colorway · sizes exist ·
                    measurements only for chosen sizes · prices ≥ 0
                    │  ✗ → 400, naming the colorway or field at fault
                    ▼
  5. BEGIN ──────────────────────────────────────────────────┐
       version check                                         │
         ✗ changed → 409, "someone else edited this"  ROLLBACK
       get_or_create reference values (new yarns, etc.)      │
       upsert style row                                      │
       replace sizes · colorways · bom_lines · measurements  │
       bump version                                          │
     COMMIT ─────────────────────────────────────────────────┘
                    │  ✗ constraint violation → ROLLBACK, 400
                    ▼
  6. Response       the saved style, read back
                    ▼
  7. Browser        render the confirmed state — not the optimistic one
```

**Steps 5's children are replaced, not diffed.** The payload is the complete
truth about that style, so the write deletes and re-inserts colorways, BOM lines,
sizes and measurements inside the transaction. Simpler than diffing, and it makes
"the API state equals the payload" true by construction rather than by care.

The cost: row IDs for children churn on every save. That is fine while nothing
references them. **It stops being fine the moment something does** — a change
history keyed on `bom_line.id`, for instance. Revisit this if Phase 4's history
needs child-level granularity.

**New reference values are created inside the same transaction** (step 5). If the
save fails, the yarn someone typed does not survive as a phantom dropdown entry
for a style that was never saved.

---

## 4. Reading a style

```
GET /api/styles/42
   → one query per child table, assembled into the nested aggregate
   → { style, sizes[], colorways[ { ..., bom[] } ], measurements[] }
```

Whole-aggregate read, matching the whole-aggregate write. The editor renders it
directly; there is no second shape to keep in sync.

`GET /api/refs` returns every reference list in one call, because the editor
cannot render a single dropdown until it has them.

---

## 5. Startup — the empty-database path

We start with **no data** (`prd.md` §1), which makes the cold path the normal
path for the first weeks. It has to be deliberate, not incidental.

```
docker compose up -d --build
   db      → pgdata volume created empty
   api     → waits for db healthy → alembic upgrade head → schema exists, no rows
   web     → serves the SPA

first browser load
   GET /api/refs    → { seasons: [], sizes: [...], yarns: [], ... }
   GET /api/styles  → []
   Browse renders   → "No styles yet. Add one."   ← NOT a blank page
```

Two things this demands:

- **Sizes must be seeded.** They are not free-form (`logic.md` §3) and the
  measurement grid has no columns without them. A migration seeds the standard
  run (X/S · S · M · L · X/L); everything else starts genuinely empty and fills
  as people type.
- **Every empty state is a real state**, designed and tested. On day one the
  empty state is the entire application, and an empty page that looks broken is
  the first impression the tool gets.

---

## 6. Where each failure surfaces

| Failure | Where it is caught | What the user sees |
|---|---|---|
| Missing required field | Pydantic | Error on that field, section flagged |
| BOM ≠ 100% | domain rules | Named colorway, live total already red |
| Duplicate style name in season | unique constraint | "A style with this name exists in S28" |
| Someone else saved first | version check | "Changed by someone else — reload?" |
| Yarn typed with odd spacing | normalized get_or_create | Nothing — it resolves to the existing yarn |
| `api` container down | nginx variable upstream | "Not connected", app still loads |
| `db` container down | healthcheck, api won't start | `api` restarts until db is healthy |
| Photo too large / wrong type | upload validation | Rejected with the reason, style unaffected |

---

## 7. What does not exist yet, and where it would go

- **Change history** — an append-only table written inside the step 5
  transaction. Needs the child-ID churn question in §3 answered first, and
  possibly per-user identity (`prd.md` open question 8).
- **Export** — `im_master/export.py`, reading through the same domain layer
  rather than querying tables directly, so it cannot drift from the API's view.
- **Import (S27)** — deferred to Phase 5. When it comes it is a script that goes
  through the **same** write path as the API, not a bulk insert. A loader that
  bypasses validation is a loader that fills the database with exactly the data
  the validation exists to prevent.
