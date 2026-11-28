# PDM — Versions

Newest first. A version is cut when the project changes phase, not on a schedule.

---

> **A gap in this file.** It records v0.1 and then nothing until v1.1. The app
> was designed, built, loaded with real data and shown to the team in between,
> and none of that was written down here — read the git log for `v1.0`
> (2026-11-24) and the commits around it instead. v1.1 begins **after the two
> `hide features` commits** of 2026-11-26, the point at which the rebuild
> started being walked through with the team one screen at a time.

---

## v1.1c — the SY-AV sheet, and a photo per colour

**2026-11-28** · base `3bb336f` · commit hash to be filled in

Another letter rather than v1.2. It is still the walkthrough: two things
that were hidden come back, and the sheet the team asked for next gets
built. The next whole number is for the next phase — rename this if the new
sheet feels like one.

### Added

**The SY-AV Matrix**, a third sheet beside Matrix Master and Pricing Matrix.
The Master sheet shows a garment; this shows what is available to sell on
SY, which is a *colour*. Columns are styles, in the Master sheet's own order
and numbering, so a column here is the same column there; down each column
are that style's SY colours, one framed photo each.

- **The colour's own channel decides, not the style's.** A garment sold both
  ways can have one colour that only goes to wholesale, and that colour is
  not on SY. `SY ONLY` and `BOTH` are on the sheet; `000 ONLY` is not.
- **A colour with no channel recorded is left off by default**, because
  nobody has said it sells on SY. That is every one of the 3,582 imported
  colourways, so a tick box shows them — and the sheet labels each one
  *channel not set* rather than passing silence off as an answer. Without
  the box the sheet opens empty and reads as broken rather than unfilled.
- Read-only except for the photos. Everything else about a colour is edited
  where it is edited — the Matrix card and the style editor — and a third
  place to change it would be a third place to disagree.
- The columns scroll sideways. A season runs to sixty styles and no screen
  is sixty columns wide. Every cell is the same height, so the rows line up
  across the sheet without any cell knowing about its neighbours.

**A photo per colourway.** `style_colorways.photo_url` (migration
`0033_colorway_photo`), beside `styles.photo_url` and not instead of it.

- **The main photo is the first colourway's photo.** That is the colour the
  team shoots, so for that one colour the style's picture is not a stand-in,
  it is the answer — it shows on the SY-AV sheet and in the editor when the
  first colour is picked. Every other colour shows its own or shows none: a
  picture of the garment in BREAKER WHITE says nothing about KHAKI.
  (`colorwayPhoto`, in the new `photo.js`.)
- **First means first in the STYLE's list**, not first on the sheet drawing
  it. The SY-AV sheet filters to the colours sold on SY, and if the first
  colourway is 000-only then the colour at the top of that sheet is the
  second one — which the main photo is not of.
- The Add / Replace button says what it will do to the **colour**, not what
  is on screen. The first colour shows the garment's photo and still has
  none of its own, so it reads *Add photo*.
- Uploaded from two places, as asked: click a frame on the SY-AV sheet, or
  pick the colour from the dropdown above the photo in the style editor.
- Same uploads volume, same resize, same immutable random name as a style
  photo — the two routes now share one `_store` helper so they cannot drift.
- **The colour travels as a query parameter, not a path segment.**
  "KHAKI/BREAKER WHITE" is an ordinary colourway name, and a `%2F` inside a
  path is normalised or refused by proxies and servers before any route
  sees it. Tested against a real slash-bearing colourway.
- Named, not numbered: `save_style` deletes and re-inserts the colourway
  rows on every save, so an id the browser held would be stale by the time
  it uploaded. For the same reason `photo_url` is **carried** across that
  rewrite and never read from the payload — the editor has no field for it,
  and a save that took it from the form would blank every colourway photo
  the moment an older client saved.
- `matrix_rows` gains `colorway_photos` and `colorway_channels`, both
  colour → value maps with the unset colours simply absent.

### Changed

- **Narrowing a style to one channel takes its colours with it.** Tick the
  style down to SY ONLY or 000 ONLY and every colourway is set to the same
  thing — every colour of an SY-only garment sells on SY, and ticking that
  out fourteen times by hand is how a column stays empty.
  - **Widening back to BOTH does not blanket them with BOTH.** BOTH is not
    a fact about a colour just because it is one about the garment. It puts
    back what each colour was before the narrowing, so a misclick costs
    nothing. Clearing both boxes restores too: "nobody has said" is as
    un-single-channel as BOTH is.
  - A colour edited **by hand after** the narrowing keeps that edit. Only
    colours still holding exactly what the cascade gave them are put back —
    a typed answer outranks a remembered one.
  - Narrowing twice keeps the **first** memory. SY ONLY, then 000 ONLY,
    then BOTH lands on what was there before any of it.
  - The memory lives in the open editor, not the database, and a save or
    loading another style drops it. Nothing records what a colour's channel
    used to be, and keeping it across styles would widen one style's
    colours against another's.
  - The rule is `cascadeChannel` in `channel.js`, pure and keyed by
    colourway name. The editor calls it **outside** the state updater: it
    returns a memo to keep, and an updater that writes a ref runs twice
    under StrictMode — the second pass would see the memory spent and hand
    back the unrestored list, so widening would silently do nothing in
    development.
  - **This is what will finally fill `whs_channel`** for colours somebody
    touches. For the rest, see below.
- **A colour of a one-channel style now READS as that channel**, without
  anything being written. The cascade only fires when somebody clicks the
  style's boxes, which does nothing for the 3,582 colourways already in the
  database under styles that were already SY ONLY — and nobody is going to
  open 301 styles to click a box confirming what the style already says.
  - `effectiveChannel` in `channel.js`: a blank colour inherits a SY ONLY
    or 000 ONLY style's channel, because there is nowhere else for it to
    go. A style on BOTH, or with no channel, settles nothing — those leave
    the question genuinely open. A colour that states its own channel keeps
    it, contradiction and all.
  - The editor's boxes and the SY-AV sheet both read it, so the **702
    colours of the 301 SY-only styles are on that sheet already**, without
    the toggle and without a backfill.
  - **It is a reading, not a write.** The column stays blank until somebody
    clicks. Pinned both ways: the editor never sends an inherited value as
    though the colour had stated it, and the server has no fallback either.
  - On a one-channel style **both** colourway boxes are now fixed, not just
    the barred one — there is no exception a colour could be, and a tick
    that springs straight back is worse than one that cannot be clicked.
    A disabled box that is ON keeps its full weight; fading a ticked box
    would read as "off and unavailable", the opposite of what it means.
- **Every photo frame now behaves the same way.** Double-click opens the
  style; hovering brings up an **Add photo** button. The Matrix card
  already worked like this — the Pricing Matrix card had the double-click
  but no way to add a picture, and the SY-AV cell had neither: the whole
  frame was the file picker, so a single click anywhere on a photo threw up
  a dialog nobody asked for.
  - The Pricing Matrix uploads the **style's** photo — the same
    `styles.photo_url` the Matrix card and the printed sheet draw, through
    the same route. Not a third way in.
  - The SY-AV cell uploads that **colour's** photo, as before.
  - Both buttons appear on hover **and on keyboard focus**: a control that
    exists only under a pointer cannot be reached by tab. Neither prints.
  - `.pmx-photo-add` and `.sy-add` are their own classes rather than reuses
    of the Matrix card's `.sheet-photo-add` — the card's frame is twice the
    size and its button is sized for it. The shared look is written once so
    the two small ones cannot drift.
  - The pill clips inside its frame rather than pushing out of it: the
    Pricing Matrix runs twelve cards across a page, so the narrowest frame
    is about 118px.
  - **Every file input is hidden with the `hidden` attribute**, not with a
    class. One hidden only by the project stylesheet renders as the native
    "Choose File | No file chosen" across the middle of the photo the
    moment that stylesheet is late, missing or overridden — which is what
    the Pricing Matrix did on its first outing, because the dev server's
    watcher had missed the CSS. `hidden` is the browser's own
    `display: none` and needs nothing loaded. Pinned across all four files
    that have one.
- **Color Board is back on the front door**, as the third card — renamed
  from Color Table, and pointing at **color-board.pt-infashion.com** rather
  than at PDM's own `/colors` screen. The colour work lives in its own app
  for now.
  - An `<a href>`, not a router `<Link>`. A `<Link>` aimed at an address
    the router does not own goes nowhere at all, silently.
  - Same tab: it is a destination, not something looked up beside what you
    were doing, and the front door has no unsaved work to come back to.
  - `/colors` is untouched and still opens if you type it. The card is
    simply not the way there any more.
- **Pricing Matrix is no longer hidden.** The tab and the line under it are
  back; the route always worked. Nothing else was hidden on that screen.
- **On the Pricing Matrix, LINE is now WHS, and a SALE row sits under
  RETAIL.** The row was called Line while the column behind it is
  `whls_line_price_usd` and the style editor's Pricing section calls the
  same figure Wholesale — two names for one number on two screens is how
  somebody types it into both.
  - SALE needed no new column and no migration: `final_sale_price_usd`
    already exists, `matrix_rows` already selects it, the editor already
    edits it as *Sale Price*, and `_MATRIX_MONEY` already lets the sheet
    write it. It had simply never been on the sheet, next to the retail
    price it is marked down from. Empty on all 1,467 styles so far.
- **The finishing picker says what FAF and FAH stand for.** Finishing at
  factory and finishing at home. It read "FAH — take home", which sounds
  like a perk rather than like where the work is done. The 0006 migration
  had it right all along; only the screen was wrong, and a test now holds
  the two in step.
- **In the style editor, the dropdown above the photo now picks the photo.**
  It already chose which colourway's yarns to show; it now also chooses
  which picture the pane draws, and the button says which one it is about
  to replace — "Change photo of AZURE SLATE", not "Change photo".
  - The first option is **Main photo — the garment**, and it is the
    default. Defaulting to the first colour would make every style in the
    database look as though its photo had gone, because no colourway photo
    exists yet.
  - **A consequence worth knowing:** the yarn list under the dropdown is
    tied to the selected colour, so it is no longer showing when a style
    opens. One click brings it back. Say if it should default the other way.
  - Colourway photos upload **after** the save, not on pick: a colour typed
    in this sitting has no row to attach to until the save creates it.
- **One long colourway list no longer stretches a whole collection.** The
  main band is padded so the red rule under it is straight; the figure used
  to be the tallest band in the *block*, so a style with fourteen colourways
  left every card in its collection with a column of blank rows — rows above
  it included, which that style is nowhere near and never seen beside.
  - It is now the tallest band in the **grid row**, which is the only place
    the rule has to be straight: the cards you can see side by side.
  - That needs the column count, and the track is `repeat(auto-fill,
    minmax(160px, 1fr))` — the browser's decision, not the stylesheet's. A
    new `SheetGrid` reads it off the laid-out element (`getComputedStyle`'s
    `grid-template-columns` resolves to one entry per column) and watches it
    with a `ResizeObserver`.
  - **So the rule re-aligns when the grid rewraps.** That is the trade, and
    it is the right way round: a rule straight across a row you can see
    beats one straight across a collection you have to scroll. The old code
    chose the other way on purpose, and the comment saying so is replaced.
  - The observer watches the grid's box, so taller cards fire it too.
    Setting state only on a *changed* count is what keeps that from looping.
  - Before the first measurement every card asks for its own height and none
    is padded — the safe thing to draw for one frame.
- `sheet` in the URL now carries whichever sheet is not the default, rather
  than naming `pricing`, so all three can be linked to.

### Deleted

Nothing.

### Not done

**No ply or CHUNKY chip on the SY-AV cells.** The workbook puts one on every
picture, and it looks derived from the style name — CHUNKY if the name says
chunky, otherwise "1 PLY". The app has `styles.ply`, and it is **null on
1,463 of 1,467 styles**, so a chip drawn from the data would be blank almost
everywhere, and a chip drawn from the name would be a guess baked into the
sheet. Say which it should be and it is a few lines.

### Tests

9 under *the red rule lines up with the row, not the collection*:
`rowMainRows` groups a block of five into rows of three and of two and takes
the tallest in each, treats a width wider than the block as the old
whole-block figure, pads nothing before the grid has been measured, and does
not trip on an empty block. Plus four on the wiring — Matrix works out no
per-collection figure any more, each card gets its own row's, the count is
measured rather than assumed, and an unchanged count sets no state.
Mutation-tested by taking the tallest in the block again and by dropping the
unmeasured guard — three pins failed.

14 under *SY-AV shows a colour, not a garment*: the filter keeps SY ONLY and
BOTH and drops 000 ONLY, the toggle adds only what is UNSAID and never what
was ruled out, an all-unset sheet is empty by default, the page offers three
sheets with master left out of the URL, the Pricing tab is back, the upload
route keeps the colour out of the path and the client encodes it into the
query, and a save carries `photo_url` over without ever reading it from the
payload. Mutation-tested by making the filter accept any stated channel and
by dropping `photo_url` from the save's carry-over — five pins failed.

7 under *the main photo is the first colour's photo*: the first colour
falls back to the garment's picture and no other colour does, a colour's
own always wins, a style with no photo gives nothing away, the sheet asks
the style's own list rather than its filtered column, and Add vs Replace is
decided by the colour's own photo. Mutation-tested by letting every colour
borrow the garment's, and by taking "first" from the sheet instead of the
style.

4 under *a hidden file input is hidden by the browser*: every file input
in the app carries the attribute, not just a class.

12 under *every photo frame behaves the same way*: all three frames open
the style on a double-click and carry their own add button, the SY-AV frame
is no longer the file picker itself, both new buttons show on hover and on
focus, neither prints, and the pricing card uploads the style photo rather
than inventing a route. Mutation-tested by giving the pricing button the
Matrix card's class.

5 under *the front door*: the colour app's address is written once, the
card is an anchor rather than a router Link, it says Color Board, nothing
on the page still points at the built-in screen, and `/colors` is still
routed. Mutation-tested by making it a `<Link>`.

12 under *a colour of a one-channel style inherits it*: the inheritance
fires for SY ONLY and 000 ONLY and for neither BOTH nor unset, a colour's
own word always wins, the SY-AV sheet reads it the same way, nothing is
written on either side of the wire, and the settled box is fixed rather
than offering a choice that is not there. Mutation-tested by letting BOTH
leak through the inheritance and by making the settled box clickable again.

16 under *narrowing a style takes its colours with it*: the cascade sets
every colour and remembers each one exactly, widening to BOTH or to nothing
restores rather than blankets, a hand edit after the narrowing survives
(including when it happens to match what the restore would write), a second
narrowing keeps the first memory, widening with nothing outstanding does not
even rebuild the list, a style with no colourways is not an error, a colour
added during the narrowing goes back to nothing said, and the editor
cascades outside the state updater. Mutation-tested three ways — blanketing
on widen, letting the second narrowing overwrite the memory, and restoring
over hand edits — nine pins failed between them.

10 under the pricing sheet's existing block: the stack reads FAF/FAH, WHS,
Retail, Sale, FAF/FAH, NO X/L in that order, nothing still says Line, Sale
is the column the editor calls Sale Price, and **every money row's key is
one `_MATRIX_MONEY` accepts** — a row on this card is editable, so a key
the server would not take is a blur that silently fails. Mutation-tested by
giving the Sale row a plausible-but-wrong key, which the cross-check caught.
Three of the ten are the finishing picker: it spells both letters out, it
says the same as the migration that made the column, and no "take home"
survives anywhere it is drawn.

One existing pin was updated rather than added: the URL assertion named
`pricing`, and there are three sheets now.

**538 passing in all**, `npx vite build` clean.

The backend was exercised against the live database on a scratch style:
a photo attaches to a named colour, a colour the style has not got is
refused, `load_style` returns it and leaves the other colour alone, it
survives a save that never mentions it, and `matrix_rows` hands the sheet
both maps with unset colours left out. The real HTTP route was then run
against a real colourway whose name contains a slash — upload 200, file
served 200, a bad colour 404. Scratch style deleted, test photo deleted,
all 3,582 colourways back to no photo.

### Still open

1. **The backend container is running hand-copied files** — `repo.py`,
   `uploads.py` and the new migration went in with `docker compose cp`.
   The migration is **already applied to the database** and stays applied;
   the Python does not survive a recreate. Run
   `docker compose up -d --build backend`.
2. **Browse, Report, Checklist and Design are still hidden** on the home
   page and in the top band, and so is the band's own Color Table link —
   only the home-page card came back, and it goes to the separate app, not
   to `/colors`. Pricing Matrix was unhidden in full.
3. Everything v1.1b left open: the pens not yet drawn from the channel,
   nothing imported into `whs_channel` (which is also what the SY-AV filter
   needs), the five unexplained legend keys, and the v1.1 carry-overs.

---

## v1.1b — channels on the colourway, and a sheet you can strip down

**2026-11-28** · base `9b39985` · commit hash to be filled in

A letter rather than v1.2, because nothing here changes what the project is
doing: it is the same screen-at-a-time walkthrough v1.1 began, two days
further on. The next whole number is for the next phase.

v1.1 ended with the colourway pens specified but half of them undrawable:
the legend said pink meant "new colour, 000 only" and the app had nowhere to
record that a colour was 000-only. The bulk of this version gives that fact
a home, and the rest is what the walkthrough turned up along the way — two
switches on the print toolbar, a one-channel card that no longer draws a
half it cannot use, and a layout gap that turned out to be a real bug.

### Added

**A channel on each colourway**, in the style editor's BOM section beside
Remove: two tick boxes, SY and 000, in the channel's own colours. A garment
sold on both channels can still have one colour that only goes to wholesale —
which is exactly what the pink pens on the Matrix card mean.

- **A box the style does not sell through is shut, not merely faded.** A
  colour cannot go where the garment does not. A style with no channel
  recorded bars nothing, because most rows are in that state and shutting
  every box on all of them would make the control look broken.
- A disabled box still shows its stored value, so a style narrowed to one
  channel after its colours were set reads as the contradiction it is rather
  than quietly losing what it said.
- A colour just typed in starts with **no channel**, not with both ticked.
  "Nobody has said" is the truth about it; BOTH is an answer nobody gave.

**Checklist and Details switches on the print toolbar**, beside the style
count. Either one unticked takes that block off every card on the sheet: the
prepared-steps chips, and the attribute rows at the foot. Both on by default,
and off is carried in the URL (`?checklist=0`, `?details=0`) rather than in
React state — the toolbar is `display: none` when printing, so a sheet set up
a particular way has to be a link.

- The row estimate is told about it. `cardHeightMm` drops the blocks it is
  not printing, so the "needs more rows than fit" warning stops budgeting
  for ten attribute rows that are switched off and telling the operator to
  halve a page that would have fitted.
- `SheetCard` gained a `details` prop, defaulting to on. The checklist needed
  nothing new: it already draws nothing for an empty `steps`.

**What three of the four hand pens mean**, as a *Misc* block at the foot of
the legend's Colourway font colour section:

| pen | meaning |
| --- | --- |
| blue | Discontinued colour for SY |
| purple | Year round colour |
| red | Hold colour for SY |

- Nothing derives these — someone picks them by clicking a colourway name —
  so the legend is the only record of what they mean. The same four
  meanings are written above `COLORWAY_MARKS` in `SheetCard.jsx`, where the
  pens are applied, and a test pins the two to stay in step.
- They match where the card already offers them (`ZONE_PENS`): purple
  between the rules, red and blue below the red rule — and two of the three
  are about SY, which is the band under the red rule. That agreement is
  evidence the model is right, not a coincidence worth leaving unremarked.
- **Magenta stays out of Misc.** It is the pink in the band grid — "new
  colour, 000 only" — so it answers the same two questions as the
  green/black base rather than saying something extra. All four hand pens
  are now accounted for.
- The legend writes the hexes out by hand rather than reading them from the
  stylesheet, so a pin compares each Misc swatch against `--pen-*` in
  `styles.css`. A pen recoloured there and not here would leave the key
  describing a colour the card no longer draws.

**`frontend/src/channel.js`** (new). `channelOf`, `channelParts` and
`styleAllows` — one vocabulary for the style, the colourway and the card. The
words "BOTH" / "SY ONLY" / "000 ONLY" are now written out in three places
(this file, `SheetCard.jsx`, `repo.py`), and the tests compare the three lists
rather than trusting them.

### Changed

- **`style_colorways.whs_channel` is now written by the editor.** It had been
  carried over blindly on every save — `save_style` deletes and re-inserts the
  colourway rows, and restored the old value because "the editor never had"
  it. It does now. A payload that omits the key still means "leave it alone",
  so a client that does not know the field cannot blank it; an empty string
  means "nobody has said", which is a real answer and not the same as BOTH.
  A value outside the vocabulary is refused rather than stored.
- `load_style` returns each colourway's `whs_channel`.
- `CheckBox` takes `disabled` and `title`.
- The legend's keys were rewritten with the team several times: the pens are
  set out band by band, no key names its own colour, sections are ruled off,
  the panel is 520px with the keys in two columns, the repeat rings are drawn
  as rings rather than fills, and a yellow ring was added for "not sure it is
  a repeat".
- **Bands 1 and 2 share one heading.** They take an identical set of four
  pens, and printing the set twice invited the reader to hunt for a
  difference that is not there — and left two lists to keep in step the next
  time a pen changes. A heading can now carry `also`, a second band name
  under the first with an "&" between them.
- **A black X now sits inside every filled repeat dot**, on the card and in
  the legend — the mark the Matrix Master workbook puts there. Drawn as two
  percentage-sized bars so it scales with the dot, which is 9px on the printed
  sheet, 12px on the Matrix screen and 7px in a one-row block.
- **A one-channel card no longer has a half it cannot use.** An SY-only style
  used to draw all three bands and strike out the colours above the red rule.
  It now draws one band — the SY-ONLY list — with no sample band, no 000 list
  and no black rule above it. A 000-only style loses the band below the red
  rule, and keeps its sample colour: the sample band and the 000 list are the
  same half of the card, not a third thing.
  - **The colours are folded, not dropped.** `byZone` hands a hidden band's
    colours to the band standing in its place, so they read under the red
    rule instead of disappearing. This is not optional: of the **301 styles
    marked SY ONLY, not one has a colour below the red rule** — the bands
    were filled in before the channel was, so hiding without folding would
    have emptied 301 cards.
  - The fold is a reading, not a migration. `style_colorways.zone` is left
    alone, so a style put back on both channels reads as it always did.
  - `mainRowCount` returns 0 for a card that does not draw its main band, so
    an SY-only style no longer makes every other card in its block pad out
    blank rows for a band nobody sees.

### Fixed

**The gap under the sample colour.** `.sheet-colours` has `flex-grow: 1` so
the colour list absorbs the card's free space and the blocks below it sit at
the bottom, lining up across a row. That rule was written when the list was
one `<ul>`. It is three now, and three growing flex children *share* the free
space — so a short card opened a gap under the sample colour and another
under the band between the rules, in the middle of the list where they read
as mistakes rather than as slack. Only the last band drawn grows now, which
puts the space under the whole list where there is nothing to look at. This
was on the Matrix screen as well as the printed sheet; taking Details off
just made it impossible to miss.

### Deleted

Nothing.

### Tests

13 new assertions in `frontend/test/sheet.test.mjs` under *a colourway has a
channel of its own*: the three vocabularies agree, empty is not BOTH,
`channelParts` is the exact inverse of `channelOf` for all four combinations,
and `styleAllows` shuts the right box. Two were mutation-tested — dropping a
word from the server's list, and making an unset style shut both boxes — and
both pins failed as they should.

12 more under *the sheet can leave blocks off the card*: the toolbar offers
both boxes, both default to on, off goes to the URL, the card is handed an
empty step list and a `details` prop, and switching a block off makes
`cardHeightMm` smaller and `rowsThatFit` no smaller. Mutation-tested by
un-telling `cardHeightMm` about the blocks, by defaulting Checklist to off,
and by ungating the attribute rows — four pins failed between them.

16 more under *an SY-only card has no 000 half*: `allowsZone` and `showsZone`
part company exactly on the sample band of an SY-only style; the fold moves
every colour under the red rule in alphabetical order and leaves
`colorway_zones` untouched; the same style on BOTH reads as three bands
again; the 000-only mirror folds the other way and keeps its sample colour;
and `mainRowCount` is 0 for a band that is not drawn. Mutation-tested by
switching the fold off and by folding into the wrong band — three pins failed
each time.

3 more under *only one colourway band takes the slack*: a band does not grow
on its own account, the last one drawn does, and the colourway list is the
only `<ul>` on the card — which is the assumption `:last-of-type` rests on,
and a second kind of list would quietly steal the slack back. Mutation-tested
by restoring `flex-grow: 1` on every band.

7 more under *the legend says what the hand pens mean*: Misc carries exactly
the three non-grid pens in that order, each swatch equals the matching
`--pen-*` in `styles.css`, magenta is in the grid rather than in Misc,
`SheetCard.jsx` records the same meanings, and bands 1 and 2 are one heading
with the four pens written once. Mutation-tested by nudging a hex by one
digit and by splitting the heading back in two — four pins failed.

Total for this version: **51 new assertions**, 449 passing in all,
`node frontend/test/sheet.test.mjs` green, `npx vite build` clean.

The backend was exercised against the live database through the real
`save_style` / `load_style` path on a scratch style, since no unit harness
reaches it: a new style saves and reads back each colour's channel, an edited
one is written, an emptied one is cleared, an omitted key does not blank it,
and a word outside the vocabulary is refused. The scratch style was deleted
and all 3,582 colourways are back to a null channel.

### Still open

1. **The pens still are not drawn from the channel.** The data is now
   capturable, but `penOf()` in `SheetCard.jsx` still offers four hand pens
   with no recorded meaning (magenta, purple, red, blue) instead of deriving
   green / black / pink / light pink from *new-or-repeat* × *000-only*. There
   is no light pink pen at all. That is the remaining half of the legend.
2. **Nothing has been imported into the new column** — all 3,582 colourways
   still have a null channel, so the facts have to be typed in or imported
   before the pens could show anything.
3. **The backend container is running a hand-copied `repo.py`.** It was pushed
   in with `docker compose cp` to test, and survives a restart but not a
   recreate. Run `docker compose up -d --build backend` to bake it in.
4. **Browse and Report are still hidden on the front door.** Unhiding them
   was asked for and is not in this commit — it is uncommenting two blocks in
   `Home.jsx`, but the same `a44b14e` also hid things in `Matrix.jsx`,
   `StyleEditor.jsx`, `repo.py` and `yarn_names.py`, and pinned the hiding in
   the tests, so what else sits behind those two words has to be read first.
5. **Five legend keys still have no meaning recorded** — the three
   highlighter-bar colours (green, amber, blue) and the purple band with its
   star. The four colourway pens are no longer among them. The rows are
   commented out at the foot of `LEGEND`, ready to fill in.
6. Carried over from v1.1: `APP_PASSWORD` on the VM, the username question,
   the surplus `.xlsx`, the other pages' band links, and what "Done" means on
   the checklist.

---

## v1.1 — the team walkthrough

**2026-11-27** · commit `9b39985` · base `07ce3cc`

The phase this cuts: the app stopped being built for the people building it
and started being shown to the people who will use it. v1.0 was the whole
surface; the two `hide features` commits narrowed what the front door offers;
this version makes the two screens that are still showing — **Matrix Master
Layout** and **Matrix Master Attributes** — stand on their own in front of
someone who has never seen them.

### Where it starts

The boundary is `07ce3cc`. The two commits named `hide features`, immediately
before it, did this, and are **not** part of v1.1:

| Commit | What it hid |
|---|---|
| `a44b14e` | Five of seven home cards; the band links on Matrix and the style editor; the Pricing Matrix tab. Also fixed the doubled yarn label (`YST YST RED PAPRIKA - 893 - 893`) and removed the unused `yarn_label()` helper. |
| `07ce3cc` | The database name and reset warning in the DEVELOPMENT banner. |

Nothing there was deleted — every route still works, and every hidden block is
commented out in place with the date and the reason.

### Added

**A Legend on the Matrix Master Layout tab** — `frontend/src/sections/LegendKey.jsx`
(new, 153 lines). A second floating panel under the TBD tray, saying what the
colours and marks on a card mean. Collapsible, remembered per browser, hidden
when printing.

Its contents are one array, `LEGEND`, written by hand — nothing is read from
the database. 17 keys are filled in, all of them read off the card code and
`styles.css`:

| Group | Keys |
|---|---|
| The number | pink = 000 only · red = SY only · white = both |
| Above the photo | the two repeat circles, filled / hollow / orange-ringed, and "no circles = not a repeat" |
| Colourways | the three bands and their rules · yellow vs grey row · green vs black name |
| At the foot | filled vs outlined step chip |

**Column filters on the Matrix Master Attributes grid** —
`frontend/src/components/ColumnFilter.jsx` (new, 205 lines). The funnel the
workbook has, on every column header: sort A→Z / Z→A, a search box over the
values, and a tick list of every distinct value. `(Blank)` is a real, tickable
value, because "which styles still have no Construction" is what this grid gets
asked most.

Behaviour worth knowing, all of it deliberate:

- Filtering one column narrows the choices offered in the next, as Excel does —
  but a value a column already keeps stays in its own list, so nothing can be
  ticked off and then be impossible to tick back on.
- Unticking the last value returns the column to **no filter**, not to a list
  that happens to name every value. A style added tomorrow appears without
  anyone clearing anything.
- Sorting and filtering belong to the Attributes grid alone. The Layout tab
  keeps the arrangement the team saved.
- A bar above the grid says how many styles are showing and how many columns
  are filtering, with one **Clear filters** button — with thirteen columns
  scrolling sideways, the column doing the filtering is usually off screen.

**`PDM FEATURE CHECKLIST.gs`** (new, 237 lines, project root). A Google Apps
Script that builds the team's feature checklist as a native Google Sheet —
64 features across six apps, a Status dropdown, the Features cell greying on
Done and staying yellow otherwise, and a Progress tab counting each block. Run
once against the sheet; it rebuilds both tabs from scratch, so it is not to be
re-run after PICs are filled in.

The live sheet is `14nGCueDTUQ6zSL7paNVj9Mz6JZdML2uhBtTAPGEY_ZU`. It has since
been edited by hand: PICs assigned, **Color Table renamed to Yarn Automation**,
and the repeated App names cleared so each shows once per block. The Progress
tab was rewritten to count by row range rather than by App name, because
clearing those names broke the `COUNTIFS` the script generates. **The script
and the live sheet have diverged — the sheet is the real artefact.**

### Changed

- **The TBD tray no longer positions itself.** `.tbd-tray` lost its own
  `position: fixed` / `top` / `right` / `z-index` and now sits in a new
  `.float-stack`, a fixed column holding both hovering widgets. The tray's
  height changes as styles are parked, so anything pinned under it by its own
  `top` would overlap it or leave a hole. Add a third widget by putting it in
  the stack; nothing needs measuring.
- **`compare` and `cellText` were lifted out of the `Matrix` component** to
  module scope and exported, so the drift pins can import the real functions
  instead of copies of them.
- `frontend/src/styles.css` — +229 / −10. `.float-stack`, `.legend-*`,
  `.colf-*`. All three hidden when printing.
- `frontend/src/pages/Matrix.jsx` — +160 / −19.

### Fixed

- **Z→A sorting put blanks first.** The sort direction was applied by negating
  the comparator, which flipped the blanks-last rule along with everything
  else. A blank is the absence of an answer, not the smallest one, so it
  belongs last whichever way the answers run. The direction is now applied
  inside `compare`. Found by a test written against the new code, before it
  reached anyone.

### Deleted

Nothing. No file, route, column or behaviour was removed in v1.1.

### Tests

`frontend/test/sheet.test.mjs` — +40 lines, four new pins under
*the Attributes grid sorts the way a spreadsheet does*:

- A→Z reads the numbers inside the words (`3GG` before `12GG`)
- Z→A reverses them
- A→Z puts blanks last
- **and Z→A puts them last too, not first** — the pin for the bug above

Each was mutation-tested: the exact original negation was reintroduced and the
blanks pin failed on it. The pins import the real `format.js`, because a
`toFixed()` stand-in rounded `0.2435` down to `0,243` — which is the very thing
`roundFixed` exists to get right, so a pin built on the stub would have
asserted the bug. Full suite passes.

### Still open

1. **Five legend keys have no meaning recorded** — the three highlighter-bar
   colours, and the purple band with its star. They are applied by hand and
   the app stores no meaning for them, so only the person marking them can
   say. They sit commented out at the foot of `LEGEND`.
2. **The colourway name pens are specified but not implemented.** The meanings
   were given on 2026-11-28 and written into `LEGEND`: green = new colour,
   black = repeat (SY + 000), pink = new but 000 only, light pink = repeat but
   000 only; below the red rule, green and black only, since that band is
   SY-ONLY by position. Two facts crossed, not four unrelated pens.

   Green and black already work — `penOf()` derives them from `new_colorways`.
   **Pink and light pink are not drawn at all.** The app instead offers four
   hand pens with no recorded meaning (magenta, purple, red, blue, two per
   band), and the "000 only" half of the rule has nowhere to live:
   `style_colorways.whs_channel` and `.sell_restriction` exist for it and are
   **empty on all 3,582 rows**. Making the screen match the legend means
   deriving the pen from the two facts and importing or capturing 000-only.
   Only 7 hand marks exist in the whole database, so changing the palette
   costs almost nothing.
3. **`APP_PASSWORD` on the VM** — the team was given `admin123`. Unless the
   VM's `.env` says so, that password does not work.
4. **No username field exists.** The login takes one shared password. Whether
   to add a real `admin` box, or go straight to company-domain sign-in, is
   undecided.
5. **`PDM FEATURE CHECKLIST.xlsx` is still in the project root**, superseded by
   the Google Sheet and kept only as a backup.
6. **Band links on the other pages still point everywhere** — Browse,
   Checklist, Report, Color Table and Design were not narrowed the way Matrix
   and the style editor were.
7. **What "Done" means on the checklist** — built, or usable with real data.
   Several IM Master rows are marked Done while the measurements, trims,
   photos, the eleven Matrix attribute columns and the S25–F26 season rates
   are all still empty.

---

## v0.1 — design complete, nothing built

**2026-09-21** · commit `c3ac3a8` · 21 commits · 16 documents · 4,794 lines

The state of the project **before testing the plan**. Everything here is design
and the evidence behind it. **No database, no code, no data has been created.**

### What v0.1 rests on

Four full seasons were profiled with one method, plus the embedded F25 price
sheet and the Matrix Master workbook:

| | F25 | S26 | F26 | S27 |
|---|---|---|---|---|
| Season number | 55 | 56 | 57 | 58 |
| Header row | 61 | 57 | 54 | 57 |
| Columns | 259 | 254 | 236 | 255 |
| Styles | 325 | 270 | 311 | 222 |
| **Formula columns** | 94 | **88** | **88** | **88** |

Everything below was measured in those files, not assumed.

### What was established

- **The model is stable.** Exactly 88 calculated columns, three seasons running.
- **The calculation chain is fully decoded** — every cost, duty, freight, landed
  cost and margin, back to ~35 rate cells.
- **Rates change occasionally, not every season** — labour 32,687 → 35,061 →
  35,061 → 37,607; exchange rate held three seasons then moved.
- **Column letters are unusable.** 247 of 254 headers moved inside S27 in three
  months. Header text is nearly stable.
- **Collections live in banner rows**, not a column, and close the block above.
- **`season_number` = 2 × YY + 4 (Spring) / + 5 (Fall)** — verified on four seasons.
- **The SKU is generated and embeds the season**, so the same style has a
  different SKU every season.
- **Identity drifts in every direction** — names renamed, numbers reused,
  48–60% of a carried style's colour tags do not survive the season.
- **Substitutions are scoped to a style**, and are almost never recorded: one
  instance (`YCA INDIGO - 860 (INDIA SEA SUB)`) in four seasons.
- **F26 lost the size column.** Three of four seasons record it; F26 alone doesn't.

### Decisions taken

| # | Decision | Where |
|---|---|---|
| 1 | **Store inputs, calculate the rest** — the 88 formula columns become a view | `schema.md` §1 |
| 2 | Every table keyed on its **own identity id**; no business value is a key | `schema.md` §4.0 |
| 3 | **Wholesale and SY are separate price tracks**, both required | `schema.md` §4.3 |
| 4 | `season_number`, `code` and `name` are **generated** from type + year | `schema.md` §4.1.1 |
| 5 | **19 tables, 5 views, ~190 columns** | `schema.md` §11 |
| 6 | Empty-box weight: **match the sheet first**, fix it as a visible change | `schema.md` §8 |
| 7 | Material cost: **one price per style**, for parity with the sheet | `schema.md` §8 |
| 8 | Substitution: **one "Sub to" field** now; notice/event model deferred | `identity.md` §6 |
| 9 | **Keep the existing React front end**; replace Node/SQLite with Postgres + FastAPI | — |
| 10 | The **Salesforce feed is the first deliverable** — no entry screens needed | `schema.md` §10 |
| 11 | **Operator** runs the IM and the Matrix, so the app becomes where they work and exports the same outputs | — |

### Still open

1. **Who sets prices** — Operator, or does it hand off (the Matrix legend says
   price problems go to Bu Novi)?
2. **Which integration model**, pending the user review — app as the source, or
   app alongside the sheet.
3. When a colour is substituted mid-season, does the **old tag stay sellable**?
4. **How far back to link products** — S26 onward, or the archive back to 2006.
5. Host and port for deployment.
6. What `sub group` means — the one field with no evidence anywhere.

### Deliberately not in v0.1

- No migration, no schema created, no data loaded.
- No adoption document — it waits on the user review.
- The substitution notice/event model — deferred to one field.
- Any import of S26 / F26 / S27.

### The documents

| Document | Lines | What it is |
|---|---|---|
| `prd.md` | 213 | Why, who for, what's in and out |
| `strategy.md` | 228 | Phases with checkable exit criteria |
| `schema.md` | 930 | **The schema** — tables, columns, calculations, open decisions |
| `identity.md` | 286 | Why a stable key is the point; substitution |
| `season-drift.md` | 205 | What changes between four seasons |
| `columns.md` | 509 | The original column-by-column profile |
| `matrix-master.md` | 208 | The range review, and how it fits |
| `plan.md` | 404 | The first build plan |
| `backend.md` | 269 | Stack, layout, API surface, deployment |
| `frontend.md` | 156 | Screens and interaction rules |
| `flow.md` | 194 | Where each kind of correctness is enforced |
| `logic.md` | 202 | Domain rules, with the unconfirmed ones marked |
| `config-contract.md` | 326 | The earlier v1 contract — superseded by `schema.md` |
| `caveats.md` | 222 | Risks and unvalidated assumptions |
| `github_SOP.md` | 262 | Branch model and secrets |
| `memory.md` | 180 | Checkpoint log |

`flow.drawio` holds the flow as a diagram.

### What v0.2 should contain

1. **The FastAPI skeleton** answering the seven endpoints `api.js` already calls,
   so the existing React screens run against Python.
2. **The Alembic migration** for the 19 tables.
3. **The golden test** — 20 real styles computed and diffed against the sheet's
   own values, to the cent. Nothing depends on the calculations until it passes.
