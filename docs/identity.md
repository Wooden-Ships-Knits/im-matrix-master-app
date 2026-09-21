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

### 2.3 The substitution leaves no trace at all

I looked for the Cornish Blue → Indigo Coast case across all four seasons.

| | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| Styles with a Cornish tag | 1 | 9 | 0 | 3 |
| Styles with an Indigo Coast tag | 1 | 5 | 17 | 12 |

**Not one style shows Cornish in one season and Indigo Coast in the next.** Both
names are in use in overlapping seasons, on different styles.

The likely explanation fits what you described: the substitution happens
**inside** a season, when the yarn runs short. The IM cell is simply edited, so
the sheet ends up holding only the final value. The change is not recorded
anywhere — not as a second row, not as a note.

**This is the finding that matters most.** The history cannot be reconstructed
from the files, however carefully. It only exists if it is captured at the moment
someone makes the change.

---

## 3. What that means for the design

### 3.1 Colour identity must be scoped to the style, never global

Cornish Blue was substituted *for a certain style*, because that style's yarn ran
out. Other styles kept using Cornish Blue — S27 still has three.

So a global "Cornish Blue = Indigo Coast" alias table would be **wrong**. It
would merge two genuinely different colours everywhere else.

Identity belongs on `product_colorways`, which is scoped to one product.

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

identity_events             the change log
  id · occurred_on · season_id · kind · product_id · product_colorway_id
  · from_value · to_value · reason · recorded_by
  kind ∈ renamed | renumbered | sku_changed | colorway_renamed
       | colorway_substituted | merged | split
```

`product_identifiers` answers **"which product is this sales row?"**
`identity_events` answers **"what happened, when, and why?"**

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
