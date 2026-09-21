# Matrix Master — what it is, and how it fits

**Created 2026-09-21.** Read from `HM/Input/S27 MATRIX MASTER.xlsx`.

Companion to `schema.md`. The IM MASTER is the data; the Matrix Master is the
**range review** built from it. This describes what it holds, what it duplicates,
and what it would take to generate rather than maintain by hand.

> Nothing here is built. It is a scope note, not a plan.

---

## 1. Is doing this in Excel normal?

**Yes.** In apparel this artifact is standard — a line sheet / range plan, often
just "the board". Every brand builds one each season to review the range
visually. Large companies use PLM tools (Centric, FlexPLM, Backbone, Surefront);
small and mid-size brands overwhelmingly use Excel or PowerPoint.

So the artifact is right and the tool is a normal choice. What is unusual is how
far this one has been pushed past what a spreadsheet does well — see §5.

---

## 2. What the file actually is

| | |
|---|---|
| Size | **125 MB** |
| Of which images | **124.4 MB — 252 embedded photos** |
| Actual data | under 1 MB |
| Sheets | 11 — one per collection, plus `TBD`, `HOLD`, `NOTE KATEGORI`, `PB INTRUKSI`, `TEMPLATE` |
| Styles | **220** |
| Layout | **transposed** — one *column* per style, attributes down the rows |
| Pagination | manual, ~13 styles per page (`ESSENTIALS` is "PAGE 1 OF 5") |
| `LAST UPDATED` / `PRINTED DATE` | typed by hand (both `46147` ≈ 5 May 2026) |

### Styles per collection

| Sheet | Styles | New | Exact repeat | Update |
|---|---|---|---|---|
| ESSENTIALS | 62 | 26 | 36 | — |
| BEACH | 45 | 18 | 26 | 1 |
| SPRING TWO | 31 | 18 | 12 | 1 |
| SPRING ONE | 29 | 16 | 12 | 1 |
| AMERICANA | 28 | 14 | 13 | 1 |
| SUMMER | 25 | 11 | 13 | 1 |
| **Total** | **220** | **103** | **112** | **5** |

**Over half the range (112 of 220) is an exact repeat of a previous season.**
That is the same cross-season identity problem as the sales merge — and it means
the `products` layer serves this file too, not just the IM.

---

## 3. What is on each style

### 3.1 The 27 attribute rows

| Group | Rows |
|---|---|
| Measurements | `LEBAR/WIDTH` · `TINGGI/LENGTH` |
| Workflow status | `IM` · `IM PRICE` · `YARN %` · `POLA` · `SPEC` · `PB HAVE CHOSEN THE COLOR` · `ENTER COLOR IN IM` · `HANGING SWATCH SPEC` · `HANGING SWATCH KNIT` |
| Notes | `NOTE FOR WAYAN` · `PB NOTE` |
| Make-up | `WEIGHT` · `GG (MACHINE)` · `CONSTRUCTION` · `YARN` · `PLY` |
| Silhouette | `BASE BODY` · `BOTTOM TYPE` · `BOTTOM RIB` · `SLEEVE CATEGORY` · `SLEEVE LENGTH` · `LENGTH CATEGORY` · `PRINTED` · `DISTRESSED` |
| Lineage | `SIMILAR STYLE FROM PAST SEASON` |

Plus, per style: a **photo**, a **colourway list**, a **tag spec** (`TAG: C1/C2`)
and a repeat status (`NEW` / `EXACT REPEAT` / `UPDATE`).

### 3.2 The legend — 38 codes, encoded as colour

The meaning of most cells is carried by **fill colour, font colour and symbols**,
decoded by a legend at the top of every sheet:

```
OK PB (DESIGN)                 ENTER IM (entered on IM, price OK)
IM-P = entered, not yet reviewed for price
IM-P = entered, and it IS a price problem (need Bu Novi CC)
C-PB = PB already chose the colour      C = colour entered on IM
S = have spec        P = have pola      SW-S / SW-R = hanging swatch
NEW COLOR · REPEAT COLOR · 000 ONLY COLOR · HOLD COLOR FOR SY
DISCONTINUED COLOR FOR SY · SPECIAL COLOR REQUEST FROM REPS
SAMPLE HAS BEEN MADE · STILL PHOTOSHOP · GAVE TO PRODUCTION
RUNNING IN PROD · FINALIZED COLOR · NEED NEW PHOTO
yellow highlight in name = new style/design; in colour = not final yet
```

This is real, valuable data. It is just stored where nothing can query it.

### 3.3 `NOTE KATEGORI` — a rule applied by hand

`LENGTH CATEGORY` is **derived from `TINGGI/LENGTH`**:

| Category | Length |
|---|---|
| Super Cropped | ≤ 51 cm |
| Cropped | 51.5 – 54 cm |
| Biasa | 54.5 – 57.5 cm |
| Long | ≥ 58 cm |

The sheet holds two versions of the rule — "BEFORE" and
"GOING FORWARD (AFTER UPDATE)", dated *25 Juni 2024, update Sierra*. So the
thresholds have changed once already, and every style's category was re-derived
by hand.

---

## 4. Overlap with the IM

Measured on S27 — style names in the Matrix against style names in the IM:

| | Count |
|---|---|
| Names in the IM | 222 |
| Names in the Matrix | 217 |
| **In both** | **192** |
| Matrix only | 25 |
| IM only | 30 |

**55 styles disagree between two files that describe the same range.** Some will
be spelling differences, which is the same point: the two are reconciled by
reading, not by anything automatic.

| Already in the IM | Only in the Matrix |
|---|---|
| weight · construction · GG/gauge · base body · yarn · colour tags · collection · similar style from past season | width/length cm · sleeve category · sleeve length · length category · bottom type · bottom rib · ply · printed · distressed · photos · the workflow statuses |

The workflow rows are mostly **statuses about the IM itself** — "has this style
been entered on the IM", "is its price OK", "has the colour been entered". Today
a person tracks that by hand in a second file. If both live in one application,
those stop being tracked and are simply *known*.

---

## 5. What it costs today

- **125 MB**, 99.5% photos — slow to open, slow to sync on Drive, awkward to share.
- **Status lives in formatting.** "Which styles are still waiting on spec?" means
  reading five pages by eye. It cannot be counted, filtered or diffed.
- **Duplicate of IM data** kept in sync by hand — and §4 shows it already drifts.
- **Manual pagination.** Adding a style re-flows the columns of a page.
- **Manual `LAST UPDATED` / `PRINTED DATE`.**
- **`LENGTH CATEGORY` re-derived by hand** whenever the rule changes (§3.3).
- **Photos live only here**, in a workbook, rather than against the style.

---

## 6. Proposal — the same application, a second view

Not a second app and not a second database. Same styles, same colours, same
collections, same season; the collection sheets match the IM's banner rows
exactly, and `EXACT REPEAT` is the same product identity as the sales merge.

What it adds to `schema.md`:

**~10 columns on `styles`** — `width_cm`, `length_cm`, `sleeve_category`,
`sleeve_length`, `bottom_type`, `bottom_rib`, `ply`, `is_printed`,
`is_distressed`, `tag_spec`.

**`style_workflow`** (1:1 with `styles`) — one column per checkpoint, each a
small enum plus a timestamp: PB design, entered on IM, price reviewed, colour
chosen, colour entered, spec, pola, hanging swatch spec, hanging swatch knit,
sample, photo. Several of these become **derived** rather than tracked: "entered
on IM" is true when the style exists; "price OK" is true when it has a line price.

**`style_colorway_status`** — per colourway: new / repeat / 000-only /
hold-for-SY / discontinued / not-final / special request from reps.

**`length_categories`** — the §3.3 rule as data, with `valid_from`, so changing a
threshold re-derives every style instead of someone editing 220 cells.

**Photos** — already `styles.photo_url` in the schema; this is what fills it.

### The printed review becomes a generated report

HTML with print styling → PDF. Paginated automatically, photos from the database,
always current, no manual "PAGE 1 OF 5" and no typed date. The 125 MB workbook
stops existing.

---

## 7. The honest caveat

The Matrix is partly a **design artifact**. Its value to the boss is that it can
be scanned — photos, colour blocks, a status you can see at a glance. A generated
report has to be *at least as readable* as what exists now, and that is a real
design job, not a table dump.

It is the same lesson as the IM: the database part is straightforward; the
presentation is where the work is. Worth saying plainly, because a first version
that prints a correct but ugly grid would be a step backwards for its only reader.

---

## 8. Open questions

1. **Who maintains the Matrix, and is it the same person who fills the IM?** If
   different people, the workflow statuses are a hand-off between them and the
   app should model that hand-off, not just the fields.
2. **Is the review a live screen or strictly a printout?** It changes whether the
   effort goes into a print stylesheet or an interactive board.
3. **`NOTE FOR WAYAN` and `PB NOTE`** — free text, or a fixed set of instructions?
4. **`TBD` and `HOLD` sheets** — are these statuses of a style, or a staging area
   before a style joins a collection?
5. **Which is authoritative when the two files disagree** (§4) — the IM or the
   Matrix?
