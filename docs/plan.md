# IM Master — Build Plan

**Created 2026-09-10.** Backend only. **Nothing here is built yet.**

> **This document is a proposal awaiting confirmation.** No table is created, no
> code is written, until the decisions in §5 are answered. When they are, §6 is
> the build order.

**Scope of this round:** the backend — Postgres table, FastAPI write/read path.
The UI is acknowledged as the hard part and is explicitly **not** in this round
(§8). `docs/flow.drawio` exists but is currently **0 bytes**, so it did not feed
into this plan; if it is meant to, it needs to be saved/synced first.

---

## 1. What the app does

A user enters the details of a sweater. It is stored in the database.

That is genuinely the whole thing, and the plan should not make it sound like
more. The difficulty is not the storing — it is that "the details of a sweater"
is **255 columns** in the current spreadsheet, and getting a person through
those 255 fields quickly is a UI problem, not a database problem.

---

## 2. What I found in the source files

Read: `IM to Sales Force/ex/S27 IM MASTER.xlsx` and `.../F26 IM MASTER.xlsx`.

| | S27 | F26 |
|---|---|---|
| Sheet | `S27` | `F26` |
| Header row | **57** | **54** |
| Columns in header | **255** | **235** |
| Last row | 4137 | 8438 |
| Data rows (have a DESCRIPTION) | 4063 | 8367 |
| Yarn/colour slots | **C1…C21** | **C1…C18** |
| Rows per style (avg) | 3.7 | 3.8 |
| Most colorways on one style | 11 | 11 |

### 2.1 The grain of a row

**One spreadsheet row = one (style × size × colorway) combination.** Confirmed
by reading rows 58–74 of S27:

```
r58  ALEX STRIPED CREW COTTON - X/S   BREAKER WHITE/MYKONOS   C1 86.8% 1end YCA BREAKER WHITE-658 …  0.216 kg
r59  ALEX STRIPED CREW COTTON - X/S   KHAKI/BREAKER WHITE     C1 86.8% 1end YCA KHAKI-749 …          0.216 kg
r61  ALEX STRIPED CREW COTTON - S/M   BREAKER WHITE/MYKONOS   …                                      0.240 kg
r64  ALEX STRIPED CREW COTTON - M/L   …                                                              0.264 kg
r67  ALEX STRIPED CREW COTTON - X/L   …                                                              0.290 kg
```

One style, 4 sizes, 2 colorways → 8 rows, plus blank spacer rows. Every
style-level attribute (construction, care label, gauge, tension, all pricing)
is **repeated identically on all 8**. That repetition is the spreadsheet's core
problem, and it is the thing a database is supposed to remove.

### 2.2 Column letters are not stable across seasons ⚠️

The single most important finding. Comparing the two header rows:

- **7** columns share both letter and name.
- **224** columns have the same letter but a **different** name.
- **184** columns exist in both files at **different letters** — e.g.
  `DESCRIPTION` is `I` in S27 and `K` in F26; `CONSTRUCTION` is `N` vs `Q`.
- **47** columns exist only in S27, **31** only in F26.

The old `im-master/extract_seed.py` hardcoded column letters (`col(row,'IC')`
for wholesale price). Against these files that mapping is off by two columns and
would silently read the wrong field — not crash, just import wrong numbers.

**Consequence for us:** any import or comparison must map by **header name**, and
must locate the header row by scanning rather than assuming 57. Never by letter.

### 2.3 F26 and S27 are not the same shape

F26 carries a whole **Canada** pricing track that S27 has no equivalent of:
`WHLS LINE PRICE - USA`, `WHLS LINE PRICE - CANADA`, `DUTY TO CANADA`,
`FEDEX CANADA VOLUMETRIC AIR FRT / ITEM`, `CANADA LANDED VOLUMETRIC AIR COST`,
and the reps-commission variants of each. S27 has 21 colour slots where F26 has 18.

So the seasons differ in **business content**, not just layout. The table has to
hold the union, and be able to grow — which means adding a column must be a
routine migration, not an event.

### 2.4 `DESCRIPTION` is overloaded and cannot be parsed reliably

Size is embedded in the description after a dash: `ALEX STRIPED CREW COTTON - X/S`.
But splitting on that dash across the whole sheet gives **14 distinct "sizes" in
S27 and 51 in F26**. Only four are sizes:

```
real sizes  : X/S · S/M · M/L · X/L
also found  : 000 ONLY · BOTH WHS · SHOPIFY ONLY · FAH · FAF · SY ONLY · BOTH …
```

The suffix is sometimes a size and sometimes a sales-channel marker. That is why
the style count above (1113 for S27) is inflated — one style splits into several
whenever its suffix varies.

**Consequence for us:** in the new table, `style_name`, `size` and the channel
flags are **separate columns**, entered separately. Never one string to be parsed.

### 2.5 Other things the data does

- **Percentages are stored as fractions** — `0.8677`, not `86.78`. Decide one
  convention and apply it (§5.4).
- **Blank spacer rows** appear inside the data (17 in S27, 5 in F26).
- **Error values** live in cells: `#VALUE!`, `#DIV/0!`, `#REF!`.
- Rows 1–56 above the header are a **scratch area** — lookup tables for yarn
  prices, duty categories, container dimensions, exchange rates, plus long
  free-text notes. Not data; not to be imported.
- Many columns are **formula results** (margins, landed costs, duty). Whether
  those are stored or computed is §5.5 — a real decision, not a detail.

---

## 3. The table — recommendation

You said: one table with many columns. I want to flag one thing before agreeing,
because it pulls against the UI goal you named.

### 3.1 The tension

A single table at the spreadsheet's own grain (style × size × colorway) means a
style with 4 sizes and 5 colorways is **20 rows**, and every style-level field —
construction, care label, gauge, all ~120 pricing and costing columns — is
duplicated across all 20. Then:

- Changing one price is an update to 20 rows. Miss one and the style disagrees
  with itself, exactly as the spreadsheet does today.
- The data-entry screen either makes the user enter it 20 times, or fans one
  form out to 20 rows behind the scenes — and at that point the fan-out logic is
  the schema, just written in Python instead of in tables.

That directly costs the efficient UI you want.

### 3.2 What I propose instead

**One wide table, but one row per style** — plus three small child tables for the
things that genuinely repeat.

```
styles                  ← THE wide table, ~150 columns, one row per style
├── style_sizes         ← 4-ish rows per style   (size + 8 weight columns)
├── style_colorways     ← 1-11 rows per style    (colorway name + flags)
└── colorway_yarns      ← 1-21 rows per colorway (yarn, percent, ends)
```

`styles` still holds everything that describes the style itself — identity,
construction, finishing, production, packaging, box, duty, freight, costing,
pricing, margins. That is where the "many columns" live, and there are a lot of
them. The three children exist only because the source data proves those three
things repeat: sizes 4×, colorways up to 11×, yarn slots up to 21×.

**Why this is still "one wide table" in spirit:** the user fills in one style,
one screen, one save. The children are not extra work for the user — they are
the size row and the colorway rows that the screen already has to collect.

**What it buys:** entering a style writes ~1 + 4 + 5 + 15 rows instead of
20 near-identical 255-column rows; changing a price is one UPDATE; and the 63
mostly-empty `C1Y%…COLOR21` columns collapse into a child table with a real row
per yarn instead of 63 columns that are null for a solid-colour sweater.

### 3.3 If you prefer the pure single table

It is a legitimate call — it mirrors the Excel exactly, and "the app writes what
the spreadsheet had" has real value for anyone comparing the two. If you want
that, say so in §5.1 and I will plan it that way instead. The cost is §3.1, and
I would want the entry screen to fan out one form into many rows so the user
never types anything twice.

### 3.4 Column groups in `styles`

From the S27 header, the ~150 style-level columns group as:

| Group | Source cols (S27) | Roughly |
|---|---|---|
| Identity | A–F, I | cat, season, content, gauge, style, number, name |
| Channel flags | G, H, K, L, M | WHS, CC-W, SY, do-not-sell-in-SY, need mal |
| Construction | N–V | construction, care label, logo label, details, lining, total ends, gauge, tension, colour sequence |
| Finishing & labour | CX–GG | vendor, minutes per pc, embroidery, crochet, per-operation prices, QC steps |
| Spec & packaging | DO–EO | spec dates, hang tag, bagging, packing method, ship via, box L/D/H, pcs per box, plastic and box weights, volumetric |
| Costing | GH–GQ | total cost, admin, labels, receiving in Bali, extra charges, packaging fee |
| Duty & customs | GR–GY | duty category, tariff category, duty rate, duty tax, fees |
| Freight | GZ–HN | DHL air, volumetric air, sea, landed costs |
| Pricing & margin | HO–JG | FOB Bali, Diverse, Ellis, European distributor, wholesale line price, reps, discounts, retail, sample, markup |

Plus F26's Canada track (§2.3) as additional columns.

**I have not written the final column list yet** — that is the first build step
(§6.1), and it needs §5's answers first.

---

## 4. Table sketch

Illustrative, not final. Conventions from `config-contract.md` §2 still apply:
`numeric` never `float` for money and weights, `null` ≠ `0`, `snake_case`.

```sql
CREATE TABLE styles (
    id                  bigserial PRIMARY KEY,
    season              text NOT NULL,          -- 'S27', 'F26'
    style_name          text NOT NULL,          -- WITHOUT the size suffix (§2.4)
    style_number        text,
    cat                 text,
    content             text,
    gauge_code          text,
    style_type          text,

    whs                 text,                   -- '000' / 'SY' / 'BOTH'
    sell_in_sy          boolean DEFAULT true,
    shopify_only        boolean DEFAULT false,

    construction        text,
    composition_care    text,
    logo_label          text,
    details             text,
    lining              text,
    total_ends          numeric(6,2),
    gauge_full          text,
    tension             text,
    color_sequence      text,

    -- … ~120 more: finishing, packaging, box, duty, freight, costing, pricing
    -- full list is build step §6.1

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    version             integer     NOT NULL DEFAULT 1,
    UNIQUE (season, style_name)                 -- ⚠️ confirm, see §5.2
);

CREATE TABLE style_sizes (
    style_id            bigint REFERENCES styles(id) ON DELETE CASCADE,
    size                text NOT NULL,          -- X/S · S/M · M/L · X/L
    pre_component_wt    numeric(8,4),
    distribution_wt     numeric(8,4),
    finished_kgs_item   numeric(8,4),
    wt_low_tolerance    numeric(8,4),
    wt_high_tolerance   numeric(8,4),
    PRIMARY KEY (style_id, size)
);

CREATE TABLE style_colorways (
    id                  bigserial PRIMARY KEY,
    style_id            bigint REFERENCES styles(id) ON DELETE CASCADE,
    ws_tag_color        text NOT NULL,          -- 'BREAKER WHITE/MYKONOS'
    whs                 text,
    reps_color          text,
    UNIQUE (style_id, ws_tag_color)
);

CREATE TABLE colorway_yarns (
    colorway_id         bigint REFERENCES style_colorways(id) ON DELETE CASCADE,
    slot                smallint NOT NULL,      -- 1..21
    color               text NOT NULL,          -- 'YCA BREAKER WHITE - 658'
    percent             numeric(7,4),           -- convention: §5.4
    ends                numeric(5,2),
    PRIMARY KEY (colorway_id, slot)
);
```

---

## 5. Decisions I need before building

**These are the blockers. I will not start until they are answered.**

### 5.1 Shape — one wide table, or wide + 3 children?

§3. My recommendation is wide `styles` + `style_sizes` + `style_colorways` +
`colorway_yarns`. Your call; the alternative is a single table at
style×size×colorway grain.

### 5.2 What identifies a style?

The sketch uses `UNIQUE (season, style_name)`. Is that right, or is
`style_number` (`#` — 795, 796) the real key? In S27, `#` looks like the actual
style identifier and the name is the label. **If `#` is the key, say so** — it
changes the unique constraint and the lookup path.

### 5.3 Which columns actually matter?

255 columns exist. I doubt all 255 are worth entering by hand — many are
formula outputs, and some are notes to one person. **Which groups from §3.4 does
the user actually type?** If the answer is "identity, construction, colorways,
sizes, packaging" and the rest is derived or rarely touched, the table gets much
smaller and the UI gets much better. This is the highest-value question here.

### 5.4 Percentage convention

Source stores `0.8677`. Store as fraction (`0.8677`) or as percent (`86.77`)?
Pick one; I will apply it everywhere and validate against it.

### 5.5 Stored or computed?

Margins, landed costs, duty tax and most pricing are **formula results** in the
spreadsheet. Three options, and they are very different projects:

| Option | Meaning |
|---|---|
| **Store as entered** | The app is a record of what the user typed. Simplest. No formulas to reimplement. |
| **Compute in the app** | The app reimplements the spreadsheet's formulas. Powerful, and a much bigger job — the rate tables in rows 1–56 become part of the system. |
| **Store now, compute later** | Columns exist and hold entered values; formulas added afterwards. |

**My recommendation: store as entered for this round.** Reimplementing pricing
formulas is its own project and a wrong number reaches a customer quote.

### 5.6 Sizes — fixed or free?

X/S, S/M, M/L, X/L are the real four (§2.4). Fixed list, or can a style have a
different size run?

### 5.7 Does S27/F26 data get imported?

`prd.md` says start empty and that still stands as far as I know. These files
were read as the **specification**, not as an import source. Confirm that is
still the intent — if an import is wanted, it is a separate phase and §2.2 makes
it harder than it looks.

---

## 6. Build order — once §5 is answered

Each step ends somewhere checkable.

**6.1 — Column list.** Extract all 255 S27 + 235 F26 headers, map by name, merge
into one list, mark each: keep / drop / derived. Produce a table of
`column_name · type · source · required`. Reviewed **before** any SQL.
*Done when:* the list is agreed and every kept column has a type.

**6.2 — Migration.** Alembic baseline creating the tables from 6.1.
*Done when:* `alembic upgrade head` builds it from empty, `downgrade` reverses it.

**6.3 — Compose.** `db` + `api` services, `.env`, healthcheck, `/api/health`
answering with DB connectivity. Per `backend.md` §9 — password parts passed
separately, no default password, named volumes.
*Done when:* `docker compose up -d --build` from a clean local clone works.

**6.4 — Write path.** `POST /api/styles` accepting one style with its sizes,
colorways and yarns, in **one transaction**.
*Done when:* a style with 4 sizes, 3 colorways and multi-yarn BOM round-trips
identically; a payload that fails halfway leaves nothing behind.

**6.5 — Read path.** `GET /api/styles/{id}`, and `GET /api/styles` with filters
for season, name, colorway, size.
*Done when:* what 6.4 wrote comes back in the same shape.

**6.6 — Update + delete.** `PUT` with the optimistic-lock check
(`backend.md` §6), `DELETE` cascading to children.
*Done when:* a stale write is refused with 409 rather than overwriting.

**6.7 — Real styles.** Enter 10–15 real S27/F26 styles through the API, chosen
to be awkward — the 11-colorway `MAGGIE V COTTON`, a 21-slot BOM, a style with
missing pricing.
*Done when:* all 15 go in without a schema change. **If one does not fit, the
schema is wrong and we fix it here, not later.**

---

## 7. What this changes in the other docs

`config-contract.md` was written before these files were read. It proposes a
normalized schema with a `styles` table of ~25 columns and a generic `bom_lines`
child. This plan supersedes it on two points, **pending your confirmation**:

- The real column count is ~150–255, not ~25.
- Colour/yarn slots are numbered 1…21 and carry a `COLOR` string like
  `YCA BREAKER WHITE - 658`, not a plain yarn name.

Once §5 is settled I will update `config-contract.md` to match, so there is one
description of the schema rather than two. `logic.md`'s eleven UNCONFIRMED rules
still stand; §5 here answers four of them (5.2 → name uniqueness, 5.4 →
percentage convention, 5.6 → sizes, and 5.5 touches pricing).

---

## 8. Not in this round

- **The UI.** Named as the hard part and deliberately deferred. Worth saying
  plainly: entering 255 fields through a web form will be *slower* than the
  spreadsheet unless the screen is designed for speed — keyboard-first, no
  re-typing across sizes and colorways, paste from Excel. That is a real design
  job, and §5.3 is the question that shrinks it most.
- Importing S27/F26 data (§5.7).
- Reimplementing pricing formulas (§5.5).
- Photos, export, change history, auth.

---

## 9. Open

- `docs/flow.drawio` is **0 bytes**. If it holds the intended flow, save/sync it
  and I will fold it in.
- Is `F26 IM MASTER.xlsx` the newer file? It has more rows (8438) and the Canada
  pricing track, which suggests the schema is still growing. If Canada is the
  direction of travel, those columns are not optional extras.
- Which of the two files is the better model for the table — S27 (the plan is
  written from it) or F26 (bigger, newer, has Canada)?
