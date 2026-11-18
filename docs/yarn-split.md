# Splitting the yarn list into Material and Colour

A plan, not a change. Nothing in this document has been applied.

Every number here was measured against the live database on 17 November 2026
(676 `yarn_colors`, 8,461 BOM lines over 3,574 colourways) and against
`YARN ANALYSIS NOV 10.xlsx`.
The queries are in the commands below each section, so they can be re-run
before anyone acts on this.

---

## 1. The verdict

**Split it.** Three tables, not two:

| table | holds | status |
|---|---|---|
| `materials` | the yarn itself — YCA, YST, YY, YP, YTX, YAC, BJ — with its price | exists, 22 yarn rows |
| `colors` | ALMOND BUTTER, SCANDIA BLUE, INDIGO COAST, and the colour family | **new** |
| `yarn_colors` | the pairing: `material_id` + `color_id` + `code` | exists, becomes a join |

`colorway_yarns` keeps pointing at `yarn_colors`, so the bill of materials
does not change shape. That is the point of keeping the pairing table rather
than hanging the BOM off two foreign keys.

### Why three and not two

Because colour is not a property of a material. **84 of the 296 distinct
colour names already exist under more than one material**:

```
ALMOND BUTTER     BJ, YCA, YST
BREAKER WHITE     BJ, YAC, YCA
CASHEW            BJ, YCA, YST
CORNSILK          BJ, YCA, YST
BEACH SKY         BJ, YAC, YCA
```

With two tables, "which yarns come in ALMOND BUTTER" is a `LIKE '%ALMOND
BUTTER%'` across a text column. With three it is a join. Colour family —
which the workbook has a column for and the database has nowhere to put —
belongs on `colors`, once per colour, not 676 times.

The workbook already works this way. Its sheets are per material (`YY+YST`,
`YCA`, `YAC`, `YP&YTX`) and the `YCA` sheet's columns are
`OLD COLOR NAME | COLOR | COLOR FAMILY`.

### The columns already exist and are empty

`yarn_colors` has `material_id`, `prefix` and `color_code` today. **All three
are NULL on all 676 rows.** The schema anticipated this split; the importer
only ever wrote `name`. So this is less "change the design" than "finish it".

```sql
SELECT count(*) AS n, count(material_id) AS mat,
       count(prefix) AS pre, count(color_code) AS code FROM yarn_colors;
-- 676 | 0 | 0 | 0
```

---

## 2. What the flat name is costing

One string doing three jobs means the same yarn colour is stored more than
once, and nothing can see that it is the same.

| rows that are one yarn colour | BOM lines each |
|---|---|
| `YCA BREAKER WHITE - 658` / `YCA BREAKER WHITE` | 1,079 / 1 |
| `YCA KHAKI - 749` / `YCA KHAKI` | 324 / 1 |
| `YCA APPLE RED - 925` / `YCA APPLE RED` | 91 / 2 |
| `YCA RED CHILE - 772` / `- 772` (no space) / no code | 41 / 2 / 1 |
| `YCA INDIGO - 860` + two rows with a note in brackets | 34 / 1 / 1 |

A BOM line on the wrong row is the wrong yarn ordered. This is the colourway
rename problem one layer down, and it has the same fix: one row per real
thing, with the aliases recorded rather than left as separate rows.

The name is also being used as a comment field:

```
YCA INDIGO - 860 (FOR SY CHANGE TO YCA TWILIGHT SKY - 701)
YCA INDIGO - 860 (INDIA SEA SUB)
```

Both are `YCA INDIGO - 860`. The bracket is a substitution instruction with
nowhere else to live — which is an argument for a `substitute_for` column on
the pairing, not for three rows.

---

## 3. The split is safe to compute

All 413 yarn rows parse as `MATERIAL · COLOUR · CODE`:

```
YCA  178    YST  158    BJ  42    YAC  16    YTX  9    YP  8    YY  1    ST  1
```

13 need a decision rather than a rule, and they fall into three families:

- **YTX (9 rows)** — `YTX - 031`, `YTX - 024`. No colour name at all; YTX
  colours are numbered, not named. The split gives `material=YTX`,
  `color_id=NULL`, `code=031`. That is correct, and it means **`color_id`
  must be nullable**.
- **`YP TX 030` / `YP TX 031` (2 rows, 1 use each)** — almost certainly typed
  `YTX - 030` / `YTX - 031`, which exist with 17 and 27 uses. Both YP and YTX
  are real materials, so this is a human call, not a rule.
- **The two bracketed `YCA INDIGO` rows** — merge into `#5`.

---

## 4. The merge mapping

**17 groups. 38 rows collapse to 17. 104 BOM lines repointed** — but only
20 of those lines are in the safe set. The other 84 are waiting on one
question about `YCA BLACK B`.

The rule: the row with the most BOM uses wins; on a tie, the row that has a
code wins. That tie-break matters in exactly one case, `BJ VERDIGRIS`, where
the two rows have one use each and picking by use alone would keep the row
with no code.

### Safe — one code, differing only in spelling or a missing code

| keep | drop | lines moved |
|---|---|---|
| `YCA BREAKER WHITE - 658` #6 (1079) | `YCA BREAKER WHITE` #674 | 1 |
| `YCA KHAKI - 749` #8 (324) | `YCA KHAKI` #523 | 1 |
| `YCA APPLE RED - 925` #62 (91) | `YCA APPLE RED` #105 | 2 |
| `YCA RED CHILE - 772` #193 (41) | `YCA RED CHILE- 772` #198, `YCA RED CHILE` #651 | 3 |
| `YCA INDIGO - 860` #5 (34) | `… (FOR SY CHANGE …)` #483, `… (INDIA SEA SUB)` #659 | 2 |
| `YST WAXED LODEN - 775` #291 (31) | `YST WAXED LODEN - 77` #550 | 1 |
| `YST DARK CEDAR - 891` #381 (20) | `YST DARK CEDAR` #429 | 1 |
| `YST GNARLED PINE - 821` #326 (11) | `YST GNARLED PINE - 82` #592 | 1 |
| `YST CAPRICE PINK - 537` #107 (10) | `YST CAPRICE PINK` #173 | 3 |
| `BJ RED GINGER - 933` #397 (10) | `BJ RED GINGER` #413 | 1 |
| `BJ SANDSTONE - 183` #353 (3) | `BJ SANDSTONE` #520 | 1 |
| `BJ ALMOND BUTTER - 735` #509 (2) | `BJ ALMOND BUTTER` #477 | 1 |
| `BJ GOLD - 8271` #479 (1) | `BJ GOLD- 8271` #170 | 1 |
| `BJ VERDIGRIS - 9510` #166 (1) | `BJ VERDIGRIS` #478 (1) | 1 |

**14 groups, 30 rows, 20 BOM lines.** `- 77` and `- 82` are truncations of
`- 775` and `- 821`; both have a single use against 31 and 11.

### Needs a human before anything runs

| rows | why |
|---|---|
| `YCA BLACK B - 1708 B` #38 (103), `- 1708` #103 (43), `-1708 B` #25 (36), `-1708` #51 (3) | **Two codes, 1708 and 1708 B.** The spacing variants are clearly one row each, but whether 1708 and 1708 B are the same yarn is a question for whoever buys it. 185 BOM lines ride on the answer. |
| `YP TX 030` #360, `YP TX 031` #359 vs `YTX - 030` #396, `YTX - 031` #350 | Typo or a real YP colour? 2 lines either way. |

**3 groups, 8 rows, 84 BOM lines** — four fifths of the whole merge, sitting
on one unanswered question.

Nothing in the safe table touches more than 3 BOM lines. Nothing in it is
irreversible if the repoint is recorded.

---

## 5. Why `style_trims` is empty — and the bigger problem

**It has no writer.** The only `INSERT INTO style_trims` in the codebase is
the one `import_style` uses to copy a style, and it copies from an empty
table. `import_season.py` never writes it. It was designed in
`0001_initial.py`, documented in `schema.md`, and never wired.

The trims are not missing — they are in the yarn table:

| what is in `yarn_colors` | rows | BOM lines |
|---|---|---|
| yarn | 413 | 7,659 |
| stamps (`STAMP …`, `STAMP-…`) | 141 | 466 |
| zips (`XZIP …`) | 81 | 107 |
| buttons and snaps (`XBS`, `XBP`, `XSNAP`) | 25 | 162 |
| unclassified — `ELASTIC90 FOG`, `LUREX GOLD`, `YELLOW`, `SALE O4` | 15 | 57 |
| grommet | 1 | 10 |
| **total** | **676** | **8,461** |

**39% of the yarn list is not yarn**, and 802 BOM lines point at those rows.
`SALE O4` is not a material of any kind; it is a note that reached the colour
column.
The importer reads the workbook's `COLOR1`…`COLOR21` slots and files
everything it finds as a yarn, which is what those columns actually hold.

Two things follow:

- **Slot does not separate them.** Trims appear in slots 2–11, mixed in with
  yarns. Only the name prefix does.
- **A percentage nearly does.** A yarn line carries one 7,667 times out of
  7,716 (99.4%); a trim line carries one 165 times out of 745 (22%). Strong,
  not reliable. (Measured over the `XZIP`/`XB`/`STAMP` prefixes only, so the
  15 unclassified rows are counted as yarn in those two figures.)

### This is not obviously a bug to fix

A zip is dyed to match the colourway, so recording it per colourway — which
is what the BOM does — may be more right than `style_trims`, which hangs off
the style and cannot say which colour. Before moving anything, somebody who
knows the costing should say which of the two is meant to be the record.

**Decide this before the split**, because it changes whether `colors` holds
`PEARL` and `BRONZE` alongside `SCANDIA BLUE`, and whether `materials` grows
81 zip rows.

---

## 6. The migration, in order

Each step is independently revertible and leaves the app working.

**0026 — `colors`, and `color_id` on the pairing**
Create `colors` (`id`, `name` unique, `family` nullable). Add
`yarn_colors.color_id` nullable. Nothing reads it yet.

**0027 — backfill**
Populate `materials` from the eight prefixes, `colors` from the 296 distinct
colour names, and set `material_id`, `color_id` and `color_code` on every
yarn row from the parse in §3. Trims keep `material_id = NULL` until §5 is
answered. `name` is left untouched, so everything that reads it still works.

**0028 — merge the duplicates**
Repoint the 20 safe BOM lines per §4. The other 84 wait on `YCA BLACK B`. Record each merge in `name_history` with a new `scope`
(`'yarn_color'` — the CHECK constraint allows only `'style'` and `'colorway'`
today) so an old name stays findable. Delete the losing rows only after the
repoint is verified by count.

**0029 — make `name` derived**
Once nothing reads `yarn_colors.name` directly, drop it or make it a
generated column from material + colour + code. This is the step that stops
the problem coming back; the four before it only clean up what is there.

`yarn_codes()` in `repo.py` currently derives the code from the name prefix
with a note saying the prefix column "exists but was never populated". That
function becomes a one-line select off `materials` at step 0027 and should be
changed then, not before.

---

## 7. What this plan does not decide

- Whether `1708` and `1708 B` are one yarn (§4).
- Whether trims belong in the BOM or in `style_trims` (§5).
- Whether `colors` should carry a hex or swatch. The workbook has
  `SOLID SWATCH SENT TO CYBIL` as a yes/no, not a colour value, so there is
  nothing to import — but it is the natural home if one is ever wanted.
- What `COLOR FAMILY` can contain. The column exists in the workbook and is
  empty in every row sampled.
