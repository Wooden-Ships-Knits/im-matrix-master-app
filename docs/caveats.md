# PDM — Caveats

Things that could bite us. Assumptions not yet validated, platform limits,
data-quality and organisational risks.

---

## 1. Starting with an empty database

**Decided 2026-09-10.** No migration from the old SQLite app, no re-extraction
from `S27_IM_MASTER.xlsx`. The database starts empty and fills as people type.

This is a real simplification — no migration script, no legacy columns kept for
data we do not understand, no reconciliation. But it removes the only thing that
would otherwise test the schema for us, and that cost should be named:

- **Nothing pushes back on a wrong schema.** With 237 styles loaded, a field that
  cannot hold a real value fails immediately and loudly. With zero styles, it
  fails months later, on the style that finally needs it.
- **The awkward cases stay invisible.** The style with nine colorways, the one
  with a non-standard size run, the one where somebody put a note in a numeric
  cell. Those are exactly the styles that break a schema, and none of them will
  arrive on their own.
- **Volume behaviour is untested.** Search, list rendering, and the browse screen
  all behave differently at 300 styles than at 3.

**Mitigation, and it is not optional:** `strategy.md` Phase 2 requires 10–15 real
styles, entered through the API, chosen from the S27 Excel *because they are
awkward*. Read the Excel for the hard cases even though we are not importing it.
Phase 0 exit criterion 4 requires walking three real styles field-by-field
against the schema on paper.

**The unasked question:** starting empty is a good way to begin. Whether S27 is
**never** loaded, or loaded later once the schema has settled, is a different
decision and nobody has made it (`prd.md` open question 2). If the answer turns
out to be "never", then the old app and the Excel must stay readable somewhere
permanently, because that is where the history lives.

---

## 2. Two sources of truth

Until a cutover date exists and passes, style data lives in **both** the Excel
workbook and this app. That is the most dangerous period of the project.

- Someone updates a price in Excel. Someone else updates it in the app. Both are
  now wrong in different ways, and nothing reconciles them.
- The longer it runs, the more expensive it is to resolve, and the resolution is
  always manual.

**Mitigation:** Excel stays **authoritative** until Phase 4 passes. The app is
explicitly a pilot before that — anything entered in it is understood to be
re-enterable. Then a dated cutover, announced, after which Excel is read-only.

**A cutover date that has never been set is the single most likely way this
project ends up as a permanent half-migration.** It is in the `strategy.md`
parallel track for that reason.

---

## 3. Self-teaching reference lists cut both ways

A yarn typed once is offered next time. It is the most-valued behaviour of the
old app and it is also how a dropdown becomes a mess:

- Every typo becomes a permanent entry. `MERNIO 2/48` sits in the list forever,
  and the next person picks it because it is there.
- Two spellings of one yarn split the data. Searching for one misses the other,
  and no report will ever tell you.

**Mitigation:** normalized matching — case- and whitespace-insensitive, unique
index on the normalized key (`backend.md` §4). That catches casing and spacing,
which is most of it.

**It does not catch genuine misspellings**, and nothing automatic will. So:

- An admin screen to **merge** two reference values into one, re-pointing
  everything that references them. Not v1, but it will be needed — plan for it
  rather than being surprised.
- Never auto-delete unused values. Someone will type it again next season.

---

## 4. The schema rules are guesses

`logic.md` is explicit about this and it bears repeating here, because it is the
risk most likely to be forgotten once the doc has been read once.

Eleven rules are marked **UNCONFIRMED** (`logic.md` §6). They were derived from
the old app's schema and the Excel's column layout, not from anyone who makes
sweaters. Among them:

- Whether BOM percentages must total exactly 100 or tolerate rounding.
- Whether the same yarn can appear twice in one colorway.
- Whether style names are unique within a season.
- What currency each price is in.

**Enforcing a guessed rule is worse than enforcing nothing.** It blocks a
legitimate style at 4pm on a deadline, someone finds a workaround — a fake
colorway, a percentage fudged to make the total work — and the workaround becomes
permanent data. Then the constraint is *guaranteeing* wrong data.

**Do not implement any UNCONFIRMED rule until Phase 0 confirms it.** Where a
rule is genuinely uncertain, prefer a **warning** over a rejection.

---

## 5. Adoption

The Excel workbook is not good, but it is **fast for the people who know it**,
and it never says no. A form that validates is by definition slower than a cell
that accepts anything.

Specific ways this fails:

- The measurement grid is unusable with a mouse. Anyone entering a full size run
  will go back to Excel, and they will be right to (`frontend.md` §3).
- Paste from Excel does not work, so migrating a style by hand takes twenty
  minutes instead of two.
- A validation error appears with no indication of which section caused it, on a
  form that is four screens long.
- The app rejects a style at 4pm that Excel would have accepted (§4).

**Mitigation:** measure the Excel baseline **before** the app exists
(`strategy.md` §2 — it cannot be captured afterwards), and watch a real person
enter a real style in Phase 3. The places they hesitate are the backlog.

**If it is slower than Excel, it will not be used, and no amount of correctness
will compensate.**

---

## 6. Operational

### Backups

Two things must be backed up together: the Postgres database and the uploads
volume. A `pg_dump` alone restores styles with broken photo links.

The old app's backup story was "copy the .db file", which was at least simple. A
Postgres dump on a schedule is better but only if it is **tested**. Phase 4
requires a restore drill performed by someone who did not write the procedure.

**An untested backup is a belief.**

### Nobody but us can run it

`docker compose up` is not an office skill. If the VM restarts and the stack does
not come back on its own, PDM is down until an engineer is available.

Mitigation: `restart: unless-stopped` on every service, and a one-page runbook in
the README covering start, stop, check, and restore. Written for someone who has
never used Docker.

### Single VM

No redundancy, and none is proposed — this is an internal tool and an afternoon
of downtime is survivable. Worth stating so nobody assumes otherwise.

---

## 7. Google Drive

This repo lives in a Google Drive shared drive. That is fine for documents and
actively hostile to a running application.

- **Bind mounts onto Drive are unreliable.** Drive's sync and file locking break
  containers in ways that are hard to diagnose. `ymal-project` hit this and the
  compose file carries the warning. Use **named volumes**, never bind mounts.
- **Develop from a local clone.** Run `git clone` somewhere local and work there.
  The VM likewise runs from a clone, not from Drive.
- **`node_modules`, `.venv` and `__pycache__` in a Drive folder** are thousands of
  files Drive tries to sync. Gitignored, but they still sync — another reason to
  work locally.
- **`.DS_Store` everywhere.** Gitignored (`github_SOP.md` §7).
- Drive is not a substitute for git history, and a Drive folder is not a backup
  of a database.

---

## 8. Postgres specifics

- **`numeric`, never `float`, for money and measurements.** Float arithmetic in a
  price column is a class of bug that surfaces as a customer-facing number that
  is one cent wrong and cannot be explained.
- **Password with special characters.** Passing the connection as a URL breaks
  when the password contains `/` or `@` — the host parses as the database name.
  Pass the parts separately (`backend.md` §9). This exact bug cost time in
  `ymal-project`.
- **Migrations from day one.** Adopting Alembic after data exists is a much worse
  day than adopting it now, while the database is empty.
- **Cascade deletes are permanent.** Deleting a style takes its colorways, BOM
  lines, sizes and measurements with it. That is correct behaviour and it is also
  one click. The confirm dialog must say what goes with it (`frontend.md` §4).

---

## 9. Scope creep, in the likely order it arrives

Each of these will be asked for, and each is reasonable. None is v1.

| Ask | Why it is bigger than it sounds |
|---|---|
| "Can it calculate cost from the BOM?" | Needs yarn prices we do not hold, plus wastage and labour. It is a costing system. A wrong number reaches a customer quote. |
| "Can it print a tech pack?" | A layout project with its own approval loop, not an export |
| "Can it push to Shopify?" | An integration, with its own field mapping and failure modes |
| "Can production see it too?" | Now it needs permissions, and permissions need identity |
| "Can it do last season too?" | That is the S27 import, deferred to Phase 5 |

The answer to all of them is the same: yes, after Phase 4, as its own phase with
its own exit criteria. Not folded into the current one.

---

## 10. Open

- No cutover date, no data owner (§2). Both are `strategy.md` parallel-track items.
- The Phase 0 checklist (`logic.md` §6) — eleven unconfirmed rules.
- Whether anything downstream reads the Excel today: a costing sheet, a macro, a
  report. Each is an integration requirement that appears the day Excel stops
  being updated, and none of them is visible from here.
- Host and port for deployment (`config-contract.md` §7).
