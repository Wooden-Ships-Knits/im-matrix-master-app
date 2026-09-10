# IM Master — The Config Contract

**Created 2026-09-10.** The agreement between the three layers.

This is the keystone of the project. Postgres stores this shape, FastAPI serves
it, the editor renders it. All three have to agree, so it gets designed **once,
before any of them is written** — `strategy.md` Phase 0.

Change it afterwards and you change a migration, a Pydantic model and a form
component, in that order, without missing one. Change it now and you edit a
document.

> **Status: proposal.** Field names and types below are a starting point drawn
> from the old app and the S27 Excel. The items marked ❓ are open — they are the
> same list as `logic.md` §6, and Phase 0 exists to close them.

---

## 1. What problem this solves

The Excel workbook has no contract. A column means what the last person to use
it thought it meant. `WHLS LINE PRICE` is a price in an unstated currency; a
blank cell might mean zero, unknown, or not-applicable, and there is no way to
tell which.

Writing the contract down first buys three things:

| Without it | With it |
|---|---|
| "Is weight in kg or g?" asked every few months | Stated once, in the type |
| Frontend and backend disagree, discovered in testing | One shape, both sides read this |
| A new field is added to the form and silently dropped | A new field is a migration + a model + a component |
| Blank means whatever you assume | `null` means "not entered", and that is written down |

---

## 2. Conventions

Rules that apply to everything below, so they are not repeated per field.

| Convention | Rule |
|---|---|
| **Naming** | `snake_case` everywhere — Postgres, JSON, Pydantic. No translation layer, no casing bugs. |
| **IDs** | `int` surrogate keys. Stable, and never shown to users. |
| **Null vs zero** | `null` = not entered. `0` = genuinely zero. They are different facts and the schema must let people say both. A blank cell in Excel could not. |
| **Empty string** | Never stored. Trimmed to `null` on the way in. |
| **Money** | `numeric(12,2)`, never float. ❓ currency — see §4. |
| **Measurements** | `numeric(6,2)`, centimetres. |
| **Weights** | `numeric(8,3)`, kilograms. Three decimals because a sweater is ~0.4 kg. |
| **Percentages** | `numeric(5,2)`, 0–100. Not fractions. |
| **Timestamps** | `timestamptz`, UTC, ISO 8601 in JSON. |
| **Text** | Postgres `text`. Length limits are a validation decision, not a storage one. |
| **Enums** | Postgres `text` + a `CHECK`, not a native enum type. Adding a value to a native enum is a migration with a lock; a CHECK is an easier change. |

---

## 3. The style aggregate

One `GET` returns this. One `PUT` accepts it back. This shape **is** the contract.

```json
{
  "id": 42,
  "version": 7,

  "season": "S28",
  "style_name": "AMERICAN DREAM CREW CHUNKY COTTON",
  "collection": "AMERICAN DREAM",
  "sub_group": "CREW",
  "status": "active",
  "photo_url": "/uploads/42-a1b2c3.jpg",

  "knit": {
    "gauge": "5GG",
    "stitch": "JERSEY",
    "construction": "FULLY FASHIONED",
    "notes": null
  },

  "prices": {
    "wholesale": "68.00",
    "retail": "159.00",
    "sample": "85.00",
    "sy_price": "159.00",
    "price_000": "44.50"
  },

  "packaging": {
    "packing_method": "POLYBAG",
    "units_per_carton": 12,
    "carton_length_cm": "60.00",
    "carton_width_cm": "40.00",
    "carton_height_cm": "35.00"
  },

  "shipping": {
    "gross_weight_kg": "9.500",
    "net_weight_kg": "8.200",
    "notes": null
  },

  "sizes": [
    { "size": "X/S", "finished_weight_kg": "0.380" },
    { "size": "S",   "finished_weight_kg": "0.400" },
    { "size": "M",   "finished_weight_kg": "0.420" }
  ],

  "colorways": [
    {
      "id": 101,
      "colorway_name": "NATURAL / CAMEL",
      "sku": "AD-CRW-NAT",
      "bom": [
        { "yarn": "MERINO 2/48", "percentage": "40.00", "ends": 2 },
        { "yarn": "COTTON 4/12",  "percentage": "60.00", "ends": 1 }
      ]
    }
  ],

  "measurements": [
    { "size": "X/S", "point": "CHEST",  "value_cm": "48.00" },
    { "size": "S",   "point": "CHEST",  "value_cm": "50.00" },
    { "size": "X/S", "point": "LENGTH", "value_cm": "62.00" }
  ],

  "created_at": "2026-09-10T08:00:00Z",
  "updated_at": "2026-09-10T09:12:00Z"
}
```

### Why it is shaped this way

**`version` is part of the contract, not an implementation detail.** It is read
with the style and sent back on save. Mismatch → 409 (`backend.md` §6). The
frontend must round-trip it, so it belongs in the document, visibly.

**Reference values appear as their string value, not their ID.** `"yarn":
"MERINO 2/48"`, not `"yarn_id": 17`. The client sends a string; the server does
`get_or_create` inside the save transaction (`backend.md` §4). This is what makes
the self-teaching dropdowns work — the editor never has to create a yarn as a
separate step before it can save a style.

**`measurements` is a flat list, not a nested grid.** The editor renders it as
points × sizes, but a nested object keyed by size would make "which points exist"
depend on which sizes do. Flat triples are sparse by nature, which is what the
data actually is (`logic.md` §2.4).

**`sizes` and `measurements` are siblings, both keyed by size string.** The
server checks that every measurement's size appears in `sizes`. Belt and braces:
the frontend also prevents it, but see `flow.md` §1.

**Money is a JSON string, not a number.** `"68.00"`, not `68.0`. JSON numbers are
floats in most parsers, and `0.1 + 0.2` in a price field is not a conversation
worth having. `numeric` in, string out, `Decimal` in Python.

**Groups (`knit`, `prices`, `packaging`, `shipping`) are 1:1 with the style** and
live in columns on `styles`. They are nested in JSON purely because that is how
the editor is sectioned, and a flat 40-key object is harder to read.

---

## 4. Field reference

### `styles`

| Field | Type | Required | Notes |
|---|---|---|---|
| `season` | ref → `seasons` | **yes** | `S27`, `S28` |
| `style_name` | text | **yes** | Trimmed. ❓ unique per season — hard or warning? |
| `collection` | ref → `collections` | no | |
| `sub_group` | ref → `sub_groups` | no | |
| `status` | `draft` \| `active` | **yes** | Defaults `draft` |
| `photo_url` | text | no | Server-generated path. ❓ one per style or per colorway |
| `gauge`, `stitch`, `construction`, `knit_notes` | text | no | Free text ❓ or reference lists? |
| `wholesale`, `retail`, `sample`, `sy_price`, `price_000` | numeric(12,2) | no | ❓ currency each |
| `packing_method` | ref → `packing_methods` | no | |
| `units_per_carton` | int | no | > 0 |
| `carton_*_cm` | numeric(8,2) | no | |
| `gross_weight_kg`, `net_weight_kg` | numeric(8,3) | no | |
| `shipping_notes` | text | no | |
| `version` | int | — | Server-managed |
| `created_at`, `updated_at` | timestamptz | — | Server-managed |

❓ **`sy_sale` is not in this table.** It existed in the old app, sourced from no
Excel column, and was always empty. Starting with an empty database is the moment
to not carry it. Add it back only if someone asks for it.

### `style_sizes`

| Field | Type | Required |
|---|---|---|
| `style_id` | FK → styles, cascade | yes |
| `size` | ref → `sizes` | yes |
| `finished_weight_kg` | numeric(8,3) | ❓ no — see `logic.md` §2.2 |

Unique on `(style_id, size)`.

### `colorways`

| Field | Type | Required |
|---|---|---|
| `style_id` | FK → styles, cascade | yes |
| `colorway_name` | text | yes |
| `sku` | text | no — ❓ composed by rule or externally assigned |

Unique on `(style_id, colorway_name)`.

### `bom_lines`

| Field | Type | Required |
|---|---|---|
| `colorway_id` | FK → colorways, cascade | yes |
| `yarn` | ref → `yarns` | yes |
| `percentage` | numeric(5,2) | yes |
| `ends` | int > 0 | yes |

Percentages within a colorway total 100 (❓ tolerance — `logic.md` §2.3).

### `measurements`

| Field | Type | Required |
|---|---|---|
| `style_id` | FK → styles, cascade | yes |
| `size` | ref → `sizes` | yes |
| `point` | ❓ text or ref → `measurement_points` | yes |
| `value_cm` | numeric(6,2) | yes |

Unique on `(style_id, size, point)`.

---

## 5. Reference lists

```json
GET /api/refs
{
  "seasons":         ["S27", "S28"],
  "sizes":           ["X/S", "S", "M", "L", "X/L"],
  "yarns":           ["MERINO 2/48", "COTTON 4/12"],
  "collections":     ["AMERICAN DREAM"],
  "sub_groups":      ["CREW", "VNECK"],
  "packing_methods": ["POLYBAG"]
}
```

Every list, one call — the editor cannot render a dropdown until it has them.

| List | Self-teaching | Seeded |
|---|---|---|
| `seasons` | yes | no |
| `sizes` | **no** — admin action only | **yes**, by migration |
| `yarns` | yes | no |
| `collections` | yes | no |
| `sub_groups` | yes | no |
| `packing_methods` | yes | no |

**Sizes are the exception** and the reason is structural: they are the columns of
the measurement grid. A free-typed `Med` beside an existing `M` produces a style
whose measurements cannot be compared to any other (`logic.md` §3).

Each reference row stores a **normalized key** (lowercased, whitespace-collapsed)
with a unique index on it, plus the first-seen display form. That is what makes
`Merino`, `merino ` and `MERINO` one entry instead of three.

---

## 6. Errors

One shape, so the frontend has one handler.

```json
{
  "error": "validation_failed",
  "message": "BOM percentages must total 100%",
  "fields": [
    { "path": "colorways.0.bom", "message": "Totals 96.00%, must be 100%" }
  ]
}
```

| Status | `error` | When |
|---|---|---|
| 400 | `validation_failed` | Domain rule broken (`logic.md` §2) |
| 404 | `not_found` | No such style |
| 409 | `version_conflict` | Someone else saved first |
| 422 | `invalid_payload` | Pydantic — shape or type wrong |
| 413 | `file_too_large` | Photo over the cap |

**`path` is dot/index-addressed into the request document**, so the editor can
put the message on the field that caused it without a lookup table
(`frontend.md` §4).

---

## 7. Environment

`.env` at the repo root. **Gitignored, always** (`github_SOP.md` §6).

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_DB` | `im_master` | |
| `POSTGRES_USER` | `im_master` | |
| `POSTGRES_PASSWORD` | **none** | `${...:?}` — compose fails loudly if unset. Never a default: a default in a committed file is a public password. |
| `POSTGRES_HOST` | `db` | Passed as parts, never a URL — a password containing `/` breaks URL parsing in ways that look like a host error |
| `POSTGRES_PORT` | `5432` | |
| `IM_MASTER_WEB_PORT` | `8083` ❓ | Host port, bound to `127.0.0.1` only. Must be overridable — the VM runs several of these stacks and they cannot share a port. ❓ 8083 is taken by `wholesale-order-entry`; pick another. |
| `MAX_UPLOAD_MB` | `8` | |
| `UPLOAD_DIR` | `/app/data/uploads` | Named volume, not a bind mount (`caveats.md` §7) |

---

## 8. Changing this contract

1. Change this document first, and say why in `memory.md`.
2. Alembic migration.
3. Pydantic model in `backend/app/schemas.py`.
4. Form section in `frontend/src/sections/`.

In that order. A field that exists in three of the four is a bug that presents as
data quietly disappearing on save.

---

## 9. Open

Every ❓ above. Consolidated in `logic.md` §6 — that is the Phase 0 checklist.
