# IM Master

Knitwear style master data for PT In Fashion — the application replacing the
`IM MASTER` Excel workbooks.

One row per style per season, with its colourways, yarn BOM, sizes, weights,
operations and prices. The costing is calculated from the season's rates, not
stored, and reproduces the workbook to six decimals.

PostgreSQL 16 · FastAPI · React 18 + Vite · Docker Compose, the same shape as
`wholesale-order-entry` and `ymal-project`.

---

## Running it

You need Docker Desktop running, and a `.env` — copy `.env.example` and set
`POSTGRES_PASSWORD`.

```bash
docker compose up -d                  # database + API
docker compose --profile web up -d    # + the built frontend
```

| | where | notes |
|---|---|---|
| Built app | http://localhost:8086 | what other people would see |
| API | http://localhost:8085 | loopback only |
| Dev server | http://localhost:5173 | `cd frontend && npm run dev` |

Work on the frontend through the dev server — it reloads as you save and
proxies `/api` to the backend. The built copy on 8086 only changes when its
image is rebuilt:

```bash
docker compose --profile web up -d --build nginx
```

**Backend code is baked into its image.** After editing anything under
`backend/app/`, restarting is not enough:

```bash
docker compose up -d --build backend
```

Ports are 8085/8086 rather than the usual 8080/8084 because both were already
taken on the development machine. They are set in `.env`.

---

## Layout

```
backend/
  app/            FastAPI: routers, repo.py (all the SQL), settings
  migrations/     Alembic, 0001..0009
  scripts/        importers and one-off seeds
frontend/src/
  pages/          Home, Browse, StyleEditor, Report, PrintSheet
  sections/       the style editor's tabs
docs/             the reasoning — start with schema.md and identity.md
*.xlsx            the five source workbooks (gitignored)
```

`repo.py` holds every query. There is no ORM: the schema is the source of
truth and the SQL is written against it.

---

## The data

Loaded from the five workbooks in the project root:

| | |
|---|---|
| Styles | 1,462 across S25, F25, S26, F26, S27 |
| Colourways | 3,577 |
| BOM lines | 8,461 |
| Operation minutes | 5,592 |
| Products (the cross-season identity) | 1,049, of which 267 run in more than one season |

To reload after editing a workbook:

```bash
/usr/bin/python3 backend/scripts/import_season.py --all
docker compose exec backend python -m scripts.link_products
```

Both are idempotent — re-running only changes what moved. `--season S27` does
one season, `--dry-run` prints the first style instead of writing.

Use `/usr/bin/python3` for the scripts that read workbooks. The Homebrew
Python on the development machine has a broken `pyexpat`.

### Not loaded

- **Photos.** 0 of 1,462. The print sheet is laid out for them.
- **Yarn prices per style.** 1 style is linked to a material, so
  `v_sku_costing` returns nulls for everything downstream of raw material
  cost. Weights, labour, admin, duty and freight all compute.
- **Sales figures.** The Sales History sheet is built and empty. The numbers
  exist in `web-apps/services` report type `sales`.
- **Season rates** beyond the weight rates: only S27 is fully seeded.

---

## Scripts

| | |
|---|---|
| `import_season.py` | the workbooks into the database |
| `link_products.py` | give every style a product, matching exact names |
| `extract_weight_rates.py` | read tolerance and distribution rates out of each workbook |
| `seed_s27.py` | S27 reference data — rates, operations, materials |
| `sheet.py` | the workbook reader the others share |

`sheet.py` finds every column by **header name**, never by letter. Between
S26 and S27, 251 of 254 headers were identical but only 7 were still in the
same column. It also refuses to guess when a name sits on two populated
columns, because S27 has two called `FINAL RETAIL PRICE` that disagree on
3,872 rows.

---

## Documentation

`docs/` carries the reasoning rather than the code:

- `schema.md` — the tables, and why each one exists
- `identity.md` — why a stable key is the point of the project
- `season-drift.md` — what changes between seasons, measured
- `caveats.md` — what will bite
- `prd.md`, `strategy.md` — scope and phases

---

## Conventions

- **Commit, never push.** There is no remote configured, deliberately.
- Migrations are explicit SQL, numbered, and never edited once applied.
- Calculated values live in `v_sku_costing`, never in a column. Change a rate
  on the season and every style follows.
- Reference lists teach themselves: a yarn or packing method typed once is
  offered next time, matched case- and whitespace-insensitively.
- Run from a local clone, not from the Google Drive folder — Drive's sync
  makes bind mounts unreliable (`caveats.md` §7).
