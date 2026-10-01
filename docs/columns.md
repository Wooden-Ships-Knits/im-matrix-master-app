# PDM — Column List

**Created 2026-09-11.** Build step `plan.md` §6.1. **No SQL written yet** — this
list is for review first.

---

## 1. How this was produced

Both workbooks were read in full — every data row, not a sample:

| | S27 IM MASTER.xlsx | F26 IM MASTER.xlsx |
|---|---|---|
| Sheet / header row | `S27` / row **57** | `F26` / row **54** |
| Header columns | **255** | **235** |
| Data rows profiled | **4,080** | **8,382** |

For every column I measured **fill rate** (how many data rows actually have a
value), inferred **type**, and tested **whether the value changes between rows of
the same style**. That last test is what decides which table a column belongs in,
and it is why this list differs from the guesswork in `config-contract.md`.

**Union: 288 distinct columns** — 202 in both files, 53 only in S27, 33 only in F26.

Fill rates across the union:

| Fill (max of the two files) | Columns |
|---|---|
| ≥ 90% | 131 |
| 50–90% | 35 |
| 10–50% | 20 |
| 1–10% | 23 |
| < 1% | 78 |
| 0% in both | 1 |

**101 of 288 columns are under 10% filled.** They are overwhelmingly label cells
and abandoned notes, not data — which is where most of the proposed drops come
from (§7).

---

## 2. Three findings that change the schema

### 2.1 S27 has a real size column. It is mislabeled. F26 has none at all.

S27 column **M**, headed `NEED MAL?`, contains `X/S · S/M · M/L · X/L` and is
**99.2% filled**. It matches the size suffix in `DESCRIPTION` exactly. It is the
size column wearing someone else's header.

F26's column in that position (`P`, `PERLU MALL?`) is **0.2% filled**. Scanning
all 235 F26 columns for size tokens found **nothing else**. In F26, size exists
*only* inside the `DESCRIPTION` string.

And that string cannot be parsed — splitting on the dash gives 14 distinct
"sizes" in S27 and **51** in F26, of which only four are sizes; the rest are
channel markers (`000 ONLY`, `SHOPIFY ONLY`, `FAH`, `FAF`, `SY ONLY`).

**So `size` is its own column, entered explicitly, and `style_name` never carries it.**

### 2.2 The table splits on weight, and the split is clean

Testing every candidate against "does this change between rows of the same style
number":

| Varies 100% within a style → **belongs to the size** | Varies 0% → **belongs to the style** |
|---|---|
| finished kgs/item, pre-component wt, distribution wt | construction, details, lining, gauge, tension |
| pcs per box, gross kg/full box, volumetric kg/item | box length/depth/height, empty box wt |
| vendor price, raw material cost | packing method, bagging, ship via, hang tag |
| receiving cost in Bali | duty category, tariff category, duty tax |
| DHL air / sea freight per item | admin %, labels & tag cost, packaging fee |
| all landed costs | knitting, finishing, QC, steam (labour rates) |
| **total all costs** | **wholesale line price, final retail price, sample price** |

The logic is consistent: **weight drives cost**, so everything downstream of
weight is per-size, while the labour rates and the selling prices are per-style.

This is not a detail. Putting `total_all_costs` on `styles` would silently keep
one size's cost and discard the other three.

### 2.3 The pricing block is where the two seasons disagree most

S27 prices to **Diverse Group**, a **European distributor (EFSN)**, and **Ellis** —
each with its own FOB price, WS margin and % discount.

F26 has none of those. It prices to **USA** and **Canada**, each with line price,
reps-commission variant, margin and landed cost.

Same business function, completely different columns. A fixed set of market
columns would need a migration every time a market is added or dropped — and
these two files, one season apart, already prove that happens.

**Recommendation: a `style_prices` child table keyed `(style_id, market)`.** A
new market becomes a row, not a schema change. §6 lists it. If you would rather
have flat columns, say so and I will expand them instead — it is §8.2.

---

## 3. Proposed tables

```
styles                 one row per style per season       ~95 columns
├── style_sizes        one row per size (4 typical)       ~25 columns
├── style_colorways    one row per colorway (1-11)         ~5 columns
│   └── colorway_yarns one row per yarn line (1-21)        ~5 columns
└── style_prices       one row per market                  ~6 columns
```

**Why `colorway_yarns` is a table and not 63 columns.** The spreadsheet has 21
colour slots × 3 columns. Their fill rates:

| Slot | S27 | F26 | | Slot | S27 | F26 |
|---|---|---|---|---|---|---|
| C1 | 77.3% | 71.9% | | C6 | 2.5% | 3.5% |
| C2 | 46.8% | 56.8% | | C7–C10 | 1.6→0.8% | 2.5→0.9% |
| C3 | 23.6% | 27.6% | | C11–C18 | 0.4% | ~0.5% |
| C4 | 10.7% | 13.9% | | C19–C21 | 0.4% | **absent** |
| C5 | 5.2% | 7.2% | | | | |

From C5 onward every slot is under 8% filled, and F26 stops at C18 where S27
goes to C21. As columns that is 63 fields that are null for a solid-colour
sweater, and a migration whenever a season needs a 22nd. As a child table it is
one row per yarn line and the limit disappears.

---

## 4. `styles` — the wide table

Fill % shown as **S27 / F26**. `·` = column absent from that file.
**Type** is what I propose for Postgres. **✓** = keep, **~** = keep but confirm,
**ƒ** = formula result in the sheet (see §8.1).

### 4.1 Identity and classification

| # | DB column | Type | S27 | F26 | Fill | Notes |
|---|---|---|---|---|---|---|
| 1 | `season` | text NOT NULL | B | B | 99/100 | ⚠️ Stored as a **number**: S27 = `58`, F26 = `57`. Not "S27". §8.3 |
| 2 | `style_number` | text NOT NULL | F | F | 99/90 | `795`, `796`. Likely the real key — §8.4 |
| 3 | `style_name` | text NOT NULL | I | K | 100/100 | From `DESCRIPTION`, **size suffix stripped** (§2.1) |
| 4 | `cat` | text | A | A | 99/100 | Constant `K` in both files. Keep for future, defaults `K` |
| 5 | `style_type` | text | E | E | 99/100 | Constant `W` in both |
| 6 | `content_code` | text | C | C | 99/100 | `C`, `CPE`, `CE`, `CC`, `CP`, `A`, `Y`, `YPE`, `YE`, `YP` — 7 in S27, 12 in F26 |
| 7 | `gauge_code` | smallint | D | D | 99/100 | 1–9 |
| 8 | `whs_code` | text | G | G | 99/100 | `-000`, and `-003` in F26 |
| 9 | `cc_marker` | text | H | J | 99/100 | S27 `CC - W` constant; F26 `CC-M` / `CC` / `CC-M - PB` |
| 10 | `category` | text | · | H | ·/54 | F26 only — `A (front only)` / `B (back only)` / `C (front & back)` |

### 4.2 Channel flags

| # | DB column | Type | S27 | F26 | Fill | Notes |
|---|---|---|---|---|---|---|
| 11 | `sell_in_sy` | boolean | K/L | M/N | <1/4 | Two near-duplicate `X`-marker columns. Collapse to one boolean |
| 12 | `final_finishing_category` | text | J | L | 6/4 | `FAF`, `FAH` |
| 13 | `shopify_only` | boolean | — | — | — | Derived from the `SHOPIFY ONLY` marker found in `DESCRIPTION` (§2.1) |

### 4.3 Construction and knit ✓

All seven vary 0% within a style — confirmed style-level.

| # | DB column | Type | S27 | F26 | Fill |
|---|---|---|---|---|---|
| 14 | `construction` | text | N | Q | 78/76 |
| 15 | `composition_care_label` | text | O | R | 78/76 |
| 16 | `logo_label` | text | P | S | <1/<1 |
| 17 | `details` | text | Q | T | 78/69 |
| 18 | `lining` | text | R | U | 78/76 |
| 19 | `total_ends` | text | S | V | 78/75 |
| 20 | `gauge_full` | text | T | W | 78/74 |
| 21 | `tension` | text | U | X | 78/73 |
| 22 | `color_sequence` | text | V | Y | 78/72 |

### 4.4 Spec, tags and packaging ✓ — all 100% filled, all style-level

| # | DB column | Type | S27 | F26 |
|---|---|---|---|---|
| 23 | `spec` | text | DO | DD |
| 24 | `hang_tag_instructions` | text | DQ | DF |
| 25 | `hook_sock_tag` | text | DR | DG |
| 26 | `bagging_method` | text | DS | DH |
| 27 | `poly_bag_sticker` | text | DT | DI |
| 28 | `packing_method` | text | DU | DJ |
| 29 | `ship_via` | text | DW | DL |
| 30 | `packing_method_in_box` | text | DX | DM |
| 31 | `special_customer_order_instructions` | text | DY | DN |
| 32 | `box_labeling` | text | DZ | DO |
| 33 | `based_body` | text | EE | DT |

### 4.5 Box ✓ — style-level (verified: box length varies 0%)

| # | DB column | Type | S27 | F26 | Notes |
|---|---|---|---|---|---|
| 34 | `box_length_cm` | numeric(8,2) | EA | DP | |
| 35 | `box_depth_cm` | numeric(8,2) | EB | DQ | |
| 36 | `box_height_cm` | numeric(8,2) | EC | DR | |
| 37 | `empty_box_wt_kg` | numeric(8,3) | EI | DX | |
| 38 | `plastic_wt_kg` | numeric(8,3) | EH | DV | F26 header adds "hang tag, DHL flyer, STC" |
| 39 | `volumetric_min_kg_full_box` | numeric(8,3) | EL | EA | ƒ |
| 40 | `pct_vol_box_in_20ft` | numeric(9,6) | HC | GT | ƒ |

### 4.6 Labour and production rates ✓ — style-level

The six unnamed `PRICE` columns are the price **of the operation named in the
column immediately to their left** — those label columns are 0% filled because
the operation name lives in the header, not the data. Naming them accordingly:

| # | DB column | Type | S27 | F26 | Fill |
|---|---|---|---|---|---|
| 41 | `production_vendor` | text | CX | CM | 100/100 |
| 42 | `minutes_per_pc_prod_line` | numeric(8,2) | CY | CN | 100/100 |
| 43 | `minutes_per_pc_dev` | numeric(8,2) | CZ | CO | 100/100 |
| 44 | `price_handknit_crochet_embro` | numeric(12,2) | DD | CS | 100/100 |
| 45 | `price_lipat_jitet_kancing` | numeric(12,2) | DF | CU | 100/100 |
| 46 | `price_jitet_emb_to_item` | numeric(12,2) | DH | CW | 100/100 |
| 47 | `price_pasang_kancing_tali` | numeric(12,2) | DJ | CY | 100/100 |
| 48 | `price_rumbai` | numeric(12,2) | DL | DA | 100/100 |
| 49 | `price_crochet_pompom` | numeric(12,2) | DN | DC | 100/100 |
| 50 | `knitting_price` | numeric(12,2) | FM | FB | 100/100 |
| 51 | `cek_pola` | numeric(12,2) | FN | FC | 100/100 |
| 52 | `link` | numeric(12,2) | FO | FD | 100/100 |
| 53 | `qc_link` | numeric(12,2) | FP | FE | 100/100 |
| 54 | `finishing` | numeric(12,2) | FQ | FF | 84/85 |
| 55 | `service_intarsia` | numeric(12,2) | FS | FH | 27/19 |
| 56 | `sosok` | numeric(12,2) | FT | FI | 86/61 |
| 57 | `qc_finishing` | numeric(12,2) | FU | FJ | 100/100 |
| 58 | `label_sewing_logo_content` | numeric(12,2) | FV | FK | 100/100 |
| 59 | `steam` | numeric(12,2) | FW | FL | 100/100 |
| 60 | `qc_pre` | numeric(12,2) | FX | FM | 100/100 |
| 61 | `stamp` | numeric(12,2) | FY | FN | 23/28 |
| 62 | `cuci_screen` | numeric(12,2) | GA | FP | 14/13 |
| 63 | `jemur` | numeric(12,2) | GB | FQ | 14/13 |
| 64 | `qc_final` | numeric(12,2) | GG | FV | 100/100 |
| 65 | `harga_embroidery` | numeric(12,2) | EZ | EO | 18/16 |
| 66 | `waktu_embro_menit` | text | FA | EP | 17/16 |
| 67 | `finishing_bawa_pulang` | numeric(12,2) | EU | EJ | 16/15 |
| 68 | `waktu_finishing_menit` | text | EV | EK | 16/16 |
| 69 | `ws_factory` | numeric(12,2) | EX | EM | 99/100 |

### 4.7 Admin and overhead ✓ — style-level

| # | DB column | Type | S27 | F26 |
|---|---|---|---|---|
| 70 | `admin_pct` | numeric(7,4) | GI | FX |
| 71 | `additional_admin` | numeric(12,2) | GJ | FY |
| 72 | `admin_amount` | numeric(12,2) ƒ | GK | FZ |
| 73 | `labels_and_tag_cost` | numeric(12,2) | GL | GA |
| 74 | `packaging_fee` | numeric(12,2) | GQ | GF |
| 75 | `extra_charges_boxes` | numeric(12,2) | GP | GE |

### 4.8 Duty and customs ✓ — style-level (all vary 0%)

| # | DB column | Type | S27 | F26 | Notes |
|---|---|---|---|---|---|
| 76 | `duty_category` | text | GR | GG | `345` / `446` |
| 77 | `tariff_category` | text | GS | GH | `6110.20.2020` / `6110.30.1520`. **1:1 with duty_category** — one may be derivable |
| 78 | `duty_rate` | numeric(7,4) | GT | GI | |
| 79 | `duty_tax` | numeric(12,2) ƒ | GU | GJ | |
| 80 | `disbursement_fee` | numeric(12,2) ƒ | GV | GK | "greater of $12 or 2% of duty tax" |
| 81 | `merchandise_processing_fee` | numeric(12,2) ƒ | GW | GL | 0.3464% |
| 82 | `duty_to_usa` | numeric(12,2) ƒ | GX | GM | |
| 83 | `duty_to_canada` | numeric(12,2) ƒ | · | GN | **F26 only** |
| 84 | `customs` | numeric(12,2) | GY | GO | |
| 85 | `outgoing_freight` | numeric(12,2) | HH | GY | |

### 4.9 Selling prices ✓ — style-level

These vary within a style in only **1% of S27** styles and **9–10% of F26**
styles. Treating them as style-level is right; §8.5 covers the minority.

| # | DB column | Type | S27 | F26 | Fill |
|---|---|---|---|---|---|
| 86 | `whls_line_price` | numeric(12,2) | IA | HG | 100/100 |
| 87 | `final_retail_price` | numeric(12,2) | IR | HU | 100/100 |
| 88 | `final_sample_price` | numeric(12,2) | IV | · | 98/· |
| 89 | `final_mark_up` | numeric(7,4) ƒ | IS | HV | 82/91 |
| 90 | `suggested_retail_x22` | numeric(12,2) ƒ | IL | HS | 82/93 |
| 91 | `suggested_retail_x225` | numeric(12,2) ƒ | IM | · | 82/· |
| 92 | `suggested_retail_x23` | numeric(12,2) ƒ | IN | · | 82/· |
| 93 | `similar_repeat_price_note` | text | IB | HL | 100/100 |
| 94 | `price_final_from_pb` | text | IC | · | 100/· |
| 95 | `packing_volume_sf` | numeric(12,4) | IY | IA | 100/100 |

---

## 5. `style_sizes` — one row per size

**Every column here was verified to vary 100% within a style.** Weight drives
cost, so the whole cost chain is per-size.

| # | DB column | Type | S27 | F26 | Fill |
|---|---|---|---|---|---|
| 1 | `size` | text NOT NULL | **M** | **(none)** | 99/— |
| 2 | `pre_component_wt` | numeric(8,4) | CP | CE | 99/100 |
| 3 | `pc_wt_low_tolerance` | numeric(8,4) | CQ | CF | 99/100 |
| 4 | `pc_wt_high_tolerance` | numeric(8,4) | CR | CG | 99/100 |
| 5 | `distribution_wt` | numeric(8,4) | CS | CH | 99/100 |
| 6 | `wt_for_pricing_info` | numeric(8,4) | CT | CI | 99/100 |
| 7 | `finished_kgs_item` | numeric(8,4) | CU | CJ | 99/100 |
| 8 | `finished_low_tolerance` | numeric(8,4) | CV | CK | 99/100 |
| 9 | `finished_high_tolerance` | numeric(8,4) | CW | CL | 99/100 |
| 10 | `pcs_per_box` | integer | ED | DS | 100/100 |
| 11 | `gross_kg_full_box` | numeric(8,3) ƒ | EJ | DY | 99/100 |
| 12 | `actual_wt_lbs_item` | numeric(8,4) ƒ | EK | DZ | 99/100 |
| 13 | `volumetric_kg_item` | numeric(8,4) ƒ | EM | EB | 99/100 |
| 14 | `finished_volumetric_lbs_item` | numeric(8,4) ƒ | EN | EC | 99/100 |
| 15 | `vendor_price` | numeric(12,2) | FJ | EY | 98/100 |
| 16 | `raw_material_for_price` | numeric(12,2) | FK | EZ | 99/100 |
| 17 | `raw_materials_by_wt` | numeric(12,2) | FL | FA | 99/100 |
| 18 | `receiving_cost_bali` | numeric(12,2) | GM | GB | 98/100 |
| 19 | `receiving_cost_bali_selling` | numeric(12,2) | GN | GC | 98/100 |
| 20 | `receiving_cost_bali_sf` | numeric(12,2) | GO | GD | 100/100 |
| 21 | `total_all_costs` | numeric(12,2) ƒ | GH | FW | 99/100 |
| 22 | `dhl_air_frt_item` | numeric(12,2) ƒ | GZ | GP | 99/100 |
| 23 | `dhl_volumetric_air_frt_item` | numeric(12,2) ƒ | HA | GR | 99/100 |
| 24 | `fedex_canada_volumetric_air_frt` | numeric(12,2) ƒ | · | GQ | ·/100 |
| 25 | `sea_c_frt_item` | numeric(12,2) ƒ | HE | GV | 100/100 |
| 26 | `sea_p_frt_item` | numeric(12,2) ƒ | HF | GW | 100/100 |
| 27 | `fedex_landed_air_cost` | numeric(12,2) ƒ | HI | GZ | 98/100 |
| 28 | `dhl_landed_volumetric_air_cost` | numeric(12,2) ƒ | HJ | HB | 98/100 |
| 29 | `canada_landed_volumetric_air_cost` | numeric(12,2) ƒ | · | HA | ·/100 |
| 30 | `landed_sea_cost` | numeric(12,2) ƒ | HK | HC | 98/100 |
| 31 | `landed_consolidated_sea_cost` | numeric(12,2) ƒ | HL | HD | 98/100 |
| 32 | `air_cost_pct_of_selling_price` | numeric(7,4) ƒ | HB | GS | 81/93 |
| 33 | `sea_p_cost_pct_of_selling_price` | numeric(7,4) ƒ | HG | GX | 82/93 |

`PRIMARY KEY (style_id, size)`

---

## 6. `style_colorways`, `colorway_yarns`, `style_prices`

### 6.1 `style_colorways` — 1 to 11 per style

| # | DB column | Type | S27 | F26 | Fill |
|---|---|---|---|---|---|
| 1 | `ws_tag_color` | text NOT NULL | CL | CB | 77/72 |
| 2 | `whs_channel` | text | CM | CC | 75/58 |
| 3 | `reps_color` | text | CN | CD | 19/11 |

`whs_channel` is `000` / `SY` / `BOTH` in S27; F26 adds `SO`, `CO`, `CN`.
**Verified colorway-level** — the same style carries `000` on one colorway and
`BOTH` on another.

`UNIQUE (style_id, ws_tag_color)`

### 6.2 `colorway_yarns` — 1 to 21 per colorway

Replaces 63 spreadsheet columns (§3).

| # | DB column | Type | Source | Notes |
|---|---|---|---|---|
| 1 | `slot` | smallint NOT NULL | position | 1–21 |
| 2 | `color` | text NOT NULL | `COLOR{n}` | `YCA BREAKER WHITE - 658` |
| 3 | `percent` | numeric(7,4) | `C{n}Y%` | ⚠️ Stored as a **fraction** (`0.8677`) — §8.6 |
| 4 | `ends` | numeric(5,2) | `C{n} ENDS` | |

`PRIMARY KEY (colorway_id, slot)`

### 6.3 `style_prices` — one row per market ⭐ recommended

This is §2.3. The market set differs completely between the two seasons, so it
is modelled as rows.

| # | DB column | Type | Notes |
|---|---|---|---|
| 1 | `market` | text NOT NULL | `DIVERSE` · `EFSN` · `ELLIS` (S27) · `USA` · `CANADA` (F26) |
| 2 | `fob_price` | numeric(12,2) | S27: HR / HU / HX |
| 3 | `ws_margin` | numeric(7,4) | S27: HS / HV / HY |
| 4 | `discount_pct` | numeric(7,4) | S27: HT / HW / HZ |
| 5 | `line_price` | numeric(12,2) | F26: HG (USA) / HI (Canada) |
| 6 | `line_price_after_reps_commission` | numeric(12,2) | F26: HJ / HK |
| 7 | `vol_air_margin_line_price` | numeric(7,4) | F26: HM / HO |
| 8 | `sea_margin_line_price` | numeric(7,4) | S27 II · F26 HQ |

`PRIMARY KEY (style_id, market)`

Remaining reps/commission columns — S27 `HO` `ID` `IG` `IJ`, F26 `HN` `HP` `HR` —
fold in here as `reps_commission` and its margin variants once §8.2 is settled.

---

## 7. Proposed drops

**None of these are deleted from the spreadsheet** — they are simply not built as
database columns. Say the word on any and it goes back in.

### 7.1 Operation label cells — 0% filled in both files (13)

`HANDKNIT/CROCHET/EMBRO`, `EMBROIDERI`, `LIPAT DAN JITET KANCING`,
`JITET EMB TO ITEM`, `PASANG KANCING/TALI`, `RUMBAI`, `CROCHET/POM POM`,
`FOIL`, `RENDAM PANEL`, `BILAS`, `JEMUR 1/2 KERING`, `KE PENGERINGAN`,
`QC IN HOUSE PRODUCTION`

These are captions for the price column beside them. The caption is in the header
row; the data cells are empty. Their **prices are kept** as columns 44–49, 62–64.

### 7.2 Worker-name columns — 0% filled in both (10)

`ELLA (EMB)`, `SRI WARTINI`, `NONIK SUKAENI`, `KOMANG KARINI`,
`DESAK RAKA/WAYAN ARDI/IBU PUSPA/JUNE`, `PUTU ARIASA`, `JUNE (DEV) FOR HK`,
`SUKANA`, `KETUT PURNATA`, `SOSOK`/`WAKTU SOSOK`/`BERSIHKAN BENANG` (label forms)

Person-assignment columns, never filled. If work assignment matters it deserves
its own table, not a column per employee — adding a person should not be a
migration.

### 7.3 Stale or superseded (8)

| Column | S27 | F26 | Why |
|---|---|---|---|
| `SPEC PRINT DATE: ST1/ST2` | DP | DE | 0% both |
| `SPEC DATE` | DV | · | 0% |
| `OLD PRICE` | FI | EX | 0–1% |
| `need to update sf` | EG | · | 3%, a working note |
| `ERICA NEED TO UPDATE UTILISATION` | · | DK | 0% |
| `PLASTICK WEIGHT, HANGTAG` | EO | DW | 0%, duplicate of #38 |
| `CATEGORY #2` | · | O | 0% — only fully empty column in either file |
| `PCS/ BOX` (text note) | EF | DU | 8/10%, free text like `S26 CHARLOTTE CREW COTTON=226 =24`; the real `PCS / BOX` is #10 in `style_sizes` |

### 7.4 Duplicated `% VOL` pair (2)

`% VOL OF 1 BOX IN A 20' CONT.` and `% VOL OF 1 ITEM IN A 20' CONT.` each appear
**twice** (S27 `HC`/`HD` and again at `IW`/`IX`; F26 `GT`/`GU` and `HY`/`HZ`),
100% filled in both positions. Keeping one of each pending confirmation they hold
the same value.

### 7.5 Kept but questionable (4)

`CAT` and `STYLE` are **single-valued** across both files (`K` and `W`). `CC - W`
likewise in S27. They cost nothing and may vary in a future season, so they are
kept with defaults — but they carry no information today.

---

## 8. What blocks the DDL

I can write the migration as soon as these are settled. Ordered by how much they
change.

### 8.1 Store the formula results, or not? — `plan.md` §5.5

**58 of the kept columns are marked ƒ** — they are formula outputs: every landed
cost, duty tax, admin amount, markup, suggested retail, all the volumetric
weights.

`plan.md` recommended storing as entered, and I still do for this round. But it
is worth being explicit about the consequence: the app becomes a **record** of
those numbers, not a calculator. Change a weight and the landed cost sitting
beside it is stale until someone retypes it.

The alternative — computing them — means reimplementing the sheet's pricing
model, including the exchange-rate and yarn-price tables that live in rows 1–56
above the header. That is its own project.

**Decision needed: store ƒ columns as entered (recommended), or leave them out
entirely until they can be computed?**

### 8.2 `style_prices` as rows, or flat columns? — §2.3, §6.3

Rows survive a new market without a migration. Flat columns are simpler to query
and closer to the spreadsheet. I recommend rows.

### 8.3 `season` is a number

S27 is stored as `58`, F26 as `57`. Should the app store the label (`S27`), the
code (`58`), or both? If the code means something to anyone downstream we should
keep it; otherwise `season text` and the number is dropped.

### 8.4 Is `style_number` the key? — `plan.md` §5.2

`#` (`795`, `796`) looks like the real identifier and `DESCRIPTION` the label.
If so, `UNIQUE (season, style_number)` rather than on the name. **Note F26's `#`
is only 90% filled**, so 10% of its rows have no style number — which either
breaks it as a key or flags those rows as incomplete.

### 8.5 Prices that vary by size

1% of S27 styles and 9–10% of F26 styles have a `FINAL RETAIL PRICE` that differs
between size rows. Either that is a data error, or price genuinely varies by size
for some styles. If it is real, `final_retail_price` moves to `style_sizes`.
**Worth checking a couple of the F26 cases** — at 10% it is too common to be a
typo.

### 8.6 Percent convention — `plan.md` §5.4

Yarn percentages are fractions (`0.8677`). Store as fraction or as `86.77`?

### 8.7 Sizes are fixed, or free?

`X/S · S/M · M/L · X/L` are the only real sizes in both files. Fixed reference
list, or free text?

---

## 9. Summary

| Table | Columns | Rows per style |
|---|---|---|
| `styles` | ~95 | 1 |
| `style_sizes` | ~33 + key | 4 typical |
| `style_colorways` | ~3 + key | 1–11 |
| `colorway_yarns` | ~4 + key | 1–21 per colorway |
| `style_prices` | ~8 + key | 2–3 |

**~143 kept columns** out of 288 in the union. The rest are labels, worker names,
stale notes and duplicates (§7).

Entering one style — 4 sizes, 3 colorways, 2 yarns each — writes
**1 + 4 + 3 + 6 + 2 = 16 rows**, against the spreadsheet's 12 rows of 255
columns with every style-level field repeated 12 times.
