# IM Master — Backend

Draft for discussion. Follows the shape already running on the VM in
`wholesale-order-entry` and `ymal-project`: Postgres, FastAPI, nginx serving the
built SPA, one compose file.

---

## 1. Stack

```
FastAPI             HTTP API, request/response validation via Pydantic
Pydantic v2         the schema contract, shared with the frontend
psycopg 3           Postgres driver
Postgres 16         the data
Alembic             migrations — from day one, before there is data
pytest              tests
uvicorn             ASGI server
```

**Postgres, not SQLite.** The old app's single `.db` file was its own bottleneck:
one writer, one machine, and the file was the backup plan. Concurrent editing is
a stated requirement (`prd.md` §3), and Postgres is what the other stacks on the
VM already run — same backup tooling, same operational knowledge.

**Deliberately no ORM-heavy layer for v1.** The schema is stable and known;
psycopg with explicit SQL is easier to read and to debug than a mapping layer,
and this is the pattern the sibling projects use. SQLAlchemy Core is a reasonable
counter-argument for the BOM/measurement nesting — worth deciding in Phase 1,
not later.

---

## 2. Proposed layout

Mirrors `ymal-project/backend` so it is familiar:

```
im-master-app/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── alembic.ini
│   ├── migrations/
│   │   └── versions/          # schema history — the only way schema changes
│   ├── app/
│   │   ├── main.py            # FastAPI app, router mounting, CORS
│   │   ├── db.py              # connection pool, transaction() helper
│   │   ├── settings.py        # env → typed settings, no literals elsewhere
│   │   ├── schemas.py         # Pydantic models = the config contract
│   │   └── routers/
│   │       ├── health.py
│   │       ├── styles.py      # CRUD + search
│   │       ├── refs.py        # reference lists (seasons, yarns, ...)
│   │       └── uploads.py     # style photos
│   ├── im_master/
│   │   ├── validation.py      # the rules in logic.md §2
│   │   ├── persist.py         # style aggregate read/write, transactional
│   │   └── export.py          # season → xlsx/csv
│   ├── data/                  # uploads volume mount point — gitignored
│   └── tests/
├── frontend/                  # see frontend.md
├── docs/
└── docker-compose.yml
```

`app/` is transport — HTTP in, HTTP out. `im_master/` is the domain and knows
nothing about FastAPI. The split matters when the export job or a future
scheduled task needs the same rules without going through the API.

---

## 3. Schema

Normalized, one aggregate root. Field-level detail lives in `config-contract.md`
§3–§5 — this is the shape.

```
seasons ─┐
sizes ───┤
yarns ───┼─ reference tables. Small, self-teaching (§4).
collections ─┤
sub_groups ──┤
packing_methods ─┘

styles                    one row per style — the aggregate root
├── style_sizes           which sizes it comes in + finished weight (kg) each
├── colorways             colour combinations
│   └── bom_lines         yarn / percentage / ends, per colorway
└── measurements          point-of-measure value per (style, size, point)
```

Design notes:

- **The BOM hangs off the colorway, not the style.** Different colorways of one
  style use different yarns; that is the entire point of a colorway. The old app
  got this right and it is worth restating because it is the first thing anyone
  gets wrong when they see the Excel layout.
- **The BOM is not per size.** Same yarn composition across the size run; only
  the finished weight changes, and that lives in `style_sizes`.
- **Measurements are per (style, size, point).** A tall thin table, not a wide
  one. The Excel has one column per point per size, which is presentation, not
  structure.
- **Children cascade on delete.** Removing a style removes its colorways, their
  BOM lines, its sizes and its measurements. Nothing orphaned.
- **Future entities reference `styles(id)`** — suppliers, cost breakdowns,
  per-size prices. Nothing existing has to change to add them.

**Every schema change is an Alembic migration.** No hand-edited SQL against a
running database, including in development. This is cheap to adopt now, while
the database is empty, and painful to adopt later.

---

## 4. Reference lists that teach themselves

The single most-valued behaviour of the old app: a yarn, collection, sub group or
packing method typed once is saved and offered next time. It is what keeps
spelling consistent across a season, and consistent spelling is what makes the
data searchable at all.

Implemented as a `get_or_create` on the reference table, inside the same
transaction as the style save. Two rules:

- **Case- and whitespace-insensitive matching**, so `Merino`, `merino ` and
  `MERINO` resolve to one row. Store the first-seen form for display; match on a
  normalized key with a unique index on it.
- **Additive only.** Typing a new value never renames or deletes an existing one.
  Merging duplicates is a deliberate admin action, not a side effect of a typo.

Without normalization this feature is actively harmful — it turns every typo into
a permanent new dropdown entry, and the dropdown becomes the mess it was meant to
prevent. See `caveats.md` §3.

---

## 5. API surface

```
GET    /api/health                    liveness + db connectivity

GET    /api/styles                    search/list  ?season= &q= &colorway= &size= &status=
POST   /api/styles                    create — full aggregate in one payload
GET    /api/styles/{id}               read — full aggregate
PUT    /api/styles/{id}               update — full aggregate, optimistic lock
DELETE /api/styles/{id}               delete (cascades)
POST   /api/styles/{id}/duplicate     copy as the basis for a new style

GET    /api/refs                      every reference list in one call
POST   /api/refs/{kind}               add a value explicitly

POST   /api/styles/{id}/photo         multipart upload
GET    /api/export?season=S28         season → xlsx
```

**The style aggregate is read and written whole.** One `GET` returns the style
with its sizes, colorways, BOM lines and measurements nested; one `PUT` accepts
the same shape back. The editor is one screen with a Save button, so the API
matching that is simpler than a dozen sub-resource endpoints, and it makes the
transactional guarantee natural rather than something to coordinate.

The cost is payload size and lost-update risk. Neither is serious at this scale —
a style is kilobytes — and the lost-update case is handled in §6.

**`GET /api/refs` in one call** because the editor needs all of them before it can
render, and eight round trips to populate dropdowns is eight chances to be slow.

---

## 6. Concurrency

Two people editing the same style at the same time is expected, not exceptional.
Last-write-wins would silently discard someone's afternoon.

Optimistic locking: `styles.updated_at` (or a `version` integer) is returned on
read and sent back on write. If it no longer matches, the API returns **409
Conflict** and the frontend tells the user the record changed underneath them,
offering to reload.

Not pessimistic locks. A held lock in an office app becomes a stale lock the
moment someone closes a tab, and then someone has to go clear it.

---

## 7. Validation

Two layers, deliberately:

- **Pydantic** — shape, types, ranges. Rejects at the door, gives the frontend a
  field-addressed error list for free.
- **`im_master/validation.py`** — cross-field business rules (BOM totals, SKU
  uniqueness, size coherence). The rules themselves are in `logic.md` §2.

**Both run server-side regardless of what the frontend checks.** The frontend
duplicates some of these for fast feedback; that is a UX affordance, not the
enforcement point. Anything reaching the database goes through the API.

Every save runs inside one transaction (`app/db.py: transaction()`). A style is
saved completely or not at all — never a style row with half its colorways.

---

## 8. Files and uploads

Style photos go to a **named Docker volume** mounted at `/app/data/uploads`, not
into the image and not a bind mount onto the Google Drive folder (`caveats.md` §7).

- Validate content type and re-encode on upload; do not trust the extension.
- Cap size (8 MB was the old app's limit and was never hit).
- Store a generated filename, never the client's.
- The photo is part of the backup story — a `pg_dump` alone does not include it.

---

## 9. Deployment

One `docker-compose.yml` at the repo root, same shape as the siblings:

| Service | What |
|---|---|
| `db` | `postgres:16`, named volume `pgdata`, healthcheck via `pg_isready` |
| `api` | this backend, `uvicorn app.main:app`, waits on `db` healthy |
| `web` | built SPA behind nginx, proxies `/api` → `api` (`frontend.md` §5) |

Conventions carried over from `ymal-project`, each for a reason learned there:

- **Postgres connection parts passed separately**, never as a URL. A password
  containing `/` or `@` breaks URL parsing in ways that look like a host error.
- **`POSTGRES_PASSWORD` has no default** — `${POSTGRES_PASSWORD:?...}` so compose
  fails loudly rather than shipping a password that is public in a committed file.
- **Host port bound to `127.0.0.1`** only; the VM's own nginx terminates TLS.
  The port must be overridable (`IM_MASTER_WEB_PORT`) because that VM already
  runs several of these stacks and they cannot share one.
- **nginx resolves the API upstream through a variable**, so `web` boots even
  when `api` is not up yet — a literal `proxy_pass http://api:8000` refuses to
  start instead.
- **Run from a local clone, not from Google Drive.**

---

## 10. Backups

The data is in Postgres and the photos are in a volume. Both, or neither.

```bash
docker compose exec db pg_dump -U im_master im_master > im-master-$(date +%F).sql
docker run --rm -v im_master_uploads:/data -v "$PWD":/out alpine \
    tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```

**Restore is drilled in Phase 4, by someone who did not write the procedure.**
An untested backup is a belief, not a backup. This is the one operational thing
that must be written into the README rather than left in a doc.

---

## 11. Open questions

- Plain psycopg with SQL, or SQLAlchemy Core for the nested aggregate reads? (§1)
- `updated_at` timestamp or an explicit `version` integer for optimistic locking? (§6)
- Does the change history (`prd.md` should-have) need per-user identity? If yes,
  auth moves into Phase 2 — retrofitting identity onto an audit log is worse than
  building it in.
- Which host and which port (`IM_MASTER_WEB_PORT`)?
- What runs the backup — host cron on the VM, or whatever already backs up the
  sibling stacks? Reuse, do not invent.
- Export format: xlsx that mirrors the old IM MASTER layout, or a clean CSV?
  The first is more work and much more likely to be what the office wants.
