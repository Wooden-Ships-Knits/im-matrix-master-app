# IM Master — Strategy

**Created 2026-09-10.** How the project is sequenced and why.

---

## 1. Principle

Every phase produces **one concrete artifact** and has **exit criteria** that can
be checked. A phase is not "build the backend" — it is "produce this thing, and
here is how we know it is right."

Rationale: the risky part of this project is not the code. A CRUD app over a
relational schema is well-understood work. The risk is **the schema** — whether
the record we design actually holds every style the factory produces — and
**adoption** — whether the people who enter styles today prefer this to Excel.
Phasing by artifact forces both to be tested early, while changing them is still
cheap.

**Rule:** do not start phase N+1 while phase N's exit criteria are unmet.
The one exception is the parallel track below.

---

## 2. Parallel track — start now, blocks nothing

Two items have **external clocks**. They do not belong to a phase because waiting
for a phase to reach them wastes calendar time, and in one case destroys
information permanently.

| Item | Why it can't wait |
|---|---|
| **Measure the Excel baseline** (`prd.md` §5) | Time-to-enter and error rate can only be measured while Excel is still how the work is done. Once people start using the app, the baseline is gone and we can never show an improvement. One afternoon of watching. |
| **Name a data owner and a cutover date** | An organisational decision with a lead time. Until it exists, the app is a pilot next to a live spreadsheet, and every week that runs is a week of divergence nobody is reconciling. |

Both should be in motion before Phase 1 finishes.

---

## 3. Phases

### Phase 0 — Agree the record ⬅ **current**

**Goal:** know exactly what a style *is*, before any of it is built.

**Deliverable:** the schema in `config-contract.md` §3–§5, agreed — entities,
fields, types, what is required, what is a free-text note and what is a
constrained reference list.

**Why this is the whole ballgame.** Three layers have to agree on this shape:
Postgres stores it, FastAPI serves it, the form renders it. Change it after all
three exist and you change all three. Change it now and you edit a document.

**Starting empty makes this both easier and more dangerous.** Easier because
there is no legacy data forcing us to keep a column we do not want. More
dangerous because there is also no data pushing back when we guess wrong. The
old app's schema (`../im-master`, README "Database schema") and the S27 Excel are
the reference material — read them, do not inherit them.

**Exit criteria:**

1. Every entity and field listed in `config-contract.md`, with type and required/optional.
2. **Required fields decided** — `prd.md` open question 4. The spreadsheet
   required nothing; someone has to say what a style cannot be saved without.
3. Reference lists (yarn, collection, sub group, packing method, season, size)
   separated from free text, with the self-teaching behaviour confirmed as wanted.
4. **Walked field-by-field against 3 real styles** from the S27 Excel — one plain,
   one with many colorways, one awkward. On paper. If a real style does not fit
   the record, the record is wrong and this is the cheapest moment to find out.
5. A named person has said the shape is right.

**Not in this phase:** no code, no containers, no database. A document.

---

### Phase 1 — Backend skeleton

**Goal:** the schema exists, runs, and can be changed safely.

**Deliverable:** `docker compose up` brings up Postgres and FastAPI; migrations
create the Phase 0 schema; `GET /api/health` answers.

**Exit criteria:**

- `docker compose up -d --build` from a **local clone** starts `db` and `api`.
- Migrations run forward from empty, and one throwaway migration proves the
  change path works. Adopting migrations later, after data exists, is a much
  worse day.
- `GET /api/health` returns 200 with database connectivity confirmed.
- `.env` is gitignored and `POSTGRES_PASSWORD` has no default (`github_SOP.md` §6).
- `pg_dump` produces a restorable dump of the empty database — the backup story
  is proven while nothing is at stake.

**Unblocks:** everything. Nothing else can be built against a schema that has no
running home.

---

### Phase 2 — API

**Goal:** a complete style can be created, read, searched, edited and deleted —
correctly — without any interface.

**Deliverable:** the endpoints in `backend.md` §5, plus tests.

**Exit criteria:**

1. Full round trip: create a style with sizes, two colorways, BOM lines, prices,
   packaging, shipping and measurements; read it back **byte-identical** in shape.
2. Every rule in `logic.md` §2 enforced server-side and covered by a test —
   including the ones the UI will also check. The API is the boundary that matters.
3. Saves are transactional: a payload that fails validation halfway leaves
   **nothing** behind.
4. Search returns correct results filtering by season, style name, colorway, size.
5. Reference lists teach themselves — a new yarn typed once is offered next time.
6. **10–15 real styles entered through the API**, chosen to be awkward: the most
   colorways, the most yarn lines, the oddest size run, a style with missing data.
   This is the substitute for having migrated data, and it is not optional. If the
   schema is wrong, this is where it shows.

**Unblocks:** the frontend can be built against a stable contract instead of
alongside a moving one.

---

### Phase 3 — Frontend

**Goal:** office staff can do the job in a browser.

**Deliverable:** the screens in `frontend.md` §2 — browse/search, and the style
editor with all its sections.

**Exit criteria:**

- A style can be created, edited and deleted end to end in the browser.
- Validation errors are shown next to the field that caused them, not as a
  stack trace or a generic banner.
- Unsaved-changes warning on navigation. The editor is a long form and losing it
  once is enough to lose a user.
- Concurrent edit is handled — the second saver is told, not silently discarded
  (`logic.md` §2.6).
- **Someone who is not us enters a real style, watched, without instructions.**
  Note where they hesitate. That list is the Phase 4 backlog.

---

### Phase 4 — Real use

**Goal:** it is the tool, not a demo.

**Deliverable:** photos, season export, change history, a written backup and
restore procedure, and one real season entered by real staff.

**Exit criteria:**

- Photo upload works and photos survive a container restart (named volume, not
  container filesystem).
- Export produces a file the office can actually open and use.
- Change history answers "who changed this price and when".
- **Restore drill performed** — dump, destroy, restore, verify. By someone other
  than the person who wrote the procedure. An untested backup is a belief.
- A season entered in the app, by staff, without falling back to Excel.

**Only after this does a cutover date mean anything.**

---

### Phase 5 — Decide about S27

**Goal:** settle the question Phase 0 deferred.

By now the schema has survived real use, so an import can be designed against
something proven rather than something hoped for. The options — leave history in
Excel, import S27 only, or import every season — are a business decision, not a
technical one, and it is a better decision made here than at the start.

**Deliverable:** a decision, recorded in `memory.md`. If it is "import", that is
its own phase with its own exit criteria, and a backup taken first.

---

## 4. Dependency map

```
parallel track ─────────────────────────────────┐
  measure Excel baseline ──────────────────┐    │
  name owner + cutover date ───────────┐   │    │
                                       │   │    │
Phase 0  agree the record              │   │    │
   ↓                                   │   │    │
Phase 1  backend skeleton              │   │    │
   ↓                                   │   │    │
Phase 2  API + 15 real styles          │   │    │
   ↓                                   │   ▼    │
Phase 3  frontend ◄────────────────────┼───┘    │
   ↓                                   │        │
Phase 4  real use ◄────────────────────┘        │
   ↓                                            │
Phase 5  decide about S27 ◄─────────────────────┘
         (needs a schema proven by Phase 4)
```

---

## 5. What this sequencing buys

- **The schema is challenged three times before it is expensive to change** —
  on paper in Phase 0, by 15 awkward styles in Phase 2, by real staff in Phase 3.
- **Migrations exist before data does.** The first schema change happens against
  an empty database, so the mechanism is proven when it costs nothing.
- **The API is correct before the UI hides it.** A bug found through curl is a
  bug found in one place; the same bug found through a form is a debate about
  which layer owns it.
- **The S27 question is answered late, on evidence.** Deciding it now would mean
  guessing about a schema that does not exist yet.
- **Excel stays authoritative until Phase 4 passes.** There is always somewhere
  to fall back to.

---

## 6. Open

- Phase 0 has no owner yet. It needs one — it is the only phase that cannot be
  done by engineering alone.
- Where this deploys, and on which host port (`caveats.md` §7).
- Whether Phase 4's change history requires per-user login (`prd.md` open
  question 8). If it does, it moves into Phase 2 — retrofitting identity is
  worse than building it in.
