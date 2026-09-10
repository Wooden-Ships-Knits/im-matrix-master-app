# GitHub SOP — im-master-app

**Repo:** ⚠️ **TBD — not decided yet (2026-09-10).** See §2.

---

## 1. Current standing instruction

> **Commit locally. Do not push.**
>
> As of 2026-09-10 there is no agreed remote, and pushing is explicitly on hold.
> Work is committed to the local repository only. Everything in §3 onward applies
> from the moment a remote is agreed — until then, stop after `git commit`.

This is not a permanent rule, it is where the project currently stands. When the
remote question in §2 is answered, update this section and delete it.

---

## 2. The remote — open

Two options, neither chosen:

| Option | For | Against |
|---|---|---|
| **`Wooden-Ships-Knits/im-master-apps`** — the existing repo | Already exists; the old app pushed there once ("first push"); `docs/memory.md` is already headed *IM-MASTER-APPS* | Contains the old Node/SQLite app. This is a rebuild on a different stack, so the history mixes two unrelated codebases |
| **A new repo** | Clean history for a clean rebuild | One more repo; the old one becomes an orphan nobody archives |

**Leaning: a new repo**, with the old one archived and its README pointing here.
This project shares a problem domain with `im-master`, not a codebase — different
language, different database, different deployment. Mixing them makes `git log`
misleading forever.

Worth ten minutes of agreement before the first push, because it is close to
irreversible afterwards.

---

## 3. Branch model

```
main                          ← production. never pushed to directly.
 └── feat/dev-environment     ← integration branch. everything lands here first.
      ├── feat/phase1-backend-skeleton
      ├── feat/phase2-style-api
      └── feat/<whatever>
```

| Branch | Rule |
|---|---|
| `main` | **Never commit or push directly.** Only receives merges from `feat/dev-environment`, and only when it is stable. |
| `feat/dev-environment` | Integration branch. All feature work merges here first. This is what we break, not `main`. |
| `feat/<name>` | One branch per unit of work. Branched from `feat/dev-environment`, merged back into it. |

**The rule in one line:** every push goes to a `feat/*` branch, and reaches `main`
only by way of `feat/dev-environment`.

---

## 4. Naming

```
feat/<short-kebab-description>
```

Examples:

```
feat/phase0-schema-contract
feat/phase1-backend-skeleton
feat/style-editor-measurements-grid
fix/bom-percentage-tolerance
docs/config-contract-update
```

Keep it short and descriptive. The phase number helps when it applies.

---

## 5. Daily workflow

### Start work

```bash
git checkout feat/dev-environment
git pull origin feat/dev-environment

git checkout -b feat/phase1-backend-skeleton
```

Always branch **from** `feat/dev-environment`, never from `main`.

### While working

```bash
git add <files>
git commit -m "feat: postgres schema and alembic baseline migration"
```

Commit message prefixes:

| Prefix | Use |
|---|---|
| `feat:` | new capability |
| `fix:` | bug fix |
| `docs:` | documentation only |
| `refactor:` | restructure, no behavior change |
| `chore:` | deps, config, tooling |

### Push

```bash
git push -u origin feat/phase1-backend-skeleton
```

⚠️ Blocked until §2 is resolved.

### Merge into the integration branch

```bash
git checkout feat/dev-environment
git pull origin feat/dev-environment
git merge feat/phase1-backend-skeleton
git push origin feat/dev-environment
```

Or open a PR targeting `feat/dev-environment` — preferred when someone else
should look at it first.

### Clean up

```bash
git branch -d feat/phase1-backend-skeleton
git push origin --delete feat/phase1-backend-skeleton
```

---

## 6. Promoting to main

Only when `feat/dev-environment` is stable and tested.

```bash
git checkout main
git pull origin main
git merge feat/dev-environment
git push origin main
```

Prefer a PR (`feat/dev-environment` → `main`) so the diff gets a read before it
lands.

**Before promoting, confirm:**

- [ ] `docker compose up -d --build` works from a clean local clone
- [ ] Migrations run forward from an empty database
- [ ] Tests pass
- [ ] No secrets in the diff (§8)
- [ ] Docs updated if behavior changed — especially `config-contract.md`
- [ ] `memory.md` checkpoint written if a phase completed

---

## 7. First-time setup

To be run **once**, after §2 is decided.

```bash
cd im-master-app

git init
git remote add origin <REMOTE — see §2>

# confirm .env is ignored BEFORE the first commit
git status --short | grep -q '\.env$' && echo "STOP — .env is not ignored"

git add .
git commit -m "chore: project scaffold and docs"

git branch -M main
git push -u origin main

git checkout -b feat/dev-environment
git push -u origin feat/dev-environment
```

After this, `main` is never touched directly again.

### Recommended: protect main on GitHub

Settings → Branches → Add rule for `main`:

- Require a pull request before merging
- Do not allow direct pushes

This makes the SOP enforced rather than remembered.

---

## 8. Secrets

**Never commit:**

- `.env` — it holds `POSTGRES_PASSWORD`
- Access tokens, client secrets, API keys
- Database dumps — they are the data, not code
- `credentials/` service-account JSON

Before any first push to a new branch:

```bash
git diff --cached | grep -iE 'password|secret|api_key|token|POSTGRES_'
```

**If a secret is ever committed:** rotate it immediately. Removing it in a later
commit does **not** help — it stays in the history and the repo is what leaked.
For `POSTGRES_PASSWORD` that means changing it in Postgres and in every `.env`.

> ⚠️ A live-looking token was found committed in a sibling project
> (`Collection VO Automatic Sort/Setup/set_sy.py`, trailing comment). It should
> be rotated. Do not repeat that pattern here.

---

## 9. What not to commit

`.gitignore` covers these, but for clarity:

- `.env`
- `backend/data/` — uploads and local artifacts
- `*.sql`, `*.dump` — database dumps. Regenerable, and they *are* the data
- `__pycache__/`, `.venv/`, `.pytest_cache/`
- `node_modules/`, `frontend/dist/`
- `.DS_Store` — macOS and Google Drive both scatter these
- `.ipynb` — notebooks (per existing team convention)

**`frontend/dist/` is gitignored on purpose.** The old app committed a pre-built
`dist/` so an office machine could run it without a build step. Here the build
happens in the frontend Dockerfile, so a committed `dist/` would only ever be a
stale copy that occasionally gets served instead of the real one.

---

## 10. Quick reference

```bash
# new work
git checkout feat/dev-environment && git pull
git checkout -b feat/<name>

# save + share
git add . && git commit -m "feat: ..."
git push -u origin feat/<name>          # ⚠️ on hold — see §1

# land it
git checkout feat/dev-environment && git pull
git merge feat/<name> && git push origin feat/dev-environment

# never
git push origin main        # ✗
git commit  (while on main) # ✗
```
