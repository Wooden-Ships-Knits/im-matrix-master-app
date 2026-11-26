# PDM — Product Data Management

Knitwear style master data for PT In Fashion — the application replacing the
`IM MASTER` Excel workbooks.

One row per style per season, with its colourways, yarn BOM, sizes, weights,
operations and prices. The costing is calculated from the season's rates, not
stored, and reproduces the workbook to six decimals.

PostgreSQL 16 · FastAPI · React 18 + Vite · Docker Compose, the same shape as
`wholesale-order-entry` and `ymal-project`.

---

## Running it

Two stacks, from the same compose file. The difference is one extra `-f`.

| | command | serves | banner |
|---|---|---|---|
| **Development** | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` | **:5174** (Vite) | red DEVELOPMENT band |
| **Production** | `docker compose --profile web up -d --build` | **:8086** (nginx) | none |

`docker compose up -d` on its own starts only the database and the API — no
website. The dev file has to be named explicitly, so a production machine
cannot pick it up by accident, and nginx sits behind a profile so a bare
`up -d` never serves a stale bundle.

### First time on a machine

```bash
cp .env.example .env
```

Then set these by hand — the app will not start without the first, and will
not let anyone in without the second:

| | |
|---|---|
| `POSTGRES_PASSWORD` | anything, it is internal to the compose network |
| `APP_PASSWORD` | the team password typed on the login page |

The Salesforce and Shopify keys are only needed to pull sales figures. Leave
them blank and everything else works.

---

### Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Open **http://localhost:5174**.

Starts `db`, `backend` and `web`. Three things differ from production:

- **the backend reloads** — `./backend` is bind-mounted and uvicorn runs with
  `--reload`, so editing `repo.py` takes effect in a second or two with no
  rebuild
- **Vite runs in a container**, so no Node is needed on the machine. Its
  `node_modules` is a named volume, not the host's: the host's are macOS
  binaries and the container is Linux
- **`APP_DEV=true`**, which draws the DEVELOPMENT band across every page. The
  two sites are identical to look at and only one of them holds data anyone
  relies on

nginx is not involved. Vite proxies `/api` and `/uploads` to the backend
itself.

If you would rather run Vite from your own Node:

```bash
docker compose up -d                  # database + API only
cd frontend && npm run dev            # http://localhost:5173
```

Same result on a different port. Leave it running in its own terminal.

---

### Production — the main server

```bash
docker compose --profile web up -d --build
```

Open **http://localhost:8086**, or whatever `IM_MASTER_WEB_PORT` says.

`--profile web` is what adds nginx. Without it you get the API and no site,
which is the single most common way to think the deploy failed when it did
not. The frontend is built inside its image, so **the site only changes when
that image is rebuilt** — `--build` is not optional after a frontend edit.

On the VM, nginx on the host reverse-proxies the public name to that port and
certbot holds the certificate. The container stack itself is identical to the
one above; nothing in this repo knows the domain.

Check what you actually got:

```bash
docker compose ps
curl -s localhost:8085/api/health      # {"status":"ok","dev":false,...}
```

`"dev": true` on a machine you think is production means the dev file was
left in the command.

---

### Rebuilding, and when you need to

| changed | needed |
|---|---|
| `backend/app/**` in **dev** | nothing — it reloads |
| `backend/app/**` in **production** | `docker compose up -d --build backend` |
| `frontend/src/**` in **dev** | nothing — Vite reloads |
| `frontend/src/**` in **production** | `docker compose --profile web up -d --build nginx` |
| a migration | restart the backend; `alembic upgrade head` runs at start |
| `.env` | `docker compose up -d` (recreates the containers) |

**Backend code is baked into its production image.** Restarting is not
enough — it will keep running the old copy and look like your edit did
nothing. In dev this cannot happen, because the source is mounted.

### When it is behaving oddly

```bash
docker compose exec backend grep -c "<something you just typed>" /app/app/repo.py
```

`0` means the container is running baked-in code, not your working tree — the
stack was started without the dev file. Bring it up again with both `-f`s.

A white screen on :8086 after a rebuild is usually a cached `index.html`
asking for a hashed asset that no longer exists. Hard-reload once;
`nginx.conf` already sends `no-store` for `index.html` and 404s a missing
asset rather than serving the SPA fallback in its place.

### Showing it to someone outside

```bash
cloudflared tunnel --url http://localhost:5174
```

It prints a `https://….trycloudflare.com` address, new every time.
**Public** — but the login page still stands in front of it, so they need the
password or the guest link. `allowedHosts: ['.trycloudflare.com']` is already
in `vite.config.js`; without it Vite refuses the request outright.

### Ports

Set in `.env`. 8085/8086 rather than the usual 8080/8084 because both were
taken on the development machine.

| | |
|---|---|
| 5174 | Vite, in the dev stack |
| 5173 | Vite, run from your own Node |
| 8085 | the API — loopback only |
| 8086 | the built site behind nginx |

### Getting in

Every page but the login needs a session. One team password, set as
`APP_PASSWORD`; **Continue as guest** gives a read-only Browse. The check is
on the server — guests are refused by the API, not by a hidden button.


---

## Layout

```
backend/
  app/            FastAPI: routers, repo.py (all the SQL), settings
  migrations/     Alembic, 0001..0020
  scripts/        importers and one-off seeds
frontend/src/
  pages/          Home, Login, Browse, StyleEditor, Matrix, Checklist,
                  Report, PrintSheet
  sections/       the style editor's tabs, and SheetCard — the one card
                  the Matrix screen and the printed sheet share
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
| Styles | 1,465 across S25, F25, S26, F26, S27 |
| Colourways | 3,578 |
| BOM lines | 8,461 |
| Operation minutes | 5,592 |
| Sales rows | 4,186, pulled from Salesforce and Shopify |
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

- **Photos.** 0 of 1,465. The print sheet is laid out for them, and the
  Matrix screen can take one by drag-and-drop onto a card.
- **Yarn prices per style.** 1 style is linked to a material, so
  `v_sku_costing` returns nulls for everything downstream of raw material
  cost. Weights, labour, admin, duty and freight all compute.
- **Season rates.** S27 onward are seeded; **S25, F25, S26 and F26 have
  none**, so costing returns nulls for those four seasons however complete
  the style is.
- **The eleven Matrix attribute columns** — they are editable on the Matrix
  screen but were never imported, so most cards print mostly blank rows.
- **Measurements and trims.** Both tables exist and both are empty.

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

- **Commit, never push** without being asked. Two remotes are configured:
  `origin` and `backup`. See `docs/github_SOP.md`.
- Migrations are explicit SQL, numbered, and never edited once applied.
- Calculated values live in `v_sku_costing`, never in a column. Change a rate
  on the season and every style follows.
- Reference lists teach themselves: a yarn or packing method typed once is
  offered next time, matched case- and whitespace-insensitively.
- Run from a local clone, not from the Google Drive folder — Drive's sync
  makes bind mounts unreliable (`caveats.md` §7).
