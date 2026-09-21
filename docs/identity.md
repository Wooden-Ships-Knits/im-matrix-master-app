# Style identity — the reason for the project

**Created 2026-09-21.** Why a stable key is the point, and what has to be
recorded to make cross-season reporting possible.

---

## 1. The problem, as stated

A style released in a past season comes back. Between those releases:

- the **style name** can change, and it is still one style;
- the **name can stay the same while the SKU changes**;
- a **colour tag can be substituted** — Cornish Blue swapped for Indigo Coast on
  a particular style because yarn volume ran short — and both must count as one
  colour in a report.

Any sales report covering a date range that spans two seasons is wrong unless
these are resolved. That is the reason for the database, not a side benefit.

---

## 2. What the four workbooks show

### 2.1 Style names and numbers both drift

| | Carried-over styles | Keep the number | Renumbered |
|---|---|---|---|
| F25 → F26 | 116 | 102 | **14** |
| S26 → S27 | 91 (by number) | — | **27 renamed** (30%) |

Neither the name nor the number is reliable on its own. `HATHAWAY CREW COTTON`
keeps `#537` across two seasons; `FAYE TIPPED TOP COTTON` keeps its name and
moves `#535 → #193`; `LEOPARD L/S CREW LIGHTWEIGHT` keeps `#134` and becomes
`LEOPARD CREW LIGHTWEIGHT`.

And the SKU cannot help, because it **contains the season number** by
construction: the same style is `K56C3W868-…` in S26 and `K58C3W868-…` in S27
(`schema.md` §10).

### 2.2 Colour tags churn far more than styles do

Measured on styles that carry over from one season to the next:

| | Carried styles | Colour tags before → after | Same tag | Dropped | New |
|---|---|---|---|---|---|
| F25 → F26 | 94 | 236 → 247 | 108 | 128 | 139 |
| S26 → S27 | 62 | 207 → 171 | 82 | 125 | 89 |
| F26 → S27 | 26 | 113 → 121 | 59 | 54 | 62 |

**Roughly half to two-thirds of a carried style's colour tags do not survive the
season** — 54%, 60% and 48%.

Some of that is ordinary: new colours every season is normal in fashion. But the
files give no way to tell a *new colour* from a *renamed or substituted* one.
That distinction exists only in someone's memory.

### 2.3 Substitutions are real, scoped to a style, and almost never recorded

I scanned every shared string in all four workbooks — roughly 17,000 data rows —
for substitution language (`SUB`, `SUBSTIT`, `GANTI`, `PENGGANTI`, `REPLACE`,
`TUKAR`).

**Exactly one match, in four seasons:**

```
YCA INDIGO - 860 (INDIA SEA SUB)
```

And it behaves exactly as described. In S27:

| Style | Yarn | Tag colour |
|---|---|---|
| **SAWYER STRIPED RAGLAN CREW CHUNKY COTTON** | `YCA INDIGO - 860 (INDIA SEA SUB)` | INDIGO STRIPE |
| FLAG BACK BUTTON CARDI CHUNKY COTTON | `YCA INDIA SEA - 965` | INDIA SEA FLAG |
| FLAG RAGLAN CHUNKY COTTON | `YCA INDIA SEA - 965` | DARKEST INDIGO |
| HUDSON STRIPED TOP COTTON | `YCA INDIA SEA - 965` | INDIA SEA/BREAKER WHITE |

**One style was substituted. Three kept the original yarn.** India Sea → Indigo
applies to Sawyer and to nothing else — which is the rule: a substitution names
the styles it affects, and it can name more than one, but never all of them.

Three things follow:

1. **It is recorded as free text inside the yarn name.** Not a field, not a date,
   not a reason — a note in parentheses that happens to survive.
2. **It is recorded once.** One note across four seasons and ~17,000 rows. The
   other substitutions left nothing at all.
3. **The history cannot be reconstructed from the files.** It exists only if it
   is captured when someone makes the change.

### 2.4 A substitution happens to the yarn; the reporting damage is at the tag

Sawyer's yarn changed from `YCA INDIA SEA - 965` to `YCA INDIGO - 860`. Its tag
colour is `INDIGO STRIPE` — and the tag is what goes into the SKU, and therefore
into the sales file.

So a substitution has two separate effects:

| | Changes | Effect |
|---|---|---|
| **Yarn** | always | costing changes — different yarn, possibly different price |
| **Tag colour** | sometimes | **if the tag changes, the SKU changes, and sales split in two** |

A substitution where the tag is left alone is invisible to sales and visible to
costing. One where the tag is renamed is the opposite problem. Both need
recording, and they are not the same event.

## 3. What that means for the design

### 3.1 Colour identity must be scoped to the style, never global

India Sea was substituted **for Sawyer**. Flag Back Button Cardi, Flag Raglan and
Hudson Striped Top kept it (§2.3).

So a global "India Sea = Indigo" alias table would be **wrong** — it would merge
two genuinely different colours on the three styles that never changed.

Identity belongs on `product_colorways`, scoped to one product. The substitution
is then a statement about *that* style's colourway, not about a colour name.

### 3.2 A rename and a substitution are not the same event

| | Rename | Substitution |
|---|---|---|
| What happened | same yarn, new label | **different yarn**, because supply ran short |
| Physically | identical | not identical |
| In a sales report | one line | one line |
| In a production or costing report | one line | arguably two |

Both roll up to one product colourway for sales. But the *reason* has to be
recorded, because costing and production may legitimately want them apart.

### 3.3 Events, not just current values

Storing only today's name answers "what is it called now". It cannot answer
"what was it called when that order was placed" — which is exactly what a sales
file from last season contains.

So the change itself is the record.

---

## 4. The tables

```
products                    the stable identity — what sales merges on
  id · product_code · display_name · status · first_season_id · notes

product_colorways           colour identity WITHIN a product, across seasons
  id · product_id · canonical_name · notes

styles                      one per season (existing table, gains product_id)
  + product_id

style_colorways             one per season (existing table, gains the link)
  + product_colorway_id

product_identifiers         every label this product has ever carried
  id · product_id · product_colorway_id · kind · value · season_id
  · first_seen · last_seen
  kind ∈ style_name | style_number | style_code | sku | ws_tag_color

identity_events             the change log — one row per affected thing
  id · notice_id · occurred_on · season_id · kind
  · product_id · product_colorway_id
  · from_value · to_value · tag_changed · reason · recorded_by
  kind ∈ renamed | renumbered | sku_changed | colorway_renamed
       | yarn_substituted | merged | split

substitution_notices        the decision itself — one notice, many styles
  id · issued_on · season_id · from_yarn_id · to_yarn_id · reason · issued_by
```

`product_identifiers` answers **"which product is this sales row?"**
`identity_events` answers **"what happened, when, and why?"**

**Why a notice *and* events.** A substitution is one decision — "India Sea is
short, use Indigo" — that names the styles it affects. Sometimes one, sometimes
several, never all. So the notice is the header and the events are its lines:

```
notice #41  2026-08-14  INDIA SEA → INDIGO      reason: yarn volume short
   ├── SAWYER STRIPED RAGLAN CREW CHUNKY COTTON · INDIGO STRIPE   tag_changed: yes
   └── (any other style named on the same notice)
```

That keeps one decision visible as one decision, while still recording it per
style — which is what makes it safe to roll up for sales and keep apart for
costing.

### How a sales row resolves

```
sales row:  K56C3W868-DARKEST INDIGO/BREAKER WHITE-X/S
                │
                ├── style code  K56C3W868  →  product_identifiers  →  product_id
                ├── colour tag  DARKEST INDIGO/BREAKER WHITE
                │                          →  product_identifiers  →  product_colorway_id
                └── size        X/S
                                           ↓
                   aggregate by product_id across every season
```

Because the SKU is *generated* from fields we store, the app can rebuild any past
season's SKU and match old sales rows without a hand-maintained mapping
(`schema.md` §10).

---

## 5. Two consequences worth being honest about

**The value starts when people start using it.** The substitution history isn't
in the files (§2.3), so it cannot be backfilled. Everything from the first day of
use forward is traceable; everything before is only as good as what can be
reconstructed by hand.

**Linking carry-overs is a human judgement.** "Is this last season's Rihanna?"
cannot be decided reliably by string matching — 30% renamed, 12% renumbered. The
app should *suggest* (same number, similar name, same base body, the existing
`SIMILAR & REPEAT PRICE` note) and a person should confirm. One click per
carry-over style, roughly 37% of a range.

That is the honest cost, and it buys a sales report that is right across seasons.

---

## 6. Open

1. When a colour is substituted mid-season, should the **old tag remain
   sellable** on stock already made, or is it replaced everywhere at once?
   Decides whether the old tag stays active or is closed off by date.
2. Should a substitution ever be reported **separately** for costing, given the
   yarn genuinely differs?
3. Do two styles ever **merge** into one product, or one **split** into two? The
   event kinds are there, but I have not seen a case in the files.
4. How far back should the link go — S26 only, or the whole `Collection` archive
   on PTIF SERVER, which runs to 2006?
