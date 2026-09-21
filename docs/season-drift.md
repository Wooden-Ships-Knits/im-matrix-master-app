# What changes between seasons

**Created 2026-09-21.** Compares the IM workbooks season to season.

Read: `Copy of S26 IM MASTER.xlsx`, `F26 IM MASTER.xlsx` (the live copy),
`Copy of S27 IM MASTER.xlsx`, plus the `f25 price` sheet embedded inside F26.

> **There is no F25 IM file** anywhere on the drive — the only full workbooks are
> S26, F26 and S27. But they are three consecutive seasons (56 → 57 → 58), and
> F25 prices survive inside F26 as a lookup sheet (§5), so F26 vs F25 is
> answerable for prices.

---

## 1. Headline

**The columns barely change. Their positions change completely.**

Between S26 and S27 — the same season type, one year apart — 251 of ~254
headers are identical. Three were dropped, four added. But only **7 (3%)** are
still in the same column.

That is the whole argument for the database in one line: the *information* is
stable, the *spreadsheet* is not.

---

## 2. Structure

| | S26 | F26 | S27 |
|---|---|---|---|
| Season number | 56 | 57 | 58 |
| Header row | 57 | **54** | 57 |
| Columns | 254 | 236 | 255 |
| Data rows | 4,114 | 4,684 | 3,779 |
| Styles | 270 | 311 | 222 |
| Banner rows | 22 | 19 | 18 |

### Column kinds — near-identical every season

| Kind | S26 | F26 | S27 |
|---|---|---|---|
| **Formula** | **88** | **88** | **88** |
| Colour slots | 63 | 54 | 63 |
| Typed input | 37 | 38 | 35 |
| Empty | 32 | 31 | 38 |
| Constant all season | 34 | 25 | 31 |

Exactly 88 calculated columns in all three seasons. The model behind the sheet
is not drifting at all — which is what makes it safe to reimplement.

---

## 3. Position churn

| Comparison | Shared headers | Still in the same column |
|---|---|---|
| S26 → F26 | 203 | 7 (3%) |
| F26 → S27 | 201 | 11 (5%) |
| **S26 → S27** (same type, 1 yr) | **251** | **7 (3%)** |
| S27 May → S27 Aug (*same file*) | 254 | 7 — 247 moved in 3 months |

Column letters are unusable as an identifier at every timescale, including
within a single season. Header *text* is nearly stable, so a name-based import
works — provided it also handles §4.

---

## 4. Spring and Fall are two different templates

This is the real structure behind the "seasons differ" finding. It is not
arbitrary per-season variation — **there is a Spring layout and a Fall layout**,
and each is stable year over year.

**In both Springs, absent from Fall (32 columns):**

| Group | Columns |
|---|---|
| Distributor pricing | `FOB DIVERSE GROUP` · `DIVERSE % DISCOUNT` · `EUROPEAN DISTRIBUTOR- EFSN` · `EUROPEAN DISTRIBUTOR % DISCOUNT` · `FOB ELLIS` · `ELLIS % DISCOUNT` |
| Bali / sea | `MARGIN FOB BALI` · `SEA MARGIN LINE PRICE` · `SEA MARGIN REPS (COMMISSION)` |
| The SY price block | `FINAL RETAIL PRICE #2` · `FINAL MARK UP #2` |
| Duty & freight naming | `DUTY RATE` · `DUTY TO USA (WHS 000)` · `DHL AIR FRT / ITEM` · `DHL VOLUMETRIC AIR FRT / ITEM` |
| Other | **`NEED MAL?` (the size column)** · `REPS COLOR?` · `PRICE FINAL FROM PB?` · `EXTRA CHARGES - BOXES` |

**In Fall only (31 columns):**

| Group | Columns |
|---|---|
| Canada | `DUTY TO CANADA` · `CANADA LANDED VOLUMETRIC AIR COST` · `CANADA WHLS LINE PRICE AFTER DEDUCTED REPS COMMISSION` · `FEDEX CANADA VOLUMETRIC AIR FRT / ITEM` · `LANDED VOLUMETRIC AIR COST VARIANCE B/W US AND CN` |
| USA naming | `DUTY RATE TO USA` · `DUTY TO USA` · `DHL AIR FRT / ITEM -USA` · `USA WHLS LINE PRICE AFTER DEDUCTED REPS COMMISSION` · `SEA MARGIN WHLS LINE PRICE - USA` |
| Prices | `FINAL SALE PRICE` · `FINAL MARK UP FROM WHLS LINE PRICE` |
| Other | `CC-M` · `CATEGORY` · `EMBRO/STAMP` · `PERLU MALL?` · `PLASTIC WT, HANG TAG, DHL FLYER, STC` |

### ⚠️ This corrects an earlier conclusion

`schema.md` §9.1 records that **F26 has no size column** while S27 does, and
treats it as a quirk. It isn't. **`NEED MAL?` is a Spring-template column** —
present in S26 *and* S27, absent from Fall. So:

- Importing a **Spring** season: size is a real column.
- Importing a **Fall** season: size must come from the `DESCRIPTION` suffix.

That is a rule, not an accident, and an importer can rely on it.

Likewise the markets: **Spring sells to Diverse / EFSN / Ellis with a separate
SY retail; Fall sells to USA / Canada with a sale price.** `markets` is
therefore keyed by season, but its *content* follows the season type — which is
predictable rather than arbitrary.

---

## 5. F26 vs F25 — prices only

F25 has no IM workbook, but F26 carries an `f25 price` sheet: **154 product
codes** with collection, product code, item name, colour, wholesale and retail.

The codes are `K55…` — and 2 × 25 + 5 = **55**, a third confirmation of the
season-number rule.

**53 styles share a name between F25 and F26.** Of those with a comparable
wholesale price:

| | Count |
|---|---|
| Price unchanged | 7 |
| **Price changed** | **37** |

| Style | F25 | F26 |
|---|---|---|
| Hathaway Crew Cotton | `K55C3W537` $62 | `K57C3W537` $64 |
| Mia 3/4 Sleeve Top Cotton | `K55C2W567` $62 | `K57C2W567` $66 |
| Perfect Tee Cotton | `K55C3W338` $48 | `K57C3W338` $50 |
| Jane Button Cardi Chunky | `K55Y3W552` $66 | `K57Y3W552` $68 |
| Canyon Tipped Raglan Crew Chunky | `K55Y3W524` $66 | `K57Y3W524` $65 |
| **Faye Tipped Top Cotton** | `K55C4W535` $65 | **`K57C4W193`** $68 |

Two things worth noting:

1. **Carry-over styles usually keep their number** — `537 → 537`, `567 → 567`.
   Only the season digits change. That makes the number a useful *hint* for
   matching, even though it isn't reliable enough to be a key (`schema.md` §4.2).
2. **Faye is the counter-example** — same name, `535 → 193`. Which is exactly why
   identity has to be its own id.

**Prices are re-set every season**, almost always upward by $1–$4. So a
carry-over should copy last season's price as a *starting point*, never as a
fixed value.

---

## 6. Collections churn, and carry working notes

| Season | Collections |
|---|---|
| S26 | Essentials · Lightweight · Love · Fresh Start · Transition · Lucky · Blossom · Easter · Cinco · Lake · Spring Days · Beach · Americana · Summer · Game Day · WS Collection · Special & Custom Order · Cancel Style |
| F26 | Winter Beach · Essentials · Game Day · Fall Babe · Spooky · Cozy · Thanksgiving · Fall · Christmas · Ski Snow · Luxe · WS Collection · Special Order |
| S27 | Essentials · Spring One · Spring Days · Easter · Sail Away · Spring Two · Americana · Beach · Summer · Game Day · WS Collection |

Even between two Springs the list changes a lot — S26's Love, Fresh Start,
Transition, Lucky, Blossom, Cinco and Lake are gone; S27 adds Spring One,
Spring Two and Sail Away. Only a core survives: **Essentials, Beach, Americana,
Summer, Game Day, Spring Days, Easter, WS Collection**.

⚠️ **S26's banner labels carry working notes**: `ESSENTIALS - OK upload`,
`BEACH - OK upload SF`, `SPRING DAYS - OK uploa`, `TRANSITION - bisa uplo`. The
collection name and a status have been typed into one cell. On import these must
be split — otherwise "Essentials" exists three times under three spellings.

---

## 7. What this means for the build

1. **The model is stable — reimplement with confidence.** 88 calculated columns,
   season after season.
2. **Import by header name, never by letter or position**, and locate the header
   row by scanning (54 or 57 so far).
3. **Branch the importer on season type, not season.** Spring has a size column
   and distributor pricing; Fall has Canada and a sale price.
4. **Carry-over should pre-fill, not freeze.** Prices change most seasons.
5. **Clean collection names on import** — strip the appended status notes.
6. **`markets` content follows the season type**, so a new season can be
   scaffolded from the previous same-type season rather than from scratch.
