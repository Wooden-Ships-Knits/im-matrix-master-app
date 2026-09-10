# IM Master — Frontend

How office staff actually do the work. Draft for discussion.

---

## 1. Stack

```
React 18 + Vite       same as ymal-project/frontend and the old im-master
nginx                 serves the built SPA, proxies /api to the backend
```

No UI framework by default. The old app was hand-rolled CSS and that was the
right call for a form-heavy internal tool — a component library brings a design
language we then spend time overriding. Revisit only if the editor's complexity
argues for it.

**No client-side state library in v1.** There is one server resource per screen.
`useState` plus a fetch wrapper (`src/api.js`) is the whole requirement, and the
old app proved it.

---

## 2. Screens

| Route | Screen | Purpose |
|---|---|---|
| `/` | **Home** | Landing. Season picker, recent styles, "Add style" |
| `/browse` | **Browse** | Search and filter, results list, open / duplicate / delete |
| `/new` | **Style editor** | Create |
| `/edit/:id` | **Style editor** | Edit — the screen that matters |

Three screens. The editor is the product; the other two exist to get you to it.

---

## 3. The style editor

One screen, one Save button, sectioned. **Not a wizard.** Editing a style is
rarely a linear pass — someone opens it to fix one price, and a multi-step flow
makes that a five-click journey.

| Section | Contents |
|---|---|
| **Identity** | Season, style name, collection, sub group, status (draft/active), photo |
| **Sizes** | Which sizes this style comes in; finished weight (kg) per size |
| **Colorways** | One block per colorway, each containing its own **yarn BOM** (yarn, %, ends) |
| **Knit details** | Gauge, stitch, construction notes |
| **Prices** | Wholesale, retail, sample, and the SY / 000 variants |
| **Packaging** | Packing method, units per carton, carton dimensions |
| **Shipping** | Carton weights, cube, shipping notes |
| **Measurements** | Point-of-measure grid — points down, sizes across |

Sections are collapsible and remember their state per user, so someone who only
ever touches prices is not scrolling past the BOM every time.

### What the editor must get right

- **Sizes drive the rest of the screen.** Ticking a size adds its column to the
  measurements grid and its row to the weights table. Unticking it warns before
  discarding the data underneath (`logic.md` §2.4).
- **BOM percentage total shown live**, per colorway, next to the lines. Green at
  100%, red otherwise. Do not make someone add up four numbers to find out why
  Save was refused.
- **The measurement grid is a grid**, entered with the keyboard. Tab moves across
  sizes, Enter moves down points. Anyone entering a full size run with a mouse
  will go back to Excel, and they will be right to.
- **Add-a-colorway duplicates the previous colorway's BOM** as its starting point.
  Colorways of one style usually share most of their yarn lines.
- **Combobox for every reference list** — type to filter, and a new value typed
  is accepted and remembered (`backend.md` §4). Free typing plus memory is the
  behaviour to preserve; a locked dropdown that requires an admin to add a yarn
  will be worked around within a week.

---

## 4. Interaction rules

- **Unsaved-changes warning on navigate away.** The editor is a long form.
  Losing it once is enough to lose a user.
- **Validation errors land on the field**, with a summary at the top listing
  which sections have problems, each a link. A long form scrolled past the error
  is a form that looks like it silently failed.
- **Save is explicit.** No autosave in v1 — half-entered styles must not become
  real records, and the transactional save (`backend.md` §7) depends on the
  payload being complete.
- **409 on save** → tell the user plainly that someone else changed this style,
  and offer to reload. Never silently overwrite, never silently discard.
- **Optimistic nothing.** Show the saved state after the server confirms it.
  This is master data; a row that looks saved and is not is worse than a spinner.
- **Delete confirms**, naming the style, and says what goes with it — colorways,
  BOM, measurements.

---

## 5. Serving

```
frontend/
├── Dockerfile          multi-stage: vite build → nginx
├── nginx.conf          SPA fallback + /api proxy
├── index.html
├── vite.config.js      dev proxy /api → localhost:8000
└── src/
    ├── main.jsx
    ├── App.jsx         routes
    ├── api.js          every HTTP call, in one place
    ├── styles.css
    ├── pages/          Home · Browse · StyleEditor
    ├── sections/       Identity · Sizes · Colorways · Bom · Knit ·
    │                   Pricing · Packaging · Shipping · Measurements
    └── components/     combobox · toast · confirm · numeric input · grid
```

nginx serves the built assets and proxies `/api` to the `api` container, so the
browser sees one origin and there is no CORS in production. **The upstream is
resolved through a variable** so `web` starts even when `api` is down — it then
shows "not connected" instead of failing to boot (`backend.md` §9).

`src/api.js` is the only file that knows a URL. Everything else calls functions.

---

## 6. Design requirements

- **Density over decoration.** This is a data entry tool used all day. Compact
  rows, small margins, real tables. Generous whitespace costs scrolling, and
  scrolling costs adoption.
- **Numeric inputs behave numerically.** Right-aligned, no spinners, decimal
  separator consistent with what staff type, paste from Excel works.
- **Keyboard-first.** Tab order follows visual order. Every action reachable
  without a mouse.
- **Legible at 1366×768.** That is the office laptop, not a 27" display.
- **Loading and empty states are explicit.** With an empty database on day one,
  the empty state is the *first* thing anyone sees — it must say "no styles yet,
  add one", not render a blank page that looks broken.
- **Accessibility basics** — real labels tied to inputs, focus visible, errors
  announced. Mostly free if the markup is honest.

---

## 7. Open questions

- Is Indonesian-language UI wanted, or is English fine? Worth asking before the
  strings are written rather than after.
- Which browser and screen size do office machines actually have?
- Is there a print or PDF view of a style — a tech-pack-like sheet? The office
  may currently print from Excel, in which case this is a real requirement
  hiding behind "export".
- Photo: one per style, or per colorway? Per colorway is more useful and more
  work, and it changes the schema — so it belongs in Phase 0, not here.
- Should Browse show a thumbnail grid as well as a list? Visual browsing may
  matter more than search for people who know the season by sight.
- Shared login or per-user? It changes the header, and it gates the change
  history (`prd.md` open question 8).
