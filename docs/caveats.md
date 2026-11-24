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

## 10. The circle rings — what counts as a confirmed repeat

**Open. Raised 2026-10-02, deliberately not guessed at.**

The two circles above the photo on a Matrix card say this garment is a repeat
of the previous season, one circle per channel, filled from the past season's
`sell_sy` / `sell_000`. That part is settled and built.

They were originally built the wrong way round — filled from the *next*
season — and flipped in migration `0023_past_season_rings`. Note that
`repeats_next` and `next_season_loaded` still look forward and are untouched:
the Sales History verdict (repeating + sold over threshold) is a decision
about where a style is *going*, and reads them.

What a **ring** around a circle means is not settled:

| ring | intended meaning | blocked on |
|---|---|---|
| orange `#DE8344` | ran in the **two** previous seasons — F26 linked to both F25 and F24 | nothing; this one is computable today |
| yellow `#FFFF54` | ran before, but that past season is **not confirmed** — "it's there but not final yet" | **what makes a past season confirmed** |

Nothing derives either colour yet, and the ring stays hand-applied by clicking
the circle. Two rules in one control where only one of them is defined would
be worse than leaving both manual: the operator could not tell which rings the
app had set and which they had.

`past_seasons` is computed and returned on every Matrix row — the count of
earlier seasons this product ran in — and shown in the circles' tooltip, so
whoever is applying rings by hand can see it. It is what the orange rule would
read.

**To close this, decide what "confirmed" means.** Two candidates were put up
and neither was chosen:

- the linked past-season style has `status = 'draft'` — the column exists, the
  Matrix already filters drafts out, and nothing new would be needed. But all
  1,465 styles are `active` today, so nothing would ever be yellow until the
  team starts saving drafts.
- a flag on the season itself, signed off as a whole — closer to how a season
  actually gets finalised, but needs a new column and somewhere to set it.

---

## 11. The colourway bands are the two channels

The ruled colourway list on a Matrix card means something specific:

| band | what sits there |
|---|---|
| above the black rule | the sample colour — one, never more |
| between the rules | **WHS 000** colourways |
| below the red rule | **SY** colourways |

So a style's sell channel decides which bands it can use. `SY ONLY` closes the
middle band, `000 ONLY` closes the one below the red rule, `BOTH` opens both,
and a blank channel restricts nothing — 257 styles arrived without one and
locking their colourways away behind an unfilled field would be wrong.

A colour already sitting in a band its channel does not allow is **faded and
struck through, not removed**. It is really there, and somebody has to be able
to see it to drag it where it belongs. The add button in such a band is
disabled rather than hidden, because removing it would take a row out of the
band and the rules would stop lining up across the block.

### The pens each band offers

A pen means the same thing wherever it appears, so each band has its own pair
rather than one palette across the card:

| band | pens a click walks through |
|---|---|
| above the black rule (sample) | all four |
| between the rules (WHS 000) | **pink**, then **purple** |
| below the red rule (SY) | **red**, then **blue** |

Underneath is the base, which is not chosen: **black** when the colour ran in
an earlier season, **green** when it is new to this garment.

A mark the band does not offer — a red name dragged up from the SY band into
the 000 band — is **kept but not drawn**, and the base shows instead. Dragging
it back brings the red with it. Clearing the mark on the move would be the
simpler rule but it destroys what somebody deliberately set; the server still
accepts all four, because they are all legitimate pens and which band a colour
is in is not its business.

**A colour sold through one channel only, on a style that sells through both,
is a convention rather than a rule the app enforces:** it goes in the middle
band written in the pink pen if it is 000-only, or below the red rule if it is
SY-only. `style_colorways.whs_channel` exists and would let this be derived,
but it is blank on all 3,580 rows, so there is nothing to derive it from. If
that column is ever populated the pink could become automatic the way green
did for a new colour.

### The TAG line

Under the repeat line each column of the layout sheet carries a short code —
`TAG: C1`, `TAG: C1/C2`, `TAG: C1 STRIPE`. It says how many yarn colours the
names below it are naming, which is the difference between a colourway called
`BLUE GLEN/CASHEW` and a two-colour garment whose colours are `BLUE GLEN` and
`CASHEW`. Read wrong, it is the wrong number of yarns ordered.

Stored as free text on the style (`styles.colorway_tag`), upper-cased by the
server. The field **offers** a list and **accepts** anything: five schemes are
suggested and filtered as it is typed, and a sixth can be typed straight in.
Deliberately open, for the same reason the Yarn field is — the scheme somebody
needs is the one that is not on the list yet, and a field that refuses it
sends them to the notes, where nothing can read it.

The list grows by itself (`repo.colorway_tags`): the seed, then every tag any
style already carries, so one person typing `C1/C2 STRIPE` puts it on
everybody's list. **That is the only way the vocabulary grows — there is no
second source to read it from.**

### Where the five came from

The team gave C1, C1/C2, C1/C2/C3, C1 MARL and C1 STRIPE. The imported data
agrees with all five and adds nothing, which is worth recording because it
means the list is short by evidence rather than by omission:

| | |
|---|---|
| Splitting 3,580 colourway names on `/` | 1 colour on 1,848, 2 on 1,610, 3 on 122, **4 on none** |
| Qualifier words in style names | STRIPE 106, MARL 28, JACQUARD 1, INTARSIA 0, OMBRE 0 |

So `C1/C2/C3` is the ceiling because the data has no fourth colour, and MARL
and STRIPE are the qualifiers because they are the only two that exist.

What the counts do NOT settle is whether the qualifiers combine with the
colour counts — 62 STRIPE styles have two-colour names and 22 have three, so
`C1/C2 STRIPE` is very likely real. It is not in the seed list because nobody
has said it is a tag; the day someone types it, it is on the list.

### Nothing to backfill from

**Every style starts blank.** The TAG row is not in the IM MASTER workbooks —
all five were searched and the string `TAG:` appears in none of them. What
those workbooks do have is `C1 ENDS` … `C9 ENDS`, which is a different thing:
yarn components in a colourway's bill of materials, not the garment's colour
scheme.

The tags live in the separate layout workbook the Matrix screen was drawn
from, which this project has never imported — nor has anything else from that
sheet, including the running order. So the tags get typed, 1,466 of them, or
a reader for that second workbook gets written.

---

## 12. Importing a style into a new season

Most of a new season's sheet is the last one's. The add slot on the Layout
tab offers **Import an existing style** beside typing a name: pick any style
from any season and the copy lands in this collection.

**The copy and the link are one action, and there is no way to do the first
without the second.** The link is what `related_styles` reads, what the
circle rings are derived from, and what makes a sales line for last season's
name merge with this season's. It is also the step that gets forgotten when a
repeat is typed out by hand — which is the whole reason this exists.

### Sharing the product IS the link

The copy takes the source's `product_id` at insert rather than being created
and then passed to `link_styles`. Two reasons:

- `related_styles` joins on `product_id`. Sharing it is not a step towards
  being linked; it is what being linked means.
- `link_styles` merges two products into one, and its merge moves
  `product_identifiers` across but **not** `product_colorways`. Creating a
  product and then merging it away would orphan the colour identities the
  sales matcher reads — invisibly, since every row still exists.

`_ensure_product` runs on the source first, so a source with no product does
not fail the way the manual link does ("Both styles need a product first").

### What carries, and what does not

The rule is: the **garment** carries, the **season's working state** does not.

| carries | does not |
|---|---|
| name (renameable on import), style number, TAG, photo | checklist ticks, notes |
| colourways, their band, and each one's yarns, %, ends | pen colours, highlights |
| sizes and weights, measurements, trims | position on the sheet, parked flag |
| operations and minutes | prices of every kind |
| the attribute block — gauge, body, construction, sleeve, packing, … | sales |

The style number is kept, not reissued: 239 of the 267 linked products in the
data carry one number across every season, and the copy is the same garment.

Prices are the one judgement call in that table. They are renegotiated every
season, and a carried price looks exactly like a set one on the card — there
is no way for the person reading it to tell. So they start empty.

### The deny-list, and what it costs

`_IMPORT_SKIP` names what is *not* copied; everything else on `styles` is,
read from `information_schema` at run time. That way a spec column added
later is copied without anyone remembering to add it.

The cost is the other direction: **a new per-season column has to be added to
`_IMPORT_SKIP`, or it will be copied.** That trade is deliberate — most of
the 85 columns describe what the garment is, and a wrong copy is visible on
the card and editable, where a missing copy is invisible.

The checklist is not on the list because nothing copies it: there is no
`INSERT INTO style_steps` in the import at all. A test asserts that absence,
since ticks carried from last season would claim work nobody has done.

---

## 13. The Pricing Matrix

A second sheet over the same season and collection, switched beside the
Matrix Master heading. Same blocks, same styles, same two running sequences
for the card numbers — a price is looked up by where the garment sits on the
sheet, and two sheets numbered differently would mean counting columns twice.

### What `F27 MATRIX PRICING.xlsx` could and could not say

The file is the layout, and **it is empty of prices**. All five sheets, one
per collection, are ruled and styled and carry 159 numeric cells between
them — every one of which is a card index number. Not one price.

So the shape is known and the content is not:

| established | still open |
|---|---|
| one column per style, twelve to a block | which price is on which row |
| index row → photo (12 rows) → name (2 lines) → 8 rows of 30pt | what the second "FAF / FAH" row is for |
| two of those 8 rows set at 16pt, the largest font in the block | whether the note row is per-style or per-block |
| both 16pt rows read `FAF / FAH`; one row reads `NO X/L` | |
| titles alternate "MATRIX PRICING" and "000 PRICE MATRIX" | |
| long collections split "(PAGE 1 OF 2)" | |

`FAF / FAH` is the finishing location: the column exists and holds FAF on
413 styles, FAH on 308 and BOTH on 283.

The title saying "000 PRICE MATRIX" is worth noting against the data:
`price_000` is **empty on all 1,466 styles**, as are `sy_retail_price_usd`,
`sy_mark_up` and `final_sale_price_usd`. The only prices the import actually
carries are `whls_retail_price_usd` (91%) and `whls_line_price_usd` (74%).
Whatever the rows turn out to be, three of the seven price columns have never
held anything.

### The rows are data

`PRICING_ROWS` in `frontend/src/sections/PriceCard.jsx` is the stack, top to
bottom, and the card renders from it. Settling what the rows are is editing
that list — not the card, not the CSS, not the query, which already returns
every price column plus the finishing location and the style number.

What is in it today is a **placeholder with the right shape**, not an answer.

---

## 14. The Design sheets

`/design`, reached from the Design tile. One sheet per style, as the workbook
keeps them: the knit slots down the side, the colourways across, the photo
beneath.

```
                 ALMOND BUTTER/HUSKY BEIGE   SILVER DEW/FRIGID GRAY
    C1 PLY       2                           2
    C1           YST ALMOND BUTTER - 872     YST SILVER DEW - 968
    C2 PLY       2                           2
    C2           YST HUSKY BEIGE - 506       YST FRIGID GRAY - 871
    TAG COLOR    ALMOND BUTTER/HUSKY BEIGE   SILVER DEW/FRIGID GRAY
```

Nothing new is stored. Every part of it was already in the database:

| sheet | column |
|---|---|
| `C1`, `C2`, `C3` | `colorway_yarns.slot` |
| the yarn | `yarn_colors.name` through `yarn_color_id` |
| **PLY** | `colorway_yarns.ends` |
| TAG COLOR | `style_colorways.ws_tag_color` |
| the title | the same `style_code` concat the Matrix uses |

**PLY, ENDS and `ends` are three names for one number** — how many strands
are held together. The workbook's column is `C1 ENDS`, the design sheet calls
it `C1 PLY`. `styles.ply` is a different column, filled on 4 styles of 1,467,
and is not this.

### Why it is a page and not a panel

The style editor's BOM section shows one colourway's bill of materials at a
time. Nothing in the app could show that C2 is HUSKY BEIGE in one colourway
and FRIGID GRAY in another — and reading across that row is the whole job. It
is what catches a slot nobody changed when a colourway was copied.

Read-only for the same reason the editor keeps the add-a-line and
remove-a-line controls: a second place to edit the same thing is a second
place to get it wrong.

### Trims show up in the C rows

25 of the 251 cells in F26 · COTTON are not yarn. `XBP 729 2 CM-DARK ROAST`
is a button sitting in C3 with PLY 3, which on an unmarked sheet reads as
three strands of yarn rather than three buttons.

So a cell says whether it is a trim, by name prefix — the only signal that
separates them, since trims sit in slots 2 to 11 mixed in with yarns (§13,
`yarn-split.md` §5). The flag is **display only**; nothing writes it, and it
does not pre-empt the open question of where trims should live.

### Placing the slot markers

Beside the photo is a tray holding one label per slot the style uses — C1 and
C2 for MERRY CREW CHUNKY, because those are the rows its bill of materials
comes to. Drag one onto the part of the garment that uses it; drag it off
again to put it back. That is the workbook's C1 and C2 arrows, which live in
its drawing layer and have never been imported.

Stored on `styles.design_marks` as `{"1": {"x": 0.34, "y": 0.22}}` — a jsonb
map rather than a table, because it is presentation: a handful of coordinates
per style, always read and written with the sheet, never joined to or
filtered on.

**The coordinates are fractions of the photo, 0 to 1, not pixels.** The sheet
is read on screen and printed on paper at different sizes, and a pixel offset
that sat on the yoke in the browser would be somewhere else on the page.

Three decisions worth keeping:

- **The whole map is written, not one marker.** Dragging C2 somewhere new is
  one change to an arrangement of five labels, and sending the arrangement
  avoids a merge nobody would get right with two sheets open.
- **Off the photo means unplaced**, so there is no separate remove to find.
  One gesture does both.
- **An out-of-range position is clamped, not refused.** A drag that ends a
  pixel past the edge is a drag to the edge; failing the save would lose the
  whole arrangement over something nobody can see.

A marker is drawn only for a slot the style actually has, so a stale entry —
C9 on a style that now has two yarns — draws nothing and the two real labels
still appear in the tray.

---

## 15. The blueprint: a yarn line belongs to a part

A pullover is not knitted from one yarn in one place. The body can be a 2-ply
cotton while the collar, cuffs and hem are a rib in something else, and the
bill of materials could only say "this colourway uses these yarns" — never
which went where. The team read it off the drawing instead.

The BOM section now has two tabs over **one list of lines**:

| tab | shows |
|---|---|
| **BOM** | every yarn of a colourway, each row saying which part it is for |
| **Blueprint** | a flat pullover; pick a part and edit that part's yarns |

Neither holds anything of its own. The Blueprint filters the colourway's own
`bom` array and edits the same line the BOM tab shows, so the two cannot
disagree.

### NULL means the whole garment

`colorway_yarns.component` is nullable with **no default**. All 8,465
imported lines are NULL, and that is the honest reading: nobody has ever
split one. A default of `'body'` would have claimed 8,465 decisions that were
never made. Lines left that way stay on the BOM tab and are counted against
no part; the Blueprint says how many there are rather than hiding them.

### Two lists that have to agree

`GARMENT_PARTS` in `repo.py` is what the server will store.
`PARTS` in `Blueprint.jsx` is what has a shape to point at. A part on one and
not the other is either unsaveable or unselectable, so a test compares them
directly — not a copy of the list, the lists themselves.

`neck · body · sleeve · cuff · hem`

Deliberately not a lookup table. The parts of a pullover are a short fixed
vocabulary that belongs to the drawing, and a row somebody added to a table
would be a part nothing on screen could select.

### The drawing

Drawn as SVG paths rather than loaded as an image, because it has to be
clickable part by part. Both sleeves are one part and both cuffs are one
part: a garment has a sleeve yarn, not a left-sleeve yarn. The collar is an
ellipse with a hole, and the hole is deaf to the pointer so clicking the gap
still picks the collar around it. A part that already has yarn on it is
shaded, so the drawing says what has been done before anything is selected.

---

## 16. The load

A 53-agent adversarial audit (2026-11-18) confirmed 22 performance and
stability findings; all but a handful of low-impact ones are fixed and each
fix is pinned by a drift test. The invariants worth knowing when editing:

- **API JSON is gzipped** (FastAPI middleware, level 6 — measured) and nginx
  gzips the static files. The season Matrix went 455KB → 27KB on the wire.
- **Photos are immutable and cached for a year** — every upload gets a fresh
  random name — and are **resized to 1200px JPEG on the way in**
  (uploads.py). A small upright JPEG passes through byte-identical.
- **/api/meta is one scan of styles** (27 `SELECT DISTINCT` scans before)
  behind an ETag: navigations revalidate with a 0-byte 304.
- **matrix_rows** lost five fields nothing reads and runs its ±2-season
  probes as laterals; the endpoint's JSON was byte-diffed against the
  pre-change capture, 313 rows identical.
- **Stale responses are no-ops everywhere**: season loads, cell saves (per
  row), the editor's style load, the design sheets, the link search. The
  editor race could previously SAVE style A's data onto style B.
- **One interaction re-renders one card.** SheetCard / PriceCard /
  DesignSheet / the attribute rows are memoised; the Matrix hands them
  identity-stable proxies that delegate to the current render's handlers —
  wrapping the handlers themselves in useCallback would have frozen
  refresh() over the first season (the audit's verifier caught this).
- **Every page is its own chunk**; Login is eager. A tab that outlives a
  redeploy gets one automatic reload (the flag re-arms on success) and a
  worded error with a Reload button after that, never a white page.

Deferred as low-impact, unverified: list_styles' per-style colorway count,
pool min_size, the editor's serialized costing/name fetches, photo-preview
object URLs never revoked, DevBanner's health ping in production, Inter
shipping all unicode subsets, no favicon.

---

## 17. The Color Table

The swatch board (`/colors`, migration 0028): the season's yarn colours under
team-named palettes, two kilos-available numbers per swatch, hover for the
styles knitted with it, click for the panel that edits the board's own facts.

- **The board owns four columns and nothing else** — `palette_id`, `hex`,
  `qty_with_proj`, `qty_without_proj` on `yarn_colors` (`_COLOR_FIELDS`).
  The names still belong to the BOM import; renaming a colour here would
  silently detach it from every bill of materials that typed it.
- **The swatch colour is typed in by a person.** "YST ARTIC FOX - 507"
  carries no colour a machine could derive, so every swatch is grey until
  somebody sets a hex in the panel. The two quantities are the same: NULL
  means nobody has said, which renders as a dash and is different from 0.
- **Trims are left out with `_is_trim`** — the same rule the design sheet
  uses. But the import also left non-colours that the prefix rule cannot
  catch: `CANCEL RELEASE`, `HOLD RELEASE`, `TBD`, `SALE 04`, `BENANG JAHIT`
  (sewing thread), `OBRAS SESUAI WARNA TOPI` (an instruction, not a colour).
  They sit under Unsorted until the yarn split (`yarn-split.md`) separates
  real colours from BOM noise; hiding them by hand-list here would be a
  second copy of that decision.
- **Palettes can be made, not yet renamed or deleted.** Creating one is
  idempotent (`ON CONFLICT`), so two people typing "Open Color" get one
  group. Deleting would be `ON DELETE SET NULL` — the colours fall back to
  Unsorted — but no one asked yet and an un-deletable group costs nothing.
- **The hover list is fetched per colour and cached per visit.** For a
  workhorse like YCA BREAKER WHITE that list is 660 styles (~40KB once);
  the card shows ten and says how many more.
- **StrictMode taught a lesson here**: a `useRef(true)` live-flag that is
  only set at creation is false after dev's mount-unmount-mount, and every
  fetch result gets dropped — the page showed "Loading the board…" for
  ever while the network tab showed a 200. The flag is re-armed inside the
  effect body, and the test suite pins that.

## 18. Open

- No cutover date, no data owner (§2). Both are `strategy.md` parallel-track items.
- The Phase 0 checklist (`logic.md` §6) — eleven unconfirmed rules.
- Whether anything downstream reads the Excel today: a costing sheet, a macro, a
  report. Each is an integration requirement that appears the day Excel stops
  being updated, and none of them is visible from here.
- Host and port for deployment (`config-contract.md` §7).
- **What makes a past-season repeat "confirmed"** (§10). Until it is decided,
  the circle rings stay hand-applied and neither colour is derived.
- **Where the colourway TAG codes come from** (§11). They are not in the IM
  MASTER workbooks, so either the layout workbook gets an importer or the team
  types every one. Nothing else from that workbook has been imported either,
  which makes this one case of a bigger gap rather than a field on its own.
- **Whether a qualifier can combine with a colour count** — `C1/C2 STRIPE`
  and the like (§11). The data says it probably can; nobody has confirmed it,
  so it is not seeded, only typeable.
- **What the eight rows of the Pricing Matrix hold** (§13). The F27 template
  is blank, so the layout is known and the content is not. `PRICING_ROWS`
  carries a placeholder until somebody says.
- **Whether `1708` and `1708 B` are one `YCA BLACK B`** — 84 of the 104 BOM
  lines in the yarn merge wait on it (`yarn-split.md` §4).
- **Whether trims belong in the BOM or in `style_trims`** — 39% of
  `yarn_colors` is zips, stamps and buttons, and `style_trims` has no writer
  at all (`yarn-split.md` §5).
