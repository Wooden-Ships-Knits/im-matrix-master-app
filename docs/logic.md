# IM Master — Domain Logic

> **Status: partly provisional.** The rules below are written from the old app's
> schema and the S27 Excel. Several are marked **UNCONFIRMED** — they describe
> what the data appears to require, not what anyone has confirmed the factory
> actually requires. Each one is a question for Phase 0, and each is repeated in
> `caveats.md`.
>
> A rule that is guessed and enforced is worse than a rule that is absent: it
> blocks a legitimate style at 4pm and the workaround becomes permanent.

---

## 1. What a style is

The aggregate root. One row in `styles`, plus everything that hangs off it.

```
Style ── "AMERICAN DREAM CREW CHUNKY COTTON", season S28
  │
  ├── comes in sizes            X/S · S · M · L · X/L
  │     └── each with a finished weight in kg
  │
  ├── has colorways             "NATURAL / CAMEL", "BLACK / IVORY"
  │     └── each with a yarn BOM   40% merino, 2 ends
  │                                60% cotton, 1 end
  │
  ├── has one set of knit details, prices, packaging, shipping
  │
  └── has measurements          point × size → cm
```

Two structural facts that the Excel layout hides and that everything else
depends on:

1. **The BOM belongs to the colorway, not the style.** Different colorways use
   different yarns — that is what makes them different colorways.
2. **The BOM does not vary by size.** Composition is constant across the size
   run; only finished weight changes. If this is ever false for a real style,
   the schema is wrong and Phase 0 needs to know. **UNCONFIRMED.**

---

## 2. Validation rules

What the API refuses to save. Implemented in `backend/im_master/validation.py`,
enforced server-side regardless of what the form checks (`backend.md` §7).

### 2.1 Identity

| Rule | Status |
|---|---|
| Season is required and comes from the season reference list | firm |
| Style name is required, non-empty after trimming | firm |
| Style name is unique **within a season** | **UNCONFIRMED** — see below |
| Collection and sub group are optional, from reference lists | firm |
| Status is `draft` or `active`; new styles default to `draft` | firm |

**On name uniqueness.** Two styles with the same name in one season is almost
certainly an error — but "almost certainly" is not a constraint. If it can
legitimately happen, this must be a warning, not a rejection. Ask before enforcing.

### 2.2 Sizes

- A style must have **at least one size**. A style nobody can make is not a style.
- Sizes come from the size reference list — free-typed sizes would break the
  measurement grid's columns.
- Finished weight per size, if entered, must be **> 0**. Zero is not a weight,
  it is an empty cell someone tabbed through.
- **UNCONFIRMED:** is weight required to save, or can a style be entered before
  the sample is weighed? Almost certainly the latter — which means optional.

### 2.3 Colorways and BOM

- A style may be saved with **zero colorways** while it is a `draft`. An `active`
  style needs at least one. **UNCONFIRMED** — this is the natural reading of
  draft/active, but confirm it matches how styles are actually entered.
- Colorway names are unique within a style.
- Each BOM line: a yarn (reference list), a percentage, a number of ends.
- **Percentages within one colorway must total 100.** The one rule the
  spreadsheet could not enforce and the one most worth having.
  - Tolerance: **UNCONFIRMED.** Exactly 100, or 100 ± 0.5 to allow rounding on
    a four-yarn blend? Ask. Then apply the answer consistently — a tolerance
    that varies by who entered the data is not a rule.
- Ends is a positive integer.
- The same yarn twice in one colorway: **UNCONFIRMED.** It may be legitimate
  (same yarn at different ends) or always an error. Do not block it until
  someone says it is wrong.

### 2.4 Measurements

- Values are per (style, size, point), in cm.
- Only for sizes the style actually comes in. Unticking a size in the editor
  orphans its column — **warn and confirm before discarding**, do not silently
  delete data someone typed.
- Sparse is fine. Not every point applies to every garment, and a half-filled
  grid is a normal work-in-progress state.
- Values must be **> 0** where present.
- **UNCONFIRMED:** is the point-of-measure list fixed per garment type, or free
  per style? This decides whether points are a reference table or free text, and
  it is a Phase 0 schema question, not a validation detail.

### 2.5 Prices

The old app carried five prices plus one that was always empty:

| Field | S27 Excel column | Meaning |
|---|---|---|
| Wholesale | `IC` | WHLS LINE PRICE |
| Retail | `IT` | FINAL RETAIL PRICE |
| SY Price | `JC` | FINAL RETAIL PRICE, SY block |
| 000 Price | `HR` | WHLS FOB BALI |
| Sample | `IX` | FINAL SAMPLE PRICE |
| SY Sale | — | no Excel source; always empty |

Rules:

- All prices optional — pricing lands after the style exists.
- Where present, **≥ 0**.
- Currency is **UNCONFIRMED**. The old app stored bare numbers with no unit. If
  wholesale is USD and something else is IDR, storing them in one untyped column
  is a bug waiting to be discovered by someone doing arithmetic across them.
  **Settle this in Phase 0.**
- **Carry `SY Sale` forward only if someone wants it.** Starting empty is the
  moment to drop a field that was always blank. Ask; do not inherit it by default.
- No derived prices in v1 (`prd.md` §4). Stored as entered.

### 2.6 Concurrency

A style is saved whole against the version it was read at. If it changed
underneath, the save is refused with **409** and the user is told
(`backend.md` §6, `frontend.md` §4). Not a data rule, but it is a correctness
rule and it belongs with them.

---

## 3. Reference lists

Seasons, sizes, yarns, collections, sub groups, packing methods.

- **Self-teaching**: a value typed once is saved and offered next time
  (`backend.md` §4).
- **Matched normalized** — case- and whitespace-insensitive — so `Merino`,
  `merino ` and `MERINO` are one entry, not three.
- **Additive only.** A new value never renames or removes an existing one.
- **Never auto-deleted**, even when nothing references them. A yarn used only by
  a style that was deleted stays available; someone will type it again next season.

**Sizes are the exception: not free-form.** They are the columns of the
measurement grid and the rows of the weight table. A free-typed `Med` next to an
existing `M` produces a style whose data cannot be compared with any other.
Adding a size should be a deliberate admin action.

---

## 4. Search

`GET /api/styles` filters by season, style name (partial, case-insensitive),
colorway, size, and status.

- Filters **AND** together.
- Name matching is substring and case-insensitive — nobody remembers the exact
  capitalisation of a style name.
- Default sort: season descending, then style name. Current season first,
  because that is what is being worked on.
- **Draft styles appear** in browse, visibly marked. Hiding them means someone
  re-enters a style that already exists as a half-finished draft.

---

## 5. What is deliberately absent

- **No cost roll-up.** BOM percentages × yarn prices × weight would give a
  material cost, and it is tempting. It is also a costing system, it needs yarn
  prices we do not hold, and a wrong number here reaches a customer quote.
  Out of scope for v1 (`prd.md` §4).
- **No size grading.** Deriving a size run from a base size and a grade rule is
  real and useful; it needs grading rules that live in someone's head today.
  Later, if asked for.
- **No SKU generation.** The old app carried a SKU per (colorway, size). Whether
  it is composed from style/colour/size by a rule, or assigned externally, is
  **UNCONFIRMED** — and generating SKUs against the wrong rule creates identifiers
  that other systems will refuse. Store what is entered until the rule is known.

---

## 6. Open — the Phase 0 list

Every **UNCONFIRMED** above, collected. These are what Phase 0 exists to answer,
and none of them should be enforced in code until they are.

1. Can a BOM ever vary by size? (§1)
2. Is style name unique within a season — hard rule or warning? (§2.1)
3. Is finished weight required to save? (§2.2)
4. Can an active style have no colorways? (§2.3)
5. BOM percentage tolerance — exactly 100, or ±0.5? (§2.3)
6. Is the same yarn twice in one colorway legitimate? (§2.3)
7. Is the point-of-measure list fixed per garment type or free per style? (§2.4)
8. What currency is each price in? (§2.5)
9. Keep `SY Sale`, or drop it? (§2.5)
10. Is SKU composed by a rule, or assigned externally? (§5)
11. Which fields are required to save at all? (`prd.md` open question 4)
