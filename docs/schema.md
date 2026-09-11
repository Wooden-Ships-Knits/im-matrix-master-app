# IM Master — Final Column List

**Created 2026-09-11.** The complete, DDL-ready inventory. Supersedes the
placement tables in `columns.md` §4–§6 (which stay for the evidence and the
fill-rate analysis).

**167 columns across 5 tables.** Every placement below was decided by measuring
whether the value changes between rows of the same style number in S27 —
not by judgement.

Legend: **ƒ** = formula result in the spreadsheet (see `columns.md` §8.1) ·
**S27** / **F26** = source column letter · `·` = absent from that file ·
**?** = pending a decision in §7.

---

## 1. `styles` — 100 columns, one row per style per season

### 1.1 Keys and identity (4)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 1 | `id` | bigserial PRIMARY KEY | — | — |
| 2 | `season` | text NOT NULL | B | B |
| 3 | `style_number` | text | F | F |
| 4 | `style_name` | text NOT NULL | I | K |

`style_name` comes from `DESCRIPTION` **with the size suffix stripped**.

### 1.2 Classification (7)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 5 | `cat` | text | A | A |
| 6 | `style_type` | text | E | E |
| 7 | `content_code` | text | C | C |
| 8 | `gauge_code` | smallint | D | D |
| 9 | `whs_code` | text | G | G |
| 10 | `cc_marker` | text | H | J |
| 11 | `category` | text | · | H |

### 1.3 Channel flags (3)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 12 | `sell_in_sy` | boolean | K + L | M + N |
| 13 | `final_finishing_category` | text | J | L |
| 14 | `shopify_only` | boolean | derived | derived |

### 1.4 Construction and knit (8)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 15 | `construction` | text | N | Q |
| 16 | `logo_label` | text | P | S |
| 17 | `details` | text | Q | T |
| 18 | `lining` | text | R | U |
| 19 | `total_ends` | text | S | V |
| 20 | `gauge_full` | text | T | W |
| 21 | `tension` | text | U | X |
| 22 | `color_sequence` | text | V | Y |

⚠️ `COMPOSITION & CARE LABEL` is **not** here — it moved to `style_sizes` (§6.1).

### 1.5 Spec, tags and packaging (11)

| # | Column | Type | S27 | F26 |
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

### 1.6 Box (7)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 34 | `box_length_cm` | numeric(8,2) | EA | DP |
| 35 | `box_depth_cm` | numeric(8,2) | EB | DQ |
| 36 | `box_height_cm` | numeric(8,2) | EC | DR |
| 37 | `empty_box_wt_kg` | numeric(8,3) | EI | DX |
| 38 | `plastic_wt_kg` | numeric(8,3) | EH | DV |
| 39 | `volumetric_min_kg_full_box` ƒ | numeric(8,3) | EL | EA |
| 40 | `pct_vol_box_in_20ft` ƒ | numeric(9,6) | HC | GT |

### 1.7 Labour and production rates (30)

The six `price_*` columns are the price of the operation named by the empty
label column beside them in the sheet (`columns.md` §4.6).

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 41 | `production_vendor` | text | CX | CM |
| 42 | `minutes_per_pc_prod_line` | numeric(8,2) | CY | CN |
| 43 | `minutes_per_pc_dev` | numeric(8,2) | CZ | CO |
| 44 | `minutes_per_pc_with_breakdown` | text | DA | CP |
| 45 | `price_handknit_crochet_embro` | numeric(12,2) | DD | CS |
| 46 | `price_lipat_jitet_kancing` | numeric(12,2) | DF | CU |
| 47 | `price_jitet_emb_to_item` | numeric(12,2) | DH | CW |
| 48 | `price_pasang_kancing_tali` | numeric(12,2) | DJ | CY |
| 49 | `price_rumbai` | numeric(12,2) | DL | DA |
| 50 | `price_crochet_pompom` | numeric(12,2) | DN | DC |
| 51 | `knitting_price` | numeric(12,2) | FM | FB |
| 52 | `cek_pola` | numeric(12,2) | FN | FC |
| 53 | `link` | numeric(12,2) | FO | FD |
| 54 | `qc_link` | numeric(12,2) | FP | FE |
| 55 | `finishing` | numeric(12,2) | FQ | FF |
| 56 | `cleaning_yarn` | numeric(12,2) | FR | FG |
| 57 | `service_intarsia` | numeric(12,2) | FS | FH |
| 58 | `sosok` | numeric(12,2) | FT | FI |
| 59 | `qc_finishing` | numeric(12,2) | FU | FJ |
| 60 | `label_sewing_logo_content` | numeric(12,2) | FV | FK |
| 61 | `steam` | numeric(12,2) | FW | FL |
| 62 | `qc_pre` | numeric(12,2) | FX | FM |
| 63 | `stamp` | numeric(12,2) | FY | FN |
| 64 | `cuci_screen` | numeric(12,2) | GA | FP |
| 65 | `jemur` | numeric(12,2) | GB | FQ |
| 66 | `qc_final` | numeric(12,2) | GG | FV |
| 67 | `harga_embroidery` | numeric(12,2) | EZ | EO |
| 68 | `waktu_embro_menit` | text | FA | EP |
| 69 | `finishing_bawa_pulang` | numeric(12,2) | EU | EJ |
| 70 | `waktu_finishing_menit` | text | EV | EK |

### 1.8 Admin and overhead (6)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 71 | `admin_pct` | numeric(7,4) | GI | FX |
| 72 | `additional_admin` | numeric(12,2) | GJ | FY |
| 73 | `admin_amount` ƒ | numeric(12,2) | GK | FZ |
| 74 | `labels_and_tag_cost` | numeric(12,2) | GL | GA |
| 75 | `packaging_fee` | numeric(12,2) | GQ | GF |
| 76 | `receiving_cost_bali_sf` | numeric(12,2) | GO | GD |

### 1.9 Duty and customs (10)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 77 | `duty_category` | text | GR | GG |
| 78 | `tariff_category` | text | GS | GH |
| 79 | `duty_rate` | numeric(7,4) | GT | GI |
| 80 | `duty_tax` ƒ | numeric(12,2) | GU | GJ |
| 81 | `disbursement_fee` ƒ | numeric(12,2) | GV | GK |
| 82 | `merchandise_processing_fee` ƒ | numeric(12,2) | GW | GL |
| 83 | `duty_to_usa` ƒ | numeric(12,2) | GX | GM |
| 84 | `duty_to_canada` ƒ | numeric(12,2) | · | GN |
| 85 | `customs` | numeric(12,2) | GY | GO |
| 86 | `outgoing_freight` | numeric(12,2) | HH | GY |

### 1.10 Selling prices (11)

**Measured: prices are style-level** (they vary within a style in only 1% of S27
styles). The *margins* are size-level and live in `style_sizes` §2.7.

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 87 | `whls_fob_bali` | numeric(12,2) | HP | · |
| 88 | `whls_line_price` | numeric(12,2) | IA | HG |
| 89 | `whls_reps` | numeric(12,2) | ID | HJ |
| 90 | `final_retail_price` | numeric(12,2) | IR | HU |
| 91 | `final_mark_up` ƒ | numeric(7,4) | IS | HV |
| 92 | `final_sample_price` | numeric(12,2) | IV | · |
| 93 | `suggested_retail_x22` ƒ | numeric(12,2) | IL | HS |
| 94 | `suggested_retail_x225` ƒ | numeric(12,2) | IM | · |
| 95 | `suggested_retail_x23` ƒ | numeric(12,2) | IN | · |
| 96 | `similar_repeat_price_note` | text | IB | HL |
| 97 | `price_final_from_pb` | text | IC | · |

### 1.11 Audit (3)

| # | Column | Type |
|---|---|---|
| 98 | `created_at` | timestamptz NOT NULL DEFAULT now() |
| 99 | `updated_at` | timestamptz NOT NULL DEFAULT now() |
| 100 | `version` | integer NOT NULL DEFAULT 1 |

`UNIQUE (season, style_name)` — or `(season, style_number)`, §7.2.

---

## 2. `style_sizes` — 48 columns, ~4 rows per style

Everything here was **measured to vary 100% within a style** unless noted.
Weight drives cost, so the entire cost chain is per-size.

### 2.1 Key (2)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 1 | `style_id` | bigint REFERENCES styles(id) ON DELETE CASCADE | — | — |
| 2 | `size` | text NOT NULL | **M** | **none** |

`PRIMARY KEY (style_id, size)`. F26 has no size column at all — §7.5.

### 2.2 Label (1)

| # | Column | Type | S27 | F26 | Note |
|---|---|---|---|---|---|
| 3 | `composition_care_label` | text | O | R | Varies **98%** — the string embeds the size (`XBIG60CT40AC GREY-XS`) |

### 2.3 Weights (9)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 4 | `pre_component_wt` | numeric(8,4) | CP | CE |
| 5 | `pc_wt_low_tolerance` | numeric(8,4) | CQ | CF |
| 6 | `pc_wt_high_tolerance` | numeric(8,4) | CR | CG |
| 7 | `distribution_wt` | numeric(8,4) | CS | CH |
| 8 | `wt_for_pricing_info` | numeric(8,4) | CT | CI |
| 9 | `finished_kgs_item` | numeric(8,4) | CU | CJ |
| 10 | `finished_low_tolerance` | numeric(8,4) | CV | CK |
| 11 | `finished_high_tolerance` | numeric(8,4) | CW | CL |
| 12 | `ws_factory` | numeric(12,2) | EX | EM |

### 2.4 Box fill and volume (7)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 13 | `pcs_per_box` | integer | ED | DS |
| 14 | `gross_kg_full_box` ƒ | numeric(8,3) | EJ | DY |
| 15 | `actual_wt_lbs_item` ƒ | numeric(8,4) | EK | DZ |
| 16 | `volumetric_kg_item` ƒ | numeric(8,4) | EM | EB |
| 17 | `finished_volumetric_lbs_item` ƒ | numeric(8,4) | EN | EC |
| 18 | `packing_volume_sf` | numeric(12,4) | IY | IA |
| 19 | `pct_vol_item_in_20ft` ƒ | numeric(9,6) | HD | GU |

### 2.5 Material and production cost (7)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 20 | `vendor_price` | numeric(12,2) | FJ | EY |
| 21 | `raw_material_for_price` | numeric(12,2) | FK | EZ |
| 22 | `raw_materials_by_wt` | numeric(12,2) | FL | FA |
| 23 | `receiving_cost_bali` | numeric(12,2) | GM | GB |
| 24 | `receiving_cost_bali_selling` | numeric(12,2) | GN | GC |
| 25 | `extra_charges_boxes` | numeric(12,2) | GP | GE |
| 26 | `total_all_costs` ƒ | numeric(12,2) | GH | FW |

### 2.6 Freight and landed cost (12)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 27 | `dhl_air_frt_item` ƒ | numeric(12,2) | GZ | GP |
| 28 | `dhl_volumetric_air_frt_item` ƒ | numeric(12,2) | HA | GR |
| 29 | `fedex_canada_volumetric_air_frt` ƒ | numeric(12,2) | · | GQ |
| 30 | `sea_c_frt_item` ƒ | numeric(12,2) | HE | GV |
| 31 | `sea_p_frt_item` ƒ | numeric(12,2) | HF | GW |
| 32 | `fedex_landed_air_cost` ƒ | numeric(12,2) | HI | GZ |
| 33 | `dhl_landed_volumetric_air_cost` ƒ | numeric(12,2) | HJ | HB |
| 34 | `canada_landed_volumetric_air_cost` ƒ | numeric(12,2) | · | HA |
| 35 | `landed_sea_cost` ƒ | numeric(12,2) | HK | HC |
| 36 | `landed_consolidated_sea_cost` ƒ | numeric(12,2) | HL | HD |
| 37 | `dhl_landed_vol_air_cost_sy` ƒ | numeric(12,2) | HM | HE |
| 38 | `dhl_landed_vol_air_cost_sy_2` ƒ | numeric(12,2) | HN | HF |

### 2.7 Margins — size-level because landed cost is (10)

| # | Column | Type | S27 | F26 |
|---|---|---|---|---|
| 39 | `air_cost_pct_of_selling_price` ƒ | numeric(7,4) | HB | GS |
| 40 | `sea_p_cost_pct_of_selling_price` ƒ | numeric(7,4) | HG | GX |
| 41 | `margin_fob_bali` ƒ | numeric(7,4) | HQ | · |
| 42 | `vol_air_margin_reps` ƒ | numeric(7,4) | IG | HN |
| 43 | `sea_margin_line_price` ƒ | numeric(7,4) | II | HQ |
| 44 | `sea_margin_reps` ƒ | numeric(7,4) | IJ | HR |
| 45 | `vol_air_margin_retail_x22` ƒ | numeric(12,2) | IO | HT |
| 46 | `vol_air_margin_retail_x225` ƒ | numeric(12,2) | IP | HW |
| 47 | `vol_air_margin_retail_x23` ƒ | numeric(12,2) | IQ | HX |
| 48 | `final_retail_price_override` **?** | numeric(12,2) | — | — |

Column 48 is the §7.4 answer: retail price is style-level for 90–99% of styles,
so it lives on `styles`, with this nullable override for the minority that
genuinely price by size. Strike it if you would rather force one price per style.

---

## 3. `style_colorways` — 5 columns, 1–11 rows per style

| # | Column | Type | S27 | F26 | Note |
|---|---|---|---|---|---|
| 1 | `id` | bigserial PRIMARY KEY | — | — | |
| 2 | `style_id` | bigint REFERENCES styles(id) ON DELETE CASCADE | — | — | |
| 3 | `ws_tag_color` | text NOT NULL | CL | CB | The colorway name |
| 4 | `whs_channel` | text | CM | CC | `000`/`SY`/`BOTH`; F26 adds `SO`,`CO`,`CN`. Measured colorway-level (varies 27%) |
| 5 | `reps_color` | text | CN | CD | |

`UNIQUE (style_id, ws_tag_color)`

---

## 4. `colorway_yarns` — 5 columns, 1–21 rows per colorway

Replaces 63 spreadsheet columns (`C1Y%`…`COLOR21`).

| # | Column | Type | Source | Note |
|---|---|---|---|---|
| 1 | `colorway_id` | bigint REFERENCES style_colorways(id) ON DELETE CASCADE | — | |
| 2 | `slot` | smallint NOT NULL | position | 1–21 |
| 3 | `color` | text NOT NULL | `COLOR{n}` | `YCA BREAKER WHITE - 658` |
| 4 | `percent` | numeric(7,4) | `C{n}Y%` | Source is a **fraction** (`0.8677`) — §7.6 |
| 5 | `ends` | numeric(5,2) | `C{n} ENDS` | |

`PRIMARY KEY (colorway_id, slot)`

---

## 5. `style_prices` — 9 columns, 2–3 rows per style

The market set differs completely between seasons, so markets are rows.

| # | Column | Type | Note |
|---|---|---|---|
| 1 | `style_id` | bigint REFERENCES styles(id) ON DELETE CASCADE | |
| 2 | `market` | text NOT NULL | `DIVERSE`·`EFSN`·`ELLIS` (S27) · `USA`·`CANADA` (F26) |
| 3 | `fob_price` | numeric(12,2) | S27 HR / HU / HX |
| 4 | `ws_margin` | numeric(7,4) | S27 HS / HV / HY |
| 5 | `discount_pct` | numeric(7,4) | S27 HT / HW / HZ |
| 6 | `line_price` | numeric(12,2) | F26 HG (USA) / HI (Canada) |
| 7 | `line_price_after_reps_commission` | numeric(12,2) | F26 HJ / HK |
| 8 | `vol_air_margin_line_price` | numeric(7,4) | F26 HM / HO |
| 9 | `reps_commission` | numeric(7,4) | S27 HO · F26 HN / HP |

`PRIMARY KEY (style_id, market)`

---

## 6. What changed from `columns.md`

Four placements moved once every column was variance-tested rather than reasoned
about. All four moved **to the more granular table**, which is the safe direction
(a child→parent move loses data; parent→child does not).

| Column | Was | Now | Evidence |
|---|---|---|---|
| `composition_care_label` | `styles` | `style_sizes` | Varies **98%** — the label embeds the size (`…GREY-XS`) |
| `packing_volume_sf` | `styles` | `style_sizes` | Varies **100%** |
| `ws_factory` | `styles` | `style_sizes` | Varies **100%** |
| `extra_charges_boxes` | `styles` | `style_sizes` | Varies **100%** |

And one rule emerged that `columns.md` did not state: **selling prices are
style-level, margins are size-level.** The price is one number for the style;
the margin depends on which size's landed cost you measure it against. That is
why §1.10 and §2.7 are separate blocks.

---

## 7. Still open — these block the migration

| § | Question | Recommendation |
|---|---|---|
| 7.1 | Store the **58 ƒ columns** (formula results), or omit them? | Store as entered. The app records the numbers; it does not compute them. |
| 7.2 | Key on `(season, style_name)` or `(season, style_number)`? | `style_number`, but F26's is only 90% filled — 10% of rows have none |
| 7.3 | `season`: store the label (`S27`), the code (`58`), or both? | Label; the code means nothing outside the sheet |
| 7.4 | Retail price by size? | `styles` + the nullable `style_sizes` override (col 48) |
| 7.5 | Sizes: fixed list or free text? | Fixed — `X/S · S/M · M/L · X/L` are the only real ones in either file |
| 7.6 | Yarn percent: fraction (`0.8677`) or percent (`86.77`)? | Percent — it is what a person types |
| 7.7 | `style_prices` as rows, or flat columns? | Rows |

**None of these are hard to change later except 7.1 and 7.4**, which decide
whether data gets *captured* at all. The rest are renames and conversions.

---

## 8. Totals

| Table | Columns | Rows per style |
|---|---|---|
| `styles` | 100 | 1 |
| `style_sizes` | 48 | ~4 |
| `style_colorways` | 5 | 1–11 |
| `colorway_yarns` | 5 | 1–21 per colorway |
| `style_prices` | 9 | 2–3 |
| **Total** | **167** | |

From 288 columns in the union of the two workbooks: **167 kept**, 121 dropped as
labels, worker names, stale notes and duplicates (`columns.md` §7).
