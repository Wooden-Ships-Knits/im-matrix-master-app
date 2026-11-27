# PDM — Versions

Newest first. A version is cut when the project changes phase, not on a schedule.

---

> **A gap in this file.** It records v0.1 and then nothing until v1.1. The app
> was designed, built, loaded with real data and shown to the team in between,
> and none of that was written down here — read the git log for `v1.0`
> (2026-11-24) and the commits around it instead. v1.1 begins **after the two
> `hide features` commits** of 2026-11-26, the point at which the rebuild
> started being walked through with the team one screen at a time.

---

## v1.1 — the team walkthrough

**2026-11-27** · base `07ce3cc` · **in the working tree, not yet committed**

Everything below sits in the working tree, uncommitted, so this version has no
commit hash yet.

The phase this cuts: the app stopped being built for the people building it
and started being shown to the people who will use it. v1.0 was the whole
surface; the two `hide features` commits narrowed what the front door offers;
this version makes the two screens that are still showing — **Matrix Master
Layout** and **Matrix Master Attributes** — stand on their own in front of
someone who has never seen them.

### Where it starts

The boundary is `07ce3cc`. The two commits named `hide features`, immediately
before it, did this, and are **not** part of v1.1:

| Commit | What it hid |
|---|---|
| `a44b14e` | Five of seven home cards; the band links on Matrix and the style editor; the Pricing Matrix tab. Also fixed the doubled yarn label (`YST YST RED PAPRIKA - 893 - 893`) and removed the unused `yarn_label()` helper. |
| `07ce3cc` | The database name and reset warning in the DEVELOPMENT banner. |

Nothing there was deleted — every route still works, and every hidden block is
commented out in place with the date and the reason.

### Added

**A Legend on the Matrix Master Layout tab** — `frontend/src/sections/LegendKey.jsx`
(new, 153 lines). A second floating panel under the TBD tray, saying what the
colours and marks on a card mean. Collapsible, remembered per browser, hidden
when printing.

Its contents are one array, `LEGEND`, written by hand — nothing is read from
the database. 17 keys are filled in, all of them read off the card code and
`styles.css`:

| Group | Keys |
|---|---|
| The number | pink = 000 only · red = SY only · white = both |
| Above the photo | the two repeat circles, filled / hollow / orange-ringed, and "no circles = not a repeat" |
| Colourways | the three bands and their rules · yellow vs grey row · green vs black name |
| At the foot | filled vs outlined step chip |

**Column filters on the Matrix Master Attributes grid** —
`frontend/src/components/ColumnFilter.jsx` (new, 205 lines). The funnel the
workbook has, on every column header: sort A→Z / Z→A, a search box over the
values, and a tick list of every distinct value. `(Blank)` is a real, tickable
value, because "which styles still have no Construction" is what this grid gets
asked most.

Behaviour worth knowing, all of it deliberate:

- Filtering one column narrows the choices offered in the next, as Excel does —
  but a value a column already keeps stays in its own list, so nothing can be
  ticked off and then be impossible to tick back on.
- Unticking the last value returns the column to **no filter**, not to a list
  that happens to name every value. A style added tomorrow appears without
  anyone clearing anything.
- Sorting and filtering belong to the Attributes grid alone. The Layout tab
  keeps the arrangement the team saved.
- A bar above the grid says how many styles are showing and how many columns
  are filtering, with one **Clear filters** button — with thirteen columns
  scrolling sideways, the column doing the filtering is usually off screen.

**`PDM FEATURE CHECKLIST.gs`** (new, 237 lines, project root). A Google Apps
Script that builds the team's feature checklist as a native Google Sheet —
64 features across six apps, a Status dropdown, the Features cell greying on
Done and staying yellow otherwise, and a Progress tab counting each block. Run
once against the sheet; it rebuilds both tabs from scratch, so it is not to be
re-run after PICs are filled in.

The live sheet is `14nGCueDTUQ6zSL7paNVj9Mz6JZdML2uhBtTAPGEY_ZU`. It has since
been edited by hand: PICs assigned, **Color Table renamed to Yarn Automation**,
and the repeated App names cleared so each shows once per block. The Progress
tab was rewritten to count by row range rather than by App name, because
clearing those names broke the `COUNTIFS` the script generates. **The script
and the live sheet have diverged — the sheet is the real artefact.**

### Changed

- **The TBD tray no longer positions itself.** `.tbd-tray` lost its own
  `position: fixed` / `top` / `right` / `z-index` and now sits in a new
  `.float-stack`, a fixed column holding both hovering widgets. The tray's
  height changes as styles are parked, so anything pinned under it by its own
  `top` would overlap it or leave a hole. Add a third widget by putting it in
  the stack; nothing needs measuring.
- **`compare` and `cellText` were lifted out of the `Matrix` component** to
  module scope and exported, so the drift pins can import the real functions
  instead of copies of them.
- `frontend/src/styles.css` — +229 / −10. `.float-stack`, `.legend-*`,
  `.colf-*`. All three hidden when printing.
- `frontend/src/pages/Matrix.jsx` — +160 / −19.

### Fixed

- **Z→A sorting put blanks first.** The sort direction was applied by negating
  the comparator, which flipped the blanks-last rule along with everything
  else. A blank is the absence of an answer, not the smallest one, so it
  belongs last whichever way the answers run. The direction is now applied
  inside `compare`. Found by a test written against the new code, before it
  reached anyone.

### Deleted

Nothing. No file, route, column or behaviour was removed in v1.1.

### Tests

`frontend/test/sheet.test.mjs` — +40 lines, four new pins under
*the Attributes grid sorts the way a spreadsheet does*:

- A→Z reads the numbers inside the words (`3GG` before `12GG`)
- Z→A reverses them
- A→Z puts blanks last
- **and Z→A puts them last too, not first** — the pin for the bug above

Each was mutation-tested: the exact original negation was reintroduced and the
blanks pin failed on it. The pins import the real `format.js`, because a
`toFixed()` stand-in rounded `0.2435` down to `0,243` — which is the very thing
`roundFixed` exists to get right, so a pin built on the stub would have
asserted the bug. Full suite passes.

### Still open

1. **Nine legend keys have no meaning recorded** — the three highlighter-bar
   colours, the purple band and its star, and the four hand pens on colourway
   names. They are applied by hand and the app stores no meaning for them, so
   only the person marking them can say. They sit commented out at the foot of
   `LEGEND` with their colours already filled in.
2. **`APP_PASSWORD` on the VM** — the team was given `admin123`. Unless the
   VM's `.env` says so, that password does not work.
3. **No username field exists.** The login takes one shared password. Whether
   to add a real `admin` box, or go straight to company-domain sign-in, is
   undecided.
4. **`PDM FEATURE CHECKLIST.xlsx` is still in the project root**, superseded by
   the Google Sheet and kept only as a backup.
5. **Band links on the other pages still point everywhere** — Browse,
   Checklist, Report, Color Table and Design were not narrowed the way Matrix
   and the style editor were.
6. **What "Done" means on the checklist** — built, or usable with real data.
   Several IM Master rows are marked Done while the measurements, trims,
   photos, the eleven Matrix attribute columns and the S25–F26 season rates
   are all still empty.

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
