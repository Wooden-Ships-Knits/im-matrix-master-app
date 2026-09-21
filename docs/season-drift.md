# What changes between seasons

**Created 2026-09-21.** Four consecutive IM workbooks, compared with one method.

| Season | Number | File |
|---|---|---|
| F25 · Fall 2025 | 55 | `PTIF SERVER/Collection/25 FALL/IM/F25 IM MASTER.xlsx` |
| S26 · Spring 2026 | 56 | `IM to Sales Force/ex/Copy of S26 IM MASTER.xlsx` |
| F26 · Fall 2026 | 57 | `im-master-app/F26 IM MASTER.xlsx` (live copy) |
| S27 · Spring 2027 | 58 | `im-to-sales-force/Input/Copy of S27 IM MASTER.xlsx` |

---

## 1. Headline

**The columns barely change. Their positions change completely.**

Between S26 and S27 — same season type, one year apart — 251 of ~254 headers are
identical: three dropped, four added. But only **7 (3%)** are still in the same
column.

The *information* is stable. The *spreadsheet* is not.

---

## 2. Structure

| | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| Season number | 55 | 56 | 57 | 58 |
| **Header row** | **61** | **57** | **54** | **57** |
| Columns | 259 | 254 | 236 | 255 |
| Data rows | 5,193 | 4,114 | 4,684 | 3,779 |
| Styles | 325 | 270 | 311 | 222 |
| Banner rows | 24 | 22 | 19 | 18 |

The header row has been **four different rows in four seasons**. Any importer
must find it by scanning, never by a constant. (`im-to-sales-force` hardcodes
`header_row=56`.)

### Column kinds

| Kind | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| Formula | **94** | 88 | 88 | 88 |
| Colour slots | 54 | 63 | 54 | 63 |
| Typed input | **54** | 37 | 38 | 35 |
| Empty | 24 | 32 | 31 | 38 |
| Constant all season | 33 | 34 | 25 | 31 |

**F25 was the messy one.** 54 typed columns and 94 formulas; from S26 onward it
settles at ~36 typed and exactly **88 formulas, three seasons running**. The
model behind the sheet stopped moving two years ago — which is what makes it
safe to reimplement.

---

## 3. Position churn

| Comparison | Shared headers | Same column | Dropped | Added |
|---|---|---|---|---|
| F25 → F26 *(Fall → Fall)* | 226 | 8 (4%) | 33 | 10 |
| **S26 → S27** *(Spring → Spring)* | **251** | **7 (3%)** | **3** | **4** |
| F25 → S26 | 217 | 9 (4%) | 42 | 37 |
| S26 → F26 | 203 | 7 (3%) | 51 | 33 |
| F26 → S27 | 201 | 11 (5%) | 35 | 54 |
| S27 May → S27 Aug *(same file, 3 months)* | 254 | 7 | 1 | 1 |

**200 headers are common to all four seasons.** Column letters are useless as an
identifier at every timescale — including inside a single season, where 247 of
254 headers moved in three months.

---

## 4. Is there a Spring template and a Fall template?

Partly. Two things really do follow the season type:

| | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| **Canada columns** | **8** | 0 | **7** | 0 |
| **Colour slots** | 18 | **21** | 18 | **21** |

Canada is a Fall concern in both Falls and absent from both Springs. Fall carries
18 yarn slots, Spring 21. Those are template rules an importer can rely on.

**But F26 is an outlier on two counts** that are *not* template rules:

| | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| Distributor pricing (Diverse / EFSN / Ellis) | 4 | 6 | **0** | 6 |
| Margin columns | **25** | 13 | **10** | 12 |

F26 dropped the distributors entirely and cut the margin columns from 25 (F25)
to 10. It is also the shortest sheet, 236 columns against 254–259. F26 looks like
a deliberate clean-up that the Springs did not follow.

### ⚠️ The size column — correcting an earlier note

`schema.md` §9.1 says F26 has no size column while S27 does, and an earlier
version of this document explained that as a Spring/Fall rule. **Both are wrong.**

| Season | Column | Fill |
|---|---|---|
| F25 | `SIZE` (M) | **98.1 %** |
| S26 | `NEED MAL?` (N) | **99.3 %** |
| F26 | `PERLU MALL?` (P) | **0.2 %** |
| S27 | `NEED MAL?` (O) | **99.9 %** |

**Three of four seasons record the size. F26 is the only one that doesn't.**

The history is visible in F25, which has *both* `SIZE` (98%) and `PERLU MALL?`
(1.7%) — two different fields. From S26 the dedicated `SIZE` column was dropped
and the size was typed into the `NEED MAL?` / `PERLU MALL?` column instead. In
F26, nobody filled it.

So this is **a data-quality regression, not a template difference** — and exactly
the kind of silent loss a required field prevents.

---

## 5. F25 → F26, the Fall-to-Fall year

**33 columns dropped, 10 added.** Most of the drop is cleanup of duplicated
margin columns — F25 carried `DHL VOL AIR MARGIN RETAIL PRICE - 1 PCS…` five
times over, and `VOL AIR MARGIN RETAIL PRICE - 2 PCS` three times.

Also gone after F25:

- `SIZE` (§4)
- `WHLS LINE PRICE - USA + $2 SURCHARGE FEE` → plain `WHLS LINE PRICE - USA`.
  **The $2 surcharge was built into a column heading**, and removing it changed
  what the price means.
- `SUGGESTED RETAIL PRICE (MULTIPLE BY 2.25)` and `(BY 2.3)` — F26 keeps only 2.2
- `FEDEX AIR FRT / ITEM - CANADA` → renamed `FEDEX CANADA VOLUMETRIC AIR FRT / ITEM`

Added in F26: `FINAL SALE PRICE`, `DHL AIR FRT / ITEM -USA`, and two margin columns.

### Carry-over and prices

| | |
|---|---|
| Styles sharing a name, F25 → F26 | **116** (37% of F26's range) |
| Of those, **same style #** | **102** |
| **Renumbered** | **14** (12%) |
| Wholesale price unchanged | 9 |
| **Increased** | **50** |
| Decreased | 3 |

| Style | F25 | F26 |
|---|---|---|
| Hathaway Crew Cotton | #537 $62 | #537 $64 |
| Perfect Tee Cotton | #338 $48 | #338 $50 |
| Eryn Cardigan Cotton | #838 $66 | #838 $68 |
| **Faye Tipped Top Cotton** | #535 $65 | **#193** $68 |

Carry-over styles usually keep their number, so the number is a good *hint* for
matching — but Faye renumbering while keeping its name is why identity still
needs its own id (`schema.md` §4.2).

**Prices are re-set nearly every season**, almost always up $1–$4. A carry-over
should copy last season's price as a starting point, never as a fixed value.

For comparison, Spring to Spring (S26 → S27): 91 numbers appear in both, and 27
of them (30%) carry a different name.

---

## 6. Collections churn, and carry working notes

| Season | Collections |
|---|---|
| S26 | Essentials · Lightweight · Love · Fresh Start · Transition · Lucky · Blossom · Easter · Cinco · Lake · Spring Days · Beach · Americana · Summer · Game Day · WS Collection · Special & Custom · Cancel Style |
| F26 | Winter Beach · Essentials · Game Day · Fall Babe · Spooky · Cozy · Thanksgiving · Fall · Christmas · Ski Snow · Luxe · WS Collection · Special Order |
| S27 | Essentials · Spring One · Spring Days · Easter · Sail Away · Spring Two · Americana · Beach · Summer · Game Day · WS Collection |

Even Spring to Spring the list turns over: S26's Love, Fresh Start, Transition,
Lucky, Blossom, Cinco and Lake are gone; S27 adds Spring One, Spring Two and Sail
Away. Only a core survives — **Essentials, Beach, Americana, Summer, Game Day,
Spring Days, Easter, WS Collection**.

⚠️ **S26's banner labels have working notes typed into them**:
`ESSENTIALS - OK upload`, `BEACH - OK upload SF`, `SPRING DAYS - OK uploa`,
`TRANSITION - bisa uplo`. Name and status share one cell, so on import they must
be split — otherwise Essentials exists under three spellings.

---

## 7. What this means for the build

1. **The model is stable — reimplement with confidence.** 88 formula columns,
   three seasons running.
2. **Find the header row by scanning.** It has been 54, 57, 57 and 61.
3. **Map by header name, never by letter.** 200 headers are common to all four
   seasons; almost none stay in place.
4. **Two template rules are reliable:** Canada appears in Fall only, and Fall
   carries 18 colour slots to Spring's 21.
5. **Don't over-generalise from F26.** Its missing size column and dropped
   distributors are F26's own choices, not Fall behaviour.
6. **Make size required.** Three seasons recorded it; one lost it silently.
7. **Watch for meaning hidden in headings** — the `+ $2 surcharge fee` in F25's
   price column is a business rule living in a label.
8. **Carry-over pre-fills, never freezes.** ~37% of a Fall range carries over,
   most keep their number, and most change price.
9. **Clean collection names on import** — strip the appended status notes.
