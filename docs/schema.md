# IM Master — Database Schema (v2)

**Revised 2026-09-19** from the live `F26 IM MASTER.xlsx` (Google Sheets export
saved into this folder today). Replaces v1, which is in git history
(`b8fb22f`, `6223a89`).

> **Proposal — nothing is built.** §8 lists what needs a yes before the
> migration is written.

---

## 1. What changed, in one paragraph

v1 treated every spreadsheet column as something to store: 176 columns. This
time I read which cells are **formulas** (the xlsx records them), and the answer
reshapes everything: of F26's 236 columns, **88 are formulas, 31 are empty and
25 hold one value for the entire season**. Only **38 are genuinely typed per
style**, plus the yarn lines. The formulas are all simple arithmetic over those
inputs and about 35 rate cells kept in rows 51–53. So the efficient design is:
**store the inputs, keep the rates in one place, and compute the rest.**

This **reverses my earlier recommendation** (`columns.md` §8.1, "store formula
results as entered"). That advice was made without seeing the formulas. Storing
88 computed values per row would mean staff retype them or they go stale the
moment an exchange rate changes.

---

## 2. What the live F26 file contains

| | New (today) | Old copy (May) |
|---|---|---|
| Sheet extent | `A1:IO4766` | `A1:II8438` |
| Header row | 54 | 54 |
| Data rows | **4,684** | 8,342 |
| Styles | **311** | ~416 |
| Banner rows (collections) | 19 | 25 |
| Rows per style (avg) | 15.1 | — |

### 2.1 The 236 columns, by what they really are

| Kind | Count | Examples | Where it goes |
|---|---|---|---|
| **Formula** | 88 | tolerances, gross kg/box, every labour cost, total cost, duty, freight, landed costs, margins | **computed** in a view — §5 |
| **Colour slots** | 54 | `C1Y%`, `C1 ENDS`, `COLOR1` … C18 | `colorway_yarns` rows |
| **Typed input** | 38 | content, gauge, #, description, pcs/box, box dims, admin %, line price, retail, sale | the style tables — §4 |
| **Empty** | 31 | label captions, worker-name columns, `LOGO LABEL` | dropped |
| **Constant all season** | 25 | `CONSTRUCTION`=MACHINE KNIT, `TENSION`=LIHAT POLA, `SPEC`, `HANG TAG`, `BAGGING`, `PACKING METHOD`, `SHIP VIA`, `BOX LABELING`, plastic wt 0.06 | `seasons` defaults — typed once, never per style |

### 2.2 The calculation chain (decoded from the formulas)

```
TYPED PER STYLE                    SEASON RATES (rows 51-53)        COMPUTED
───────────────                    ─────────────────────────        ────────
weight per size (CE, CJ) ───────┬─ × 0.96 / × 1.04 ─────────────▶  low/high tolerance
                                ├─ + 0.009 × 1.04 ──────────────▶  distribution / pricing wt
                                └─ × material price per kg ─────▶  raw material cost
knit minutes (CO) ──────────────── ÷ 60 × 35,061 IDR/h × 1.6 ───▶  knitting cost
minutes per operation ──────────── ÷ 60 × 35,061 IDR/h × 1.6 ───▶  link, QC, steam, finishing …
                                                                    ↓ sum ÷ 16,000 IDR/USD
admin % ────────────────────────── × 24,000 + 10,000 + 2,727 ───▶  TOTAL ALL COSTS (USD)
box type + pcs/box ─────────────── volumetric ÷ 5,000; ÷ 29.7M cm³▶  gross kg/box, vol kg, sea share
content code → duty category ───── × 0.29 / 0.285, +2%, +0.35% ─▶  duty USA / Canada
                                   × 13.91 / 23.04 USD per kg ──▶  DHL / FedEx freight
                                                                    ↓ sum
                                                                    6 landed costs
USA line price (HG) ────────────── × 0.88 commission, × 2.2 ────▶  Canada price, retail, 8 margins
```

Every arrow is a formula I read out of the file; §5 lists them.

### 2.3 Lookups hiding in plain sight

- **Content code decides duty, completely.** `Y`, `YPE`, `YE`, `YP`, `PB`, `P` → duty
  category **446** (grassy, 29%); `C`, `CPE`, `CE`, `CP`, `A` → **345** (cotton,
  28.5%). No exceptions in any row that has a duty category (32 rows carry `0`).
  One choice replaces 9 duty columns.
- **Boxes are a short list.** Rows 51–53 define `DHL 6` 41.7×35.9×36.9 cm /
  1.32 kg empty, `DHL 7` 48×41×39 / 1.6 kg and `DHL 8` 54.1×44.4×40.9 / 1.9 kg.
  The data uses DHL 6 (3,643 rows), DHL 7 (984) and an unnamed 43×37×37 (24);
  DHL 8 is unused. One choice replaces 8 box columns — but see §7 on empty-box
  weight, which the sheet does **not** take from the box.
- **Rows 1–32 are a materials price list**: yarns (`NEW GRASSY` code YST,
  `SMALL COTTON` AC, `COTTON ACRYLIC` CA, `TX`, `POODLE` YP), zippers
  (`XZIPAB` 30–80 cm) and buttons (`XBP…`), each with IDR price incl. 10% tax
  and USD price after the 5% VAT-refund reduction. The raw-material formula
  picks a row by *pointing at it* (`$FA$2`, `$FA$6` …) — an invisible choice
  that becomes an explicit foreign key.
- **Yarn colours carry their material in the prefix**: `YST …` (97 colours),
  `YCA …` (63), `YAC …`, `YP …` — matching the material codes above.
- **The style code is computed**: an unlabelled column `I` is
  `CONCATENATE(CAT, SEASON, CONTENT, GAUGE, STYLE, #)` → e.g. `K57Y2W653`. That
  is also why `CAT`, `SEASON` and `STYLE` are constants: they are code
  components, not attributes.
- **Care label = base + size code**: `XBIG76A12M12W …-XS / -SM / -ML / -XL`.
  Store the base once; the four labels are derived.
- **Operations are minutes × one hourly rate.** Every labour column is
  `(minutes ÷ 60) × 35,061.30 × 1.6`. Only the minutes differ per style, and
  most styles use the standard minutes (cek pola 16, link 26, QC link 5,
  finishing 23, steam 6, QC pre 6, QC final 5 …).

---

## 3. The shape

```
SEASON SETUP — filled once per season, by one person          ~11 small tables
  seasons ─┬─ season_rates        the ~35 numbers in rows 51-53
           ├─ collections         ESSENTIALS, GAME DAY, SPOOKY … (banner rows)
           ├─ materials           yarns + zippers + buttons, with prices
           ├─ duty_categories     345 / 446
           └─ markets             USA, CANADA (S27 had others)
  content_codes → duty_categories
  box_types                        DHL 6 / 7 / 8
  yarn_colors → materials          YCA BREAKER WHITE - 658 …
  operations                       LINK, QC LINK, STEAM … with standard minutes
  sizes                            X/S · S/M · M/L · X/L

STYLE DATA — what staff type                                   8 tables
  styles ─┬─ style_sizes           weight + pcs/box per size
          ├─ style_colorways ── colorway_yarns
          ├─ style_operations      only where minutes differ from standard
          ├─ style_trims           zippers, buttons, stamp
          ├─ style_market_prices   only where a market price is overridden
          └─ style_measurements    point-of-measure (PRD; not in the sheet)

COMPUTED — no storage                                          3 views
  v_sku_costing        one row per style × size × colorway = one IM MASTER row
  v_im_export          the same, in IM MASTER column order, for sending the IM
  v_salesforce_export  Salesforce API field names — the CSV feed, §10
```

---

## 4. Tables and columns

Types: money in IDR is `numeric(14,2)`, USD `numeric(12,4)` (the sheet carries
4 dp), weights `numeric(8,4)`, rates `numeric(10,6)`. `snake_case` throughout.

### 4.0 Keys — one rule for every table

**Every table has its own primary key:**

```sql
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY
```

The database assigns it, nobody types it, it never changes and it means nothing.
**Every foreign key points at an `id`** — never at a style name, `#`, style
code, SKU, colour name or lookup code.

Everything people *read* as an identifier is an ordinary column: editable,
indexed for search, and `UNIQUE` only where the data proves it is safe.

**Why this matters here specifically.** Every business identifier in the sheet
has already changed or collided:

| Identifier | Problem in the live F26 |
|---|---|
| Style name | Suffixes vary (`- X/S - 000 ONLY - FAH`); typos get corrected |
| `#` | `#99` is two styles; five styles have two numbers (§4.2) |
| Style code / SKU (`K57Y2W653`) | Built from content + gauge + `#`, so it changes whenever any of those is corrected |
| Colour name | Free text, re-spelled between seasons |

With a surrogate key, renumbering `AUTUMN LEAF` from 646 to 980, fixing a name,
or regenerating the style code is **one `UPDATE` on one row**. Sizes, colorways,
yarns, operations and prices keep pointing at the same `id`. With a natural key
the same change has to cascade through every child table, or it breaks them.

**`bigint`, not UUID.** Smaller, faster, and readable — "style 1042" in a log or a
conversation. UUIDs earn their cost when IDs must be created outside the
database (offline entry, merging two databases); neither applies here.

**A reference staff can quote.** The UI shows the id as **`IM-1042`**, so there is
a stable way to say "that style" even while its `#` or name is being fixed. It is
display formatting of `id`, not a stored column.

**Natural identity becomes a constraint, not the key:**

| Table | Unique on | Note |
|---|---|---|
| `styles` | *nothing yet* | plain indexes on `style_number`, `style_name`; see §4.2 |
| `style_sizes` | `(style_id, size_id)` | |
| `style_colorways` | `(style_id, ws_tag_color)` | |
| `colorway_yarns` | `(colorway_id, slot)` | |
| `style_operations` | `(style_id, operation_id, colorway_id)` `NULLS NOT DISTINCT` | Postgres 15+; a NULL colorway means "all colorways" and must not duplicate |
| `style_trims` | `(style_id, material_id)` | |
| `style_market_prices` | `(style_id, market_id)` | |
| `style_measurements` | `(style_id, size_id, point)` | |
| `season_rates` | `(season_id)` | one rate row per season |
| `seasons` | `(code)` | |
| `collections`, `materials`, `markets`, `duty_categories` | `(season_id, code or name)` | per season |
| `sizes`, `content_codes`, `box_types`, `operations` | `(code)` | |
| `yarn_colors` | `(prefix, name, color_code)` | |

`GENERATED ALWAYS` also means an import cannot slip in its own ids by accident —
Postgres rejects a supplied `id` unless the insert deliberately says
`OVERRIDING SYSTEM VALUE`.

### 4.1 Season setup

**`seasons`**

| Column | Type | Source | Note |
|---|---|---|---|
| `id` | bigint identity PK | | §4.0 |
| `code` | text UNIQUE | | `F26`, `S27` — letter + two-digit year |
| `name` | text | | **`Fall 2026`**, **`Spring 2027`** |
| `season_number` | smallint | `SEASON` col B | The company's own running season counter: `57` = F26, `58` = S27, `56` = the season before F26. **Not derivable from `code` or `name`** — and it is a component of the style code (§5), which reaches Salesforce, so it has to be stored. Renamed from `sheet_code`, which wrongly suggested it identified the spreadsheet |
| `starts_on` | date | | for sorting and "current season" |
| `cat_code` | text | `CAT` col A | `K` |
| `style_letter` | text | `STYLE` col E | `W` |
| `default_construction` | text | Q | `MACHINE KNIT` |
| `default_details`, `default_lining` | text | T, U | `X` |
| `default_tension` | text | X | `LIHAT POLA` |
| `default_production_vendor` | text | CM | `WS` |
| `default_spec` | text | DD | `FINAL ST 1&2` |
| `default_hang_tag_instructions` | text | DF | |
| `default_hook_sock_tag` | text | DG | `NO` |
| `default_bagging_method` | text | DH | `MIX BULK PACKING` |
| `default_poly_bag_sticker` | text | DI | |
| `default_packing_method` | text | DJ | `LGHT VAC PACK` |
| `default_ship_via` | text | DL | `SEA OR AIR OK` |
| `default_packing_method_in_box` | text | DM | `FLAT` |
| `default_special_instructions` | text | DN | `AS USUAL. NOTHING SPECIAL` |
| `default_box_labeling` | text | DO | `BARCODED SHIPPING LABEL` |
| `is_current` | boolean | | |

⚠️ **`season_number` is almost, but not quite, per season.** The May copy of S27
had **24 rows carrying `56`** instead of `58` — carry-over styles keeping an
older season number, and therefore an older style code. They are gone from the
August copy. Keep it on `seasons` for now and have the import flag any row whose
number disagrees with its season; if carry-overs turn out to be deliberate, the
fix is a nullable `season_number_override` on `styles`, not a redesign.

Each of these fifteen holds **a single value wherever it is filled** in F26
(66–99% of rows).
None has ever been overridden this season, so there is no per-style column for
them. If a style ever needs a different value, add a nullable override column
then — adding columns is free (see our earlier discussion).

**`season_rates`** — one row per season; replaces rows 51–53

| Column | F26 value | Used by |
|---|---|---|
| `id` | | §4.0 |
| `season_id` | | FK, `UNIQUE` — one rate row per season |
| `exchange_rate_idr_usd` | 16,000 | every IDR→USD step |
| `labour_rate_idr_per_hour` | 35,061.30 | all operations, knitting |
| `labour_multiplier` | 1.6 | all operations |
| `special_op_rate_idr_per_hour` | 5,000 | handknit / embro / rumbai ops |
| `admin_base_idr` | 24,000 | admin = % × base + additional |
| `additional_admin_idr` | 10,000 | |
| `labels_tag_cost_idr` | 2,727 | |
| `packaging_fee_idr` | 5,000 | |
| `box_charge_idr`, `plastic_charge_idr` | 776.16 / 13,000 | extra charges per box |
| `plastic_wt_kg` | 0.06 | gross kg per box |
| `wt_tolerance_low`, `wt_tolerance_high` | 0.96 / 1.04 | tolerances |
| `pricing_wt_factor` | 1.04 | pricing weight |
| `distribution_wt_add_kg` | 0.009 | distribution weight |
| `volumetric_divisor` | 5,000 | volumetric kg |
| `kg_to_lb` | 2.2046 | |
| `container_20ft_cm3` | 29,700,000 | sea share per box |
| `sea_c_rate_usd`, `sea_p_rate_usd` | 10,220.5 / 14,420.5 | sea freight |
| `dhl_usd_per_kg` | 13.91 | DHL air |
| `dhl_grassy_usd_per_kg` | 13.91 | DHL volumetric |
| `fedex_canada_usd_per_kg` | 23.04 | Canada air |
| `disbursement_pct` | 0.02 | duty USA |
| `mpf_pct` | 0.0035 | duty USA |
| `canada_duty_pct` | 0.25 | duty Canada |
| `customs_usd` | 0.10 | landed |
| `outgoing_freight_usd` | 0 | landed |
| `sy_only_dhl_1pc_usd`, `sy_only_dhl_2pc_usd` | 30.15 / 18.11 | SY-only landed |
| `reps_commission_factor` | 0.88 | after-commission prices |
| `retail_markups` `numeric[]` | `{2.2}` | suggested retail — one column per entry. **S27 uses `{2.2, 2.25, 2.3}`** (§9) |
| `target_retail_margin`, `min_retail_margin` | 0.69 / 0.65 | warnings (from notes in row 53) |
| `target_sea_margin` | 0.70 | warnings |
| `min_order_pcs` | 18 | from note in row 53 |

Change the exchange rate here and **every cost for every style recomputes**. In
the sheet that is a fill-down across 4,684 rows and a hope that nothing was
pasted as a value.

**`collections`** — `id`, `season_id`, `name`, `sort_order`.
F26: `ESSENTIALS`, `WINTER BEACH`, `GAME DAY`, `FALL BABE`, `SPOOKY`, `COZY`,
`THANKSGIVING`/`FALL`, `CHRISTMAS`, `SKI SNOW`, `LUXE`, `WS COLLECTION`,
`SPECIAL ORDER & CUSTOM ORDER`. The material banners (`COTTON`, `GRASSY`) and
the material half of `COZY - GRASSY` / `CHRISTMAS COTTON` are **not**
collections — they are derivable from the content code. ⚠️ The first block
(748 rows) is closed by a lone `COTTON` banner with no collection label; by the
S27 pattern it is cotton `ESSENTIALS`. Worth confirming.

**`content_codes`** — `id`, `code` UNIQUE (`Y`, `C`, `YPE`, `CPE`, `YE`, `CE`,
`PB`, `A`, `YP`, `CP`, `P`), `description`, `material_family` (`GRASSY`/`COTTON`),
`duty_category_id`.

**`duty_categories`** — `id`, `season_id`, `code` (345 / 446), `tariff_code`
(`6110.20.2020` / `6110.30.1520`), `usa_duty_rate` (0.285 / 0.29),
`declared_value_usd` (col GD: 21.30 / 21.15).

**`box_types`** — `id`, `code` (`DHL 6/7/8`), `length_cm`, `depth_cm`,
`height_cm`, `empty_box_wt_kg`.

**`materials`** — `id`, `season_id`, `code` (`YST`, `AC`, `CA`, `TX`, `YP`,
`M` …), `name`, `kind` (`yarn`/`zipper`/`button`/`stamp`), `unit`
(`kg`/`pcs`), `exchange_rate`, `price_idr` (incl. 10% tax), `price_usd`
(after 5% VAT-refund reduction).

**`yarn_colors`** — `id`, `material_id`, `prefix` (`YCA`), `name`
(`BREAKER WHITE`), `color_code` (`658`). Unique on (prefix, name, code).
Self-teaching: a colour typed once is offered next time.

**`operations`** — `id`, `code`, `name` (`CEK POLA`, `LINK`, `QC LINK`,
`FINISHING`, `CLEANING YARN`, `SERVICE INTARSIA`, `SOSOK`, `QC FINISHING`,
`LABEL SEWING`, `STEAM`, `QC PRE`, `EMBRO/STAMP`, `CUCI SCREEN`, `JEMUR`,
`QC FINAL`), `default_minutes`, `rate_basis` (`standard`/`special`),
`applies_by_default` (boolean), `sort_order`.

**`sizes`** — `id`, `code` UNIQUE (`X/S`…), `label_suffix` (`XS`, `SM`, `ML`, `XL`),
`sort_order`.

**`markets`** — `id`, `season_id`, `code` (F26: `USA`, `CANADA`; S27: `FOB BALI`,
`DIVERSE`, `EFSN`, `ELLIS`), `pricing_rule`
(`input` / `usa_plus_landed_variance_rounddown`), `commission_factor`.
Kept because S27 priced to Diverse / EFSN / Ellis and F26 to USA / Canada —
markets change between seasons.

### 4.2 Style data — what staff actually type

**`styles`** — one row per style per season

| Column | Type | Source | Note |
|---|---|---|---|
| `id` | bigint identity PK | | §4.0 |
| `season_id` | FK | | |
| `collection_id` | FK | banner rows | |
| `style_number` | integer | `#` F | 100% filled — but **not unique**, see below |
| `style_name` | text | `DESCRIPTION` K | without size / channel suffixes |
| `status` | text | | `draft` / `active` / `hold` / `cancel` |
| `content_code` | FK | C | drives duty and material family |
| `gauge` | **text** | `GAUCE` D | Not numeric — S27 has `2I` alongside 2, 3, 8 (§9) |
| `whs_code` | text | G | `-000` / `-003` |
| `print_placement` | text | `CATEGORY` H | `A (front only)` / `B (back only)` / `C (front & back)` |
| `cc_marker` | text | J | `CC-M` / `CC` / `CC-M - PB` |
| `final_finishing_category` | text | L | `FAF` / `FAH` |
| `total_ends` | text | V | |
| `gauge_detail` | text | W | `3B + 3GG` |
| `care_label_base` | text | R | per-size labels derived |
| `based_body` | text | DT | `Palomina Crew` |
| `material_id` | FK | the `$FA$n` pointer | yarn price used for raw material |
| `box_type_id` | FK | DP/DQ/DR | |
| `knit_minutes_dev` | numeric(8,2) | CO | |
| `knit_minutes_breakdown` | text | CO formula | e.g. `(9*2)+2+(44+8+2.5)+(19+1)+(3+0.5)` — kept for traceability |
| `admin_pct` | numeric(6,4) | `ADMIN %` FX | 6 distinct values |
| `finishing_home_price_idr` | numeric(14,2) | EJ | |
| `finishing_home_minutes` | numeric(8,2) | EK | |
| `embroidery_price_idr` | numeric(14,2) | EO | |
| `embroidery_minutes` | numeric(8,2) | EP | |
**Two price tracks — wholesale and SY — and a style can have either or both.**
See §4.3.

| `whls_line_price_usd` | numeric(12,2) | S27 IC · F26 HG | Wholesale. All wholesale margins key off it. NULL for SY-only styles (724 S27 rows) |
| `whls_retail_price_usd` | numeric(12,2) | S27 IT · F26 HU | Wholesale retail. Typed; default `ROUNDUP(line × markup)` |
| `sy_retail_price_usd` | numeric(12,2) | **S27 JC** | **SY retail — a separate price, not derived from wholesale** |
| `sy_mark_up` | numeric(6,4) | **S27 JD** | Typed, not computed — SY is priced independently |
| `final_sale_price_usd` | numeric(12,2) | F26 HY | NULL where the sheet says N/A |
| `final_sample_price_usd` | numeric(12,2) | S27 IX | S27 has sample and no sale price; F26 the reverse (§9) |
| `similar_repeat_price_note` | text | HL | |
| `photo_url` | text | — | PRD |
| `notes` | text | — | |
| `created_at`, `updated_at` | timestamptz | | |
| `version` | integer | | optimistic locking |

**Key: `id`, per §4.0 — never `style_number`, name or style code.** None of the
three is unique in the live file. `#99` is used by two different styles
(`FOOTBALL BACK ZIP CARDI CHUNKY` and `TUCK CABLE BOYFRIEND CREW CHUNKY`), and
five styles carry two numbers each — `AUTUMN LEAF CREW CHUNKY` (646, 980),
`JAXON FAIR ISLE RAGLAN CHUNKY` (488, 753), `PUMPKIN FAIR ISLE CREW CHUNKY`
(146, 975), `CHIN-CHIN CREW CHUNKY` (183, 978), `WONDERFUL CHRISTMAS CREW CHUNKY`
(635, 747). `style_number` and `style_name` get plain (non-unique) indexes for
search. A `UNIQUE (season_id, style_number)` *validation* can be added once those
six are resolved — but even then it is a data-quality rule, not the key.

**`style_sizes`**

| Column | Type | Source |
|---|---|---|
| `id` | bigint identity PK | §4.0 |
| `style_id` | FK | |
| `size_id` | FK → sizes | DESCRIPTION suffix |
| `pre_component_wt_kg` | numeric(8,4) | CE |
| `finished_wt_kg` | numeric(8,4) | CJ |
| `pcs_per_box` | smallint | DS |

`UNIQUE (style_id, size_id)`. The sheet sometimes grades weights from the base
size (`× 1.1` up, `× 0.92` down) and sometimes types them. Store the weights; let
the UI offer "grade from base size" as a shortcut.

**`style_colorways`**

| Column | Type | Source |
|---|---|---|
| `id` | bigint identity PK | §4.0 |
| `style_id` | FK | |
| `ws_tag_color` | text | CB |
| `whs_channel` | text | CC — `000` / `SY` / `SO` / `CO` / `CN` |
| `reps_color` | boolean | CD |
| `color_sequence` | text | Y — varies by colorway |
| `sell_restriction` | text | N — `NO XL - HEAVY`, `NO - SY - HEAVY` |
| `sort_order` | smallint | |

`UNIQUE (style_id, ws_tag_color)`

**`colorway_yarns`** — `id`, `colorway_id`, `slot` (1–18), `yarn_color_id`,
`percent`, `ends`. `UNIQUE (colorway_id, slot)`. Replaces 54 columns.

**`style_operations`** — `id`, `style_id`, `operation_id`, `minutes`,
`colorway_id` (NULL = all colorways).
`UNIQUE NULLS NOT DISTINCT (style_id, operation_id, colorway_id)`. **Only rows that differ from the
operation's standard minutes**, or add an operation the style doesn't normally
get (embro/stamp, cuci screen, intarsia). Most styles need none.

**`style_trims`** — `id`, `style_id`, `material_id` (zipper/button/stamp),
`qty_per_piece`. `UNIQUE (style_id, material_id)`. Feeds raw material cost.

**`style_market_prices`** — `id`, `style_id`, `market_id`, `line_price_usd`.
`UNIQUE (style_id, market_id)`.
**Override only**; Canada is otherwise computed as
`ROUNDDOWN(USA line + landed-cost variance)`, exactly as the sheet does in 69%
of rows.

**`style_measurements`** — `id`, `style_id`, `size_id`, `point`, `value_cm`.
`UNIQUE (style_id, size_id, point)`. From the PRD; not in the sheet.

### 4.3 The two price tracks — wholesale and SY

**Confirmed 2026-09-21.** A style is priced twice, independently, and both are
required. This is not one price with a discount applied.

| | Wholesale (`000`) | SY |
|---|---|---|
| Line price | `whls_line_price_usd` — typed | — |
| Retail | `whls_retail_price_usd` — typed, defaults to `ROUNDUP(line × markup)` | `sy_retail_price_usd` — **typed, independent** |
| Mark-up | **computed** — `retail ÷ line price` | `sy_mark_up` — **typed** |
| Sale / sample | `final_sale_price_usd` (F26) · `final_sample_price_usd` (S27) | — |
| Territory prices | `style_market_prices` (USA, Canada, Diverse, EFSN, Ellis) | — |

In S27 these are two separate blocks: the wholesale retail at column `IT` with a
**computed** mark-up at `IU`, and the SY retail at `JC` with a **typed** mark-up
at `JD`. The sheet even carries a `variance` column comparing the two.

**Either can be empty.** 724 S27 rows have `N/A` for the wholesale line price —
those styles are SY-only. The reverse also happens. So neither column is `NOT
NULL`, and a style with no price at all is a legitimate draft.

**Not to be confused with the colorway channel.** `style_colorways.whs_channel`
(`000` / `SY` / `BOTH`) says *which channel a colorway is sold in*. These columns
say *what it costs there*. A style can be priced for both channels while only
some of its colorways are sold in each.

**In F26 the SY difference shows up in cost, not price:** two landed-cost columns
(`DHL LANDED VOLUMETRIC AIR COST FOR SY ONLY`, for 1 pc and 2 pcs) carry the
direct-to-customer shipping. Those are computed in the view from
`season_rates.sy_only_dhl_1pc_usd` / `_2pc_usd`.

---

## 5. Computed — `v_sku_costing`

One row per style × size × colorway — the same grain as an IM MASTER row — built
from the inputs and `season_rates`. Every column below is a formula read from
the file:

| Output | Formula (sheet column) |
|---|---|
| `style_code` | cat ‖ season_number ‖ content ‖ gauge ‖ letter ‖ number (I) — e.g. `K` ‖ `57` ‖ `Y` ‖ `2` ‖ `W` ‖ `653` = `K57Y2W653` |
| `description` | name ‖ ` - ` ‖ size ‖ channel suffix (K) |
| `care_label` | base ‖ `-` ‖ size suffix (R) |
| tolerances | weight × 0.96 / × 1.04 (CF, CG, CK, CL) |
| `distribution_wt` | pre-component + 0.009 (CH) |
| `pricing_wt` | distribution × 1.04 (CI) |
| `gross_kg_full_box` | pcs × finished + empty box + pcs × plastic (DY) |
| `lbs_per_item` | gross ÷ pcs × 2.2046 (DZ) |
| volumetric kg / lbs | L×D×H ÷ 5000, vs gross (EA, EB, EC) |
| `raw_material_idr` | distribution wt × material price + trims (FA) |
| `knitting_idr` | minutes ÷ 60 × rate × 1.6 (FB) |
| each operation | minutes ÷ 60 × rate × 1.6 (FC–FV) |
| `total_all_costs_usd` | Σ FA…FV ÷ exchange rate (FW) |
| `admin_idr` | admin % × 24,000 + 10,000 (FZ) |
| `receiving_cost_usd` | (vendor + admin + labels) ÷ exchange (GB, GC) |
| extra charges | pcs/4 × box charge + plastic ÷ pcs (GE) |
| duty USA | declared × rate + 2% + 0.35% (GJ–GM) |
| duty Canada | declared × 25% (GN) |
| freight | DHL / FedEx / sea (GP–GW) |
| 6 landed costs | receiving + extras + packaging + duty + customs + freight (GZ–HF) |
| Canada line price | ROUNDDOWN(USA + variance) unless overridden (HI) |
| after-commission prices | × 0.88 (HJ, HK) |
| suggested retail | line × each entry of `retail_markups` (S27 gives three: 2.2 / 2.25 / 2.3) |
| `whls_mark_up` | wholesale retail ÷ line price (S27 IU · F26 HV) |
| SY mark-up | **not computed** — typed (S27 JD) |
| `retail_variance` | wholesale retail vs SY retail (S27 JI) |
| 8 margins | 1 − landed ÷ price (HM–HX) |
| `below_target` | margin < target from `season_rates` |

A plain view is enough — 4,684 rows is nothing for Postgres. Materialize it only
if it ever gets slow.

`v_im_export` reorders the same columns into IM MASTER layout, so producing the
file for Paola is a query, not a copy-paste-and-delete (§6).

`v_salesforce_export` emits the **Salesforce API field names directly** —
`KUGO2P__STANDARDPRICE__C`, `DUTY_CATEGORY__C`, `BOM1__C` … — so the feed is
`COPY (SELECT * FROM v_salesforce_export WHERE season_id = …) TO STDOUT CSV HEADER`.
See §10.

**How we know the view is right:** before it replaces anything, compute it for
20 real F26 styles and diff every output against the sheet's own values. They
must match to the cent. If one doesn't, the formula table above is wrong and we
find out on day one.

---

## 6. What this buys

| | Sheet | Database |
|---|---|---|
| Values per style | ~15 rows × 236 cols ≈ **3,500 cells** | roughly **60–80 typed values** |
| Change the exchange rate | fill-down over 4,684 rows | edit **one** number |
| Duty for a new style | copy 9 columns from a similar row | pick the content code |
| Box | type 3 dimensions, copy 5 derived columns | pick `DHL 6/7/8` |
| Yarn price used | a hidden `$FA$n` pointer in a formula | a visible FK |
| Labour | 15 columns of formulas per row | standard minutes, override the exceptions |
| Colours | 54 columns, mostly blank | one row per yarn |
| Collection | position under a banner row | a field that can't drift |
| Sending the IM | delete rows marked "(Delete this when sending IM to Paola)" | `v_im_export WHERE status = 'active'` |
| Margin below target | read a note in row 53 | flagged per SKU |

For the entry screen specifically: of the ~30 fields on `styles`, most default
sensibly (season, collection carried from the last style entered, standard
operations, box type from pcs/box). The honest minimum to create a costed style
is **name, number, content, gauge, box, one weight per size, pcs/box, colorways
with yarns, and the USA line price**.

---

## 7. Problems in the sheet the schema fixes

- **External workbook link.** `TARIFF CATEGORY` is `=[1]F26!GE$8` — a reference
  to *another file*. Move or rename it and every tariff breaks. Here it is a
  lookup.
- **Broken formula.** `PCS/ BOX` (DU) contains `16+(16*#REF!)`.
- **Subtotal rows inside the data** — e.g. r1796 `SUBTOTAL(1,CE1763:CE1794)`.
  Like banner rows, these would import as fake styles.
- **Junk in colour slots** — `COLOR1` includes `155.5`, `176`, `302`, `TBD`, `X`.
  An FK to `yarn_colors` rejects these.
- **Inconsistent weight grading** — `× 1.1` in some styles, `× 0.92` in others,
  typed in the rest.
- **Invisible material choice** — the `$FA$n` pointer (§2.3).
- **Empty-box weight ignores the box.** `EMPTY BOX WT` is `=$DY$15` — one fixed
  cell — whatever box the style uses. So the 48 cm box is costed at **1.32 kg in
  971 of 972 rows**, although row 53 lists it at **1.6 kg**. That under-states
  gross weight, and with it freight, for about a fifth of F26. Either the sheet is
  wrong or the 1.6 is stale — see §8.
- **Mixed box dimensions** — 12 rows use 48 × 35.9 × 36.9: the big box's length
  with the small box's depth and height. A `box_types` FK makes that impossible.
- **`#` reused** — one number, two styles (§4.2).
- **The 31 empty columns** — labour captions and eleven worker-name columns.

---

## 8. Needs your yes before I write the migration

| # | Question | My recommendation |
|---|---|---|
| 1 | **Compute** the 88 formula columns in a view instead of storing them? | **Yes.** Reverses v1 §8.1, for the reasons in §1 |
| 2 | Fifteen season-constant fields on `seasons` only, no per-style override yet? | Yes — add overrides when a style first needs one |
| 3 | Material cost uses **one** material price per style, as the sheet does? | Yes for parity. A blend weighted by yarn % is more accurate but will not match the sheet — later, if wanted |
| 4 | `style_operations` stores **exceptions only**? | Yes |
| 5 | ~~Key on `style_number`?~~ | **Decided 2026-09-19:** every table keyed on its own `id` (§4.0). `#`, name and style code are ordinary columns |
| 6 | Keep `markets` for USA/Canada (and S27's Diverse/EFSN/Ellis)? | Yes — markets change between seasons |
| 7 | Build the 20-style golden test (§5) before any UI? | Yes. It is what makes "compute" safe |
| 8 | Empty-box weight: take it from the box (1.6 kg for DHL 7), or copy the sheet's fixed 1.32? | From the box — but it **changes freight and margins for ~970 rows**, so the golden test must use DHL 6 styles until this is decided |

Items 1, 3 and 8 are the ones that change numbers people see. The rest can be
revised later without losing data.

---

## 9. Does the schema hold S27 as well as F26?

**Yes — same 19 tables, no new ones.** Four columns changed as a result; they are
already applied above and listed in §9.4.

Compared with the same method: `Copy of S27 IM MASTER.xlsx` (19 Aug, the newest
S27) against `F26 IM MASTER.xlsx` (the copy in this folder).

### 9.1 Structure

| | S27 | F26 |
|---|---|---|
| Header row | 57 | 54 |
| Columns | 255 | 236 |
| Data rows | 3,779 | 4,684 |
| Styles | 222 | 311 |
| Banner rows | 18 | 19 |
| Colour slots | C1–**C21** | C1–**C18** |
| `DESCRIPTION` at | K | K |
| Size column | **`NEED MAL?` (col O), 4 sizes, filled** | **absent** (`PERLU MALL?` is empty) |

**Column kinds land almost identically** — strong evidence the two seasons are
the same model, not two different problems:

| Kind | S27 | F26 |
|---|---|---|
| Formula | **88** | **88** |
| Colour slots | 63 | 54 |
| Typed input | 35 | 38 |
| Empty | 38 | 31 |
| Constant all season | 31 | 25 |

### 9.2 Column letters are unusable — now proven twice over

Between the two seasons, 201 headers appear in both, and only **11 (5%)** sit in
the same column.

Worse, the **same season drifts inside a single year**. Comparing the May and
August copies of S27: of 254 shared headers, **247 moved to a different column**
in three months — two columns were inserted near the front and pushed everything
along (`DESCRIPTION` I→K, `CONSTRUCTION` N→P, and so on).

Any mapping by column letter is wrong within one season, never mind across two.

### 9.3 What is the same

- **Same grain** — one row per style × size × colorway.
- **Same collection mechanism** — banner rows, material banner (`COTTON`,
  `GRASSY`) plus a collection banner, both ending with a
  "ADDITIONAL FULL PRICE AND SALE…" block and a `WS COLLECTION` section.
- **Same labour formula**, only at different parameter rows:
  S27 `(16/60)*($FP$55*$FP$54)` · F26 `(16/60)*($FC$53*$FC$52)`.
- **Same 15 season-constant fields**, with *different values* — the hang tag is
  `#1 PALM OR #2 BEACH` in S27 and `#3 HORSE OR #4 DESERT` in F26. Exactly why
  they belong on `seasons` rather than hard-coded.
- **Same duty model** — categories 345 / 446, tariffs 6110.20.2020 /
  6110.30.1520, rates 0.285 / 0.29, driven by the content code. (The mix
  inverts: S27 is mostly cotton, F26 mostly grassy.)
- **Same sizes** — X/S, S/M, M/L, X/L.
- **Same materials price list** in rows 1–32.
- **Same three parameter rows** above the header.

### 9.4 What differs — and where each difference lands

| Difference | S27 | F26 | Absorbed by |
|---|---|---|---|
| Markets | FOB Bali, Diverse, EFSN, Ellis + an SY price block | USA, Canada | `markets` + `style_market_prices` |
| Final price | **sample** price | **sale** price | ⚠️ `styles` now has both, nullable |
| Retail multipliers | 2.2, **2.25, 2.3** | 2.2 | ⚠️ `season_rates.retail_markups` is now an array |
| Carriers | DHL air, DHL volumetric | + FedEx Canada, DHL grassy | `season_rates` — nullable per season |
| Boxes in use | **1** (41.7×35.9×36.9) | **3** | `box_types` — S27 simply has one row |
| Gauge values | 2, 3, 8 **and `2I`** | 2, 3, 4, 8 | ⚠️ `gauge` is **text**, not smallint |
| Content codes | 7 | 12 | `content_codes` |
| Embroidery | `STAMP` on its own | `EMBRO/STAMP` combined | `operations` — different rows per season |
| Colorway channel column | `WHS MARK` | `WHS` | same field, renamed (§9.5) |
| Size | a real column | only inside `DESCRIPTION` | `style_sizes.size_id` is entered either way |

The four ⚠️ items are the only schema changes S27 forced, and all four are
column-level, not table-level.

### 9.5 One consequence for importing, if we ever do

The same logical field is **named differently each season** — `WHS` vs
`WHS MARK`, `NEED MAL?` vs `PERLU MALL?`, `EXTRA CHARGES - BOXES` vs
`EXTRA CHARGES - BOXES, PLASTIC`, `DUTY RATE` vs `DUTY RATE to USA`.

So an importer cannot key on header text alone any more than on column letters.
It needs a small per-season mapping — logical field → that season's header — which
would be a 20th table (`sheet_column_map`) and is only worth building if an
import is actually wanted. Entering styles directly needs none of it.

### 9.6 Verdict

The 19 tables hold both seasons. Everything that differs is **data inside the
lookup tables** (different markets, different collections, different rates,
one box versus three) rather than a difference in shape — which is what you want
from a schema that has to survive S28.

The one thing to confirm: S27's **SY price block** means a style can carry a
different price for the Shopify channel than for wholesale. Modelling `SY` as a
market row handles it, but it is worth checking that is how the team thinks
about it.

**Answered 2026-09-21 — SY and wholesale are separate prices and both are
needed.** So SY is *not* modelled as a market row; it is its own pair of columns
on `styles` (§4.3). Markets stay for the wholesale line price by territory
(USA, Canada, Diverse, EFSN, Ellis).

### 9.7 Season order — S27 is the newer season

`F26` = **Fall 2026**, `S27` = **Spring 2027**. The `SEASON` code in the sheet
is a running counter that confirms it: F26 is 57, S27 is 58.

This corrects an assumption recorded earlier in `plan.md`, which guessed F26
might be the newer file because its May copy had more rows and a Canada pricing
track. The opposite is true, and the direction of travel is the other way:
**Canada is in the older season and gone from the newer one, while the SY block
and the Diverse / EFSN / Ellis distributors are what the newer season adds.**

Practical consequence: **S27 is the better model of where things are heading**,
and the newer season is the one to build the first screens against.


---

## 10. The Salesforce feed — the part that pays for itself first

`im-to-sales-force` already reads this workbook and pushes it to Salesforce. It
is the strongest reason to hold this data in a database, and the first thing
worth building.

### 10.1 What it costs today

| | |
|---|---|
| File | 13.7 MB on disk |
| Sheet XML to parse | **53 MB** (the May copy: 92 MB) |
| Stream-parsing alone | **1.5 s** — standard library, values discarded. pandas building a 4,766 × 249 DataFrame is several times that, plus memory |
| Before that | the file has to sync down from Google Drive |
| Pipeline | four steps, `Output/Step_1` … `Step_4` |
| Field map | 84 entries in `im_field_mapping.py`, **maintained by hand**, whose docstring says to update it from the README |

And it is fragile in the exact ways §9.2 measured:

- `header_row=56` is hardcoded — F26's header is row 54, S27's is 57.
- Fields still resolve by **column letter** as a fallback (`CAT`→A, `#`→F,
  `PACKING_VOLUME__C`→IY). 247 of 254 headers moved inside S27 in three months.
- It maps **12 BOM slots**; S27 carries **21**. Yarns past the 12th never reach
  Salesforce, silently.

### 10.2 What it becomes

```sql
COPY (SELECT * FROM v_salesforce_export WHERE season_id = :season)
TO STDOUT WITH (FORMAT csv, HEADER);
```

The view's column names **are** the Salesforce API names, so the mapping stops
being a document someone must remember to update and becomes part of the schema.

What disappears:

| Today | With the database |
|---|---|
| Parse 53 MB of XML | index lookup |
| Guess/hardcode the header row | no header row |
| Column-letter fallbacks | no columns — fields |
| Hand-maintained 84-entry map | the view *is* the map |
| 12 BOM slots, rest dropped | all 21 — `colorway_yarns` is already one row per yarn |
| Banner and subtotal rows must be filtered out | they never existed |
| `TBD` / `X` / `#REF!` can reach Salesforce | rejected at entry |
| Four transformation steps | one query |

Most of those four steps exist to undo the spreadsheet's *shape* — pivoting 63
colour columns into BOM slots, dropping banner rows, finding the header. None of
that work is needed against normalized data.

### 10.3 Why this is the right first deliverable

It needs **no data entry screens**. Populate a season, run the golden test
(§5) so the computed numbers match the sheet to the cent, and point the
Salesforce job at the database instead of the workbook.

That delivers value while the sheet is still where people work — which is also
the lowest-risk way to prove the calculations are right before anyone depends on
them for entry.

---

## 11. Appendix — every table and column

The consolidated list. **19 tables, ~190 columns, 5 views.** Every table has
`id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (§4.0); FKs end in `_id`.

### Season setup — 11 tables

**`seasons`** (25)
`id` · `code` · `name` · `season_number` · `starts_on` · `cat_code` ·
`style_letter` · `default_construction` · `default_details` · `default_lining` ·
`default_tension` · `default_production_vendor` · `default_spec` ·
`default_hang_tag_instructions` · `default_hook_sock_tag` ·
`default_bagging_method` · `default_poly_bag_sticker` ·
`default_packing_method` · `default_ship_via` · `default_packing_method_in_box` ·
`default_special_instructions` · `default_box_labeling` · `is_current` ·
`created_at` · `updated_at`

**`season_rates`** (38) — one row per season, replaces the sheet's rate rows
`id` · `season_id` · `exchange_rate_idr_usd` · `labour_rate_idr_per_hour` ·
`labour_multiplier` · `special_op_rate_idr_per_hour` · `admin_base_idr` ·
`additional_admin_idr` · `labels_tag_cost_idr` · `packaging_fee_idr` ·
`box_charge_idr` · `plastic_charge_idr` · `plastic_wt_kg` ·
`wt_tolerance_low` · `wt_tolerance_high` · `pricing_wt_factor` ·
`distribution_wt_add_kg` · `volumetric_divisor` · `kg_to_lb` ·
`container_20ft_cm3` · `sea_c_rate_usd` · `sea_p_rate_usd` · `dhl_usd_per_kg` ·
`dhl_grassy_usd_per_kg` · `fedex_canada_usd_per_kg` · `disbursement_pct` ·
`mpf_pct` · `canada_duty_pct` · `customs_usd` · `outgoing_freight_usd` ·
`sy_only_dhl_1pc_usd` · `sy_only_dhl_2pc_usd` · `reps_commission_factor` ·
`retail_markups`❲❳ · `target_retail_margin` · `min_retail_margin` ·
`target_sea_margin` · `min_order_pcs`

**`collections`** (4) — `id` · `season_id` · `name` · `sort_order`

**`content_codes`** (5) — `id` · `code` · `description` · `material_family` · `duty_category_id`

**`duty_categories`** (7) — `id` · `season_id` · `code` · `tariff_code` · `usa_duty_rate` · `declared_value_usd` · `description`

**`box_types`** (6) — `id` · `code` · `length_cm` · `depth_cm` · `height_cm` · `empty_box_wt_kg`

**`materials`** (9) — `id` · `season_id` · `code` · `name` · `kind` · `unit` · `exchange_rate` · `price_idr` · `price_usd`

**`yarn_colors`** (5) — `id` · `material_id` · `prefix` · `name` · `color_code`

**`operations`** (7) — `id` · `code` · `name` · `default_minutes` · `rate_basis` · `applies_by_default` · `sort_order`

**`sizes`** (4) — `id` · `code` · `label_suffix` · `sort_order`

**`markets`** (5) — `id` · `season_id` · `code` · `pricing_rule` · `commission_factor`

### Style data — 8 tables

**`styles`** (37)
`id` · `season_id` · `collection_id` · `style_number` · `style_name` · `status` ·
`content_code_id` · `gauge` · `whs_code` · `print_placement` · `cc_marker` ·
`final_finishing_category` · `total_ends` · `gauge_detail` · `care_label_base` ·
`based_body` · `material_id` · `box_type_id` · `knit_minutes_dev` ·
`knit_minutes_breakdown` · `admin_pct` · `finishing_home_price_idr` ·
`finishing_home_minutes` · `embroidery_price_idr` · `embroidery_minutes` ·
`whls_line_price_usd` · `whls_retail_price_usd` · `sy_retail_price_usd` ·
`sy_mark_up` · `final_sale_price_usd` · `final_sample_price_usd` ·
`similar_repeat_price_note` · `photo_url` · `notes` · `created_at` ·
`updated_at` · `version`

**`style_sizes`** (6) — `id` · `style_id` · `size_id` · `pre_component_wt_kg` · `finished_wt_kg` · `pcs_per_box`

**`style_colorways`** (8) — `id` · `style_id` · `ws_tag_color` · `whs_channel` · `reps_color` · `color_sequence` · `sell_restriction` · `sort_order`

**`colorway_yarns`** (6) — `id` · `colorway_id` · `slot` · `yarn_color_id` · `percent` · `ends`

**`style_operations`** (5) — `id` · `style_id` · `operation_id` · `colorway_id` · `minutes`

**`style_trims`** (4) — `id` · `style_id` · `material_id` · `qty_per_piece`

**`style_market_prices`** (4) — `id` · `style_id` · `market_id` · `line_price_usd`

**`style_measurements`** (5) — `id` · `style_id` · `size_id` · `point` · `value_cm`

### Views — 5, no storage

| View | Grain | Purpose |
|---|---|---|
| `v_sku_costing` | style × size × colorway | the 88 calculated columns — §5 |
| `v_im_export` | style × size × colorway | IM MASTER column order |
| `v_salesforce_export` | style × size × colorway | Salesforce API field names — §10 |
| `v_style_weights_wide` | one row per style | sizes as columns, for the entry grid — §11.1 |
| `v_style_bom_wide` | style × colorway | yarn slots as `BOM1…BOM21` columns |

### 11.1 Wide when you want wide

Storage is one row per size; reading it as a grid is a view, not a different
table:

```sql
CREATE VIEW v_style_weights_wide AS
SELECT ss.style_id,
       MAX(ss.finished_wt_kg) FILTER (WHERE z.code = 'X/S') AS xs,
       MAX(ss.finished_wt_kg) FILTER (WHERE z.code = 'S/M') AS sm,
       MAX(ss.finished_wt_kg) FILTER (WHERE z.code = 'M/L') AS ml,
       MAX(ss.finished_wt_kg) FILTER (WHERE z.code = 'X/L') AS xl
FROM style_sizes ss JOIN sizes z ON z.id = ss.size_id
GROUP BY ss.style_id;
```

`v_style_bom_wide` does the same for yarn slots, which is what
`v_salesforce_export` needs for `BOM1__C … BOM21__C`. Adding a size or a slot is
one row plus one line here — not a migration across every table and screen.

### 11.2 What staff actually type

Of ~190 columns, most are lookup rows filled once per season or audit fields.
Creating a costed style touches roughly **25–30 values**: name, number, content
code, gauge, collection, box type, material, admin %, knit minutes, three values
per size, a colorway with its yarn lines, and the prices.
