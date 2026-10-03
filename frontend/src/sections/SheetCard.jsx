import { Fragment, useId, useRef, useState } from 'react';
import { GripVertical, Shirt, ImagePlus, Star, Plus, X, Check, StickyNote } from 'lucide-react';
import { commaDecimal, pointDecimal, roundFixed } from '../format.js';

/**
 * One style, as the Matrix Master and Sales History sheets draw it.
 *
 * Shared by the printed sheet and the Matrix screen so the thing the team
 * arranges is the thing that comes out of the printer. Two layouts of the
 * same card would drift within a week.
 *
 * Editing is the only difference between the two: pass onEdit and the
 * attribute rows become inputs. Everything else — the photo, the name, the
 * colourways, the step chips, the sales table, the repeat colouring — is the
 * same code in both places.
 */

// Sold quantity for one colourway on one channel.
export const qty = (style, colour, channel) => style.sales?.[colour]?.[channel] ?? null;

export const sum = (style, channel) => {
  const values = style.colorways
    .map((c) => qty(style, c, channel))
    .filter((v) => v != null);
  return values.length ? values.reduce((a, b) => a + Number(b), 0) : null;
};

export const cell = (v) => (v == null ? '' : Number(v).toLocaleString('en-US'));

/**
 * Let a multi-colour name wrap at its separators.
 *
 * "DARKEST INDIGO/RED/TWILIGHT SKY" breaks fine at the spaces, but
 * "WHITE/CASHEW/KHAKI" is one unbreakable word to the browser and runs
 * straight out of a 20mm card into the next one. A zero-width space after
 * each "/" gives it somewhere to break — at the separator, which is where a
 * person would break it too, rather than mid-word.
 *
 * The character is invisible and copies as nothing, so the name still reads
 * and still pastes cleanly. Written as an escape because this is a JS string;
 * in JSX text it would print literally.
 */
export const breakable = (text) => String(text ?? '').replace(/\//g, '/​');

// The workbook marks a style that sells through one channel only, and BOTH
// where it sells through either. A blank is the one case left unbadged: the
// workbook never filled it in, and that is not the same as "both".
export const CHANNEL_MARK = { '000 ONLY': 'whs', 'SY ONLY': 'sy', BOTH: 'both' };

// The order a click walks through, matching WHS_CHANNELS in repo.py. BOTH is
// first because it is the uncoloured cell: white, then pink, then red.
export const WHS_CHANNELS = ['BOTH', '000 ONLY', 'SY ONLY'];

/**
 * The channel one click along from this one.
 *
 * A style with no channel at all sits where BOTH sits — both cells are white —
 * so it steps to 000 ONLY rather than to BOTH, which would spend a click
 * changing nothing a person can see. The cost is that a blank, once clicked,
 * has become an answer; that is the point of clicking it.
 */
export const nextChannel = (current) => {
  const at = WHS_CHANNELS.indexOf(current);
  return WHS_CHANNELS[(at < 0 ? 0 : at) + 1] || WHS_CHANNELS[0];
};

/**
 * Number a collection's cards the way the workbook does.
 *
 * Two sequences running side by side: styles sold only on the web store get
 * their own "S" numbering, everything else shares the plain one. So a
 * collection reads 1, 2, 3, S1, 4, 5, S2, S3 — the S numbers are not gaps in
 * the main run, they are a second run.
 *
 * Worked out over the whole collection rather than a page, because a card's
 * number has to mean the same thing whichever sheet it lands on.
 *
 * Returns {style id: label}, keyed rather than positional so a page can look
 * up its own cards after the list has been cut up.
 */
// The highlighter bar. No fixed meaning — it marks whatever the collection is
// being worked through for this week — so the card only knows which colour,
// never why. Cycling through them and back to none is quicker than a picker
// when a whole block is being marked up.
export const HIGHLIGHTS = ['green', 'amber', 'blue'];

// The pen a colourway's name is written in. Same idea as the card's
// highlighter — no fixed meaning — and the same cycle back to the ordinary
// colour, so one click both marks and unmarks.
// Kept in step with COLORWAY_MARKS in backend/app/repo.py — this decides
// which pen comes next, that decides which the server accepts.
// The second bar. One colour today; kept as a list so adding another is a
// line of CSS rather than a change of shape.
export const BAND_COLOURS = ['purple'];

export const nextBand = (current) => {
  const at = BAND_COLOURS.indexOf(current);
  return at === BAND_COLOURS.length - 1 ? '' : BAND_COLOURS[at + 1];
};

// The ring round a past-season circle. Not a pen any more: orange is derived
// from the season links (ran in the two previous seasons) and nothing cycles
// through these. Yellow is reserved — it is meant to mean "ran before, but
// that past season is not confirmed", and what confirms a season is still open
// (docs/caveats.md §10). Kept in step with RING_MARKS in backend/app/repo.py.
export const RING_MARKS = ['yellow', 'orange'];

// The background behind a colourway name, as opposed to the pen it is
// written in. Kept in step with COLORWAY_HIGHLIGHTS in backend/app/repo.py.
//
// Every row has one: there is no plain white state. A colourway that has
// never been touched reads as yellow, and clicking switches it to grey and
// back. So this is a switch, not a cycle — nothing is ever unset on screen,
// whatever the column holds.
export const COLORWAY_HIGHLIGHTS = ['yellow', 'grey'];
export const DEFAULT_COLORWAY_HIGHLIGHT = 'yellow';

export const litOf = (stored) => (
  COLORWAY_HIGHLIGHTS.includes(stored) ? stored : DEFAULT_COLORWAY_HIGHLIGHT);

export const nextColorwayHighlight = (current) => (
  litOf(current) === 'grey' ? 'yellow' : 'grey');

// The pens a person can apply by hand. Green is NOT among them any more: it
// means "this colour is new this season", which the app works out from the
// earlier seasons of the same garment, so it is not something to choose.
// Black — no pen at all — means the colour was carried over.
// The three bands of the colourway list, top to bottom. Matches
// COLORWAY_ZONES in backend/app/repo.py.
export const COLORWAY_ZONES = ['sample', 'main', 'extra'];

export const zoneOf = (style, colour) => {
  const z = style?.colorway_zones?.[colour];
  return COLORWAY_ZONES.includes(z) ? z : 'main';
};

/**
 * Whether a colourway may live in this band, given what the style sells
 * through.
 *
 * The two lower bands are the two channels: between the rules is WHS 000,
 * below the red rule is SY. A style that sells through one channel only has
 * one band it can put a colour in.
 *
 * A blank channel allows both. "Not recorded" is not "neither", and 257
 * styles came from the workbook without one — locking their colourways away
 * behind a field nobody has filled in would be wrong.
 */
export const allowsZone = (style, zone) => {
  const channel = style?.whs_channel;
  if (zone === 'main') return channel !== 'SY ONLY';
  if (zone === 'extra') return channel !== '000 ONLY';
  return true;                       // the sample band is not a channel
};

// The sample band holds one colour: the one the garment is shown in. A
// second would not be a sample of anything.
export const ZONE_LIMIT = { sample: 1 };

// How many rows a style's main band needs. The page asks every card in a
// block and passes the largest back down as `minMainRows`, so the red rule
// lands at the same height across the block — see the prop.
export const mainRowCount = (style) => byZone(style).main.length;

export const zoneIsFull = (bands, zone) => (
  ZONE_LIMIT[zone] != null && (bands[zone] || []).length >= ZONE_LIMIT[zone]);

// The two bands that keep themselves in alphabetical order. The sample band
// does not: it is the colour the garment is shown in, and where it sits is a
// decision rather than a letter.
export const SORTED_ZONES = ['main', 'extra'];

// localeCompare, not <, so AP·RÈS files under A with the rest of the As
// instead of after Z — a plain comparison sorts by code point.
const alphabetical = (a, b) => String(a).localeCompare(String(b));

/**
 * A style's colourways split into the three bands.
 *
 * The main and extra bands come back sorted A–Z, so a colour dropped into one
 * lands where the alphabet puts it and there is no second, invisible order to
 * disagree with. Sorting on the way out as well as on the way in means a row
 * stored out of order — by an import, or by an older version of this code —
 * still reads correctly.
 *
 * Anything with no band recorded falls into 'main', so a row the server has
 * not told us about appears somewhere rather than vanishing between the rules.
 */
export const byZone = (style) => {
  const out = { sample: [], main: [], extra: [] };
  for (const c of style?.colorways || []) out[zoneOf(style, c)].push(c);
  for (const z of SORTED_ZONES) out[z].sort(alphabetical);
  return out;
};

export const COLORWAY_MARKS = ['red', 'purple', 'magenta', 'blue'];

/**
 * Which pens a band offers, in the order a click walks through them.
 *
 * The two lower bands are the two channels, and each has its own pair — so a
 * pen means the same thing wherever you see it rather than depending on which
 * half of the card you are looking at. The sample band is not a channel and
 * keeps all four.
 *
 * The base underneath is not in here: it is black when the colour ran before
 * and green when it is new, which is read off the data, not chosen.
 */
export const ZONE_PENS = {
  sample: COLORWAY_MARKS,
  main: ['magenta', 'purple'],
  extra: ['red', 'blue'],
};

export const pensFor = (zone) => ZONE_PENS[zone] || COLORWAY_MARKS;

/**
 * The pen a colourway's name is written in.
 *
 * A hand-applied pen wins, because someone meant it. Otherwise the name is
 * green when the colour is new to this garment and plain black when it ran
 * before — the two states that are read off the data rather than chosen.
 */
export const penOf = (style, colour, zone = null) => {
  const band = zone || zoneOf(style, colour);
  const hand = style?.colorway_marks?.[colour];
  // A hand pen shows only where its band offers it. A colour marked red below
  // the red rule and then dragged into the middle band would otherwise be the
  // one red name in a band that cannot produce one. The mark is kept, not
  // cleared — drag it back and the red returns — but it is not drawn here.
  if (hand && pensFor(band).includes(hand)) return hand;
  return (style?.new_colorways || []).includes(colour) ? 'green' : '';
};

export const nextColorwayMark = (current, zone = 'sample') => {
  const pens = pensFor(zone);
  const at = pens.indexOf(current);
  // A pen this band does not offer — because the colour was marked in the
  // other band and dragged across — restarts rather than cycling from a
  // position it does not have.
  return at === pens.length - 1 ? '' : pens[at + 1] || pens[0];
};

export const nextHighlight = (current) => {
  const at = HIGHLIGHTS.indexOf(current);
  return at === HIGHLIGHTS.length - 1 ? '' : HIGHLIGHTS[at + 1];
};

export const numberCards = (items) => {
  const out = {};
  let plain = 0;
  let webOnly = 0;
  for (const s of items || []) {
    out[s.id] = s.whs_channel === 'SY ONLY' ? `S${++webOnly}` : String(++plain);
  }
  return out;
};

/**
 * The attribute block under the photo, in the order the workbook lists it.
 *
 * All ten rows print whether or not the style has a value, blank where it
 * does not. That is what the workbook does, and it is what keeps the block a
 * constant height — so the step chips above it line up across the page
 * however much of this is filled in.
 *
 * Weight is the S/M figure with three other sizes graded from it. It is
 * edited here all the same: the server grades the others when it is saved,
 * with the same ratios as the style editor, so the two cannot disagree.
 */
export const ATTRIBUTES = [
  // Written with a decimal comma. `shown` is what the field holds while it is
  // edited and `parse` turns it back into the point the server stores.
  { key: 'weight_sm', label: 'Weight S/M',
    fmt: (v) => `${commaDecimal(roundFixed(v, 3))} kg`,
    shown: (v) => commaDecimal(roundFixed(v, 3)), parse: pointDecimal,
    suffix: 'kg', field: true, inputMode: 'decimal' },
  // gauge_detail, not gauge: gauge is the character inside the style code.
  // The values already read "3GG", "3B + 3GG", "3GP", so nothing is
  // appended to them.
  { key: 'gauge_detail', label: 'GG (machine)', fmt: String, field: true },
  // The Matrix construction — a stitch pattern like "Sido Bolong" — not
  // the knit construction on the Yarn screen, which is MACHINE KNIT on
  // nearly every style and says nothing about this one.
  { key: 'matrix_construction', label: 'Construction', fmt: String, field: true },
  { key: 'print_placement', label: 'Printed', fmt: String, field: true },
  { key: 'based_body', label: 'Base body', fmt: String, field: true },
  { key: 'sleeve_category', label: 'Sleeve category', fmt: String, field: true },
  { key: 'sleeve_length', label: 'Sleeve length', fmt: String, field: true },
  // Four values, each with a colour of its own on the sheet. A closed list,
  // so this is a select rather than a suggestion — and the colour shows when
  // printed too, not only while it is being chosen.
  { key: 'length_category', label: 'Length category', fmt: String, field: true,
    choices: ['Cropped', 'Super Cropped', 'Biasa', 'Long'], swatch: true },
  // Seeded from the ends count and changeable. `from` is the fallback: left
  // empty the sheet shows total_ends, and clearing the field puts it back to
  // that rather than to nothing — so the two cannot quietly disagree while
  // still allowing a style whose ply is not simply its ends.
  //
  // total_ends is text and carries things like "1+2" on 45 styles, which the
  // smallint ply column cannot hold. Those show as they stand until someone
  // overrides them with a number.
  { key: 'ply', label: 'Ply', from: 'total_ends', fmt: (v) => `${v} Ply`,
    // The word stays put while the number is edited: it is part of the row's
    // meaning, not something anyone should have to retype or be able to lose.
    suffix: 'Ply', field: true, numeric: true },
  { key: 'yarn_type', label: 'Yarn', fmt: String, field: true, options: 'yarn_codes' },
];

const blank = (v) => v === null || v === undefined || v === '';

export const slug = (value) => String(value ?? '')
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const attributesOf = (s) => ATTRIBUTES.map((a) => {
  // The field's own value wins; `from` names where to look when it is empty.
  const own = s[a.key];
  const raw = blank(own) && a.from ? s[a.from] : own;
  return {
    ...a,
    raw: blank(raw) ? '' : raw,
    value: blank(raw) ? '' : a.fmt(raw),
    // True when nothing is stored on the field itself, so the editor can say
    // where the number on screen came from.
    inherited: blank(own) && !blank(raw),
    // The colour a value carries, for the fields that have one.
    swatchClass: a.swatch && !blank(raw) ? `swatch-${slug(raw)}` : '',
  };
});

export default function SheetCard({
  style: s,
  view = 'matrix',
  steps = [],
  wide = false,
  // { yarn_codes: [...] } — suggestions for the fields that have a known
  // vocabulary. Offered, never enforced: a new yarn is used before its
  // colours are entered, and a list that refuses it would send the operator
  // back to the spreadsheet.
  options = {},
  // Repeat colouring, worked out by the caller: the frame is SY, the name
  // highlight is WHS 000.
  frameMark = null,
  nameMark = null,
  // Drag state and handlers, or nothing at all for a card that cannot move.
  drag = null,
  // Present on the Matrix screen: makes the attribute rows editable.
  onEdit = null,
  // Present alongside onEdit: clicking a colourway cycles its pen colour.
  onMarkColour = null,
  // Present alongside onEdit: the swatch at the row's right edge cycles the
  // background behind the name.
  onHighlightColour = null,
  // Present alongside onEdit: drag a colourway between the three bands, and
  // reorder within one. Given the whole list, in the order it should end up.
  onArrange = null,
  // How many rows the main band should occupy, whatever this style has in it.
  // The block's tallest main band, so the red rule beneath it sits at one
  // height across every card — a line that steps up and down from card to
  // card reads as a mistake rather than as a boundary.
  minMainRows = 0,
  // Present alongside onEdit: rename a colourway, add one, remove one.
  onRenameColour = null,
  onAddColour = null,
  onDeleteColour = null,
  // Present alongside onEdit: a photo can be dropped or picked on the card,
  // rather than opening each style in the editor to add one.
  onPhoto = null,
  // Present alongside onEdit: clicking the number cycles the sell channel the
  // cell is coloured by. The colour was only ever a readout of whs_channel, so
  // the cell that shows it is the natural place to change it.
  onChannel = null,
  // Called on double-click, to open the style in its editor.
  onOpen = null,
  // Briefly marked when a link has brought the page to this style.
  focused = false,
  // Position in the collection, counted from 1 and continuing across pages —
  // the workbook numbers its columns the same way, and it is how a garment
  // gets referred to in the room: "number seven".
  index = null,
}) {
  // The note is written in a panel beside the card rather than in the card:
  // at 160px there is no room for a usable text area, and the note is often
  // longer than anything else on the card.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(s.notes || '');

  const classes = ['sheet-card'];
  if (focused) classes.push('is-focused');
  if (wide) classes.push('is-wide');
  if (drag?.isDragging) classes.push('dragging');
  if (drag?.isOver) classes.push('drop-here');
  if (onEdit) classes.push('is-editable');
  // The card clips its content so long names cannot escape their column; the
  // note panel has to escape, so the clipping lifts while it is open.
  if (noteOpen) classes.push('note-open');

  // Opening the style is on the photo, not the whole card. The card is
  // covered in single-click controls now — the colourway pens, the
  // highlighter — and a double-click target wrapped around them means every
  // second click races a navigation. The photo is the one part with nothing
  // else to do, and it is the biggest thing to aim at.
  const open = onOpen ? () => onOpen(s) : undefined;

  // Whether this garment ran in the previous season at all — the circles say
  // where it came FROM, not where it is going. Two hollow circles would read
  // as "ran, but sold through neither channel", which is not the same as a
  // style that is new, so a style with no past-season version gets no row.
  const hasPast = s.prev_sells_sy != null || s.prev_sells_000 != null;

  // Adding a colourway happens in the list itself rather than in a dialog:
  // a card usually gains several at once, so the field stays open and clears
  // between them.
  // Which add-a-colourway bar is open, or false. There is one under each of
  // the two lower bands, and a shared boolean would open both at once.
  const [adding, setAdding] = useState(false);
  const [newColour, setNewColour] = useState('');

  // Dragging a colourway between the bands. The colour being dragged, and the
  // band the pointer is over — the second only so the target can show itself,
  // because an empty band is otherwise a few pixels of nothing to aim at.
  const [dragColour, setDragColour] = useState(null);
  const [dropZone, setDropZone] = useState(null);

  const bands = byZone(s);

  /**
   * Drop the colour being dragged into `zone`.
   *
   * Which band is the only decision: main and extra sort themselves A–Z, so
   * there is no position to aim for inside them — dropping anywhere in a band
   * means the same thing, which is why the whole band lights up rather than a
   * line between two rows.
   *
   * The whole list is rebuilt and sent, not the one move, so the server has
   * nothing to work out and the order on screen is the order stored.
   */
  const dropOn = (zone) => {
    const moving = dragColour;
    setDragColour(null);
    setDropZone(null);
    if (!moving || !onArrange) return;
    // A full band refuses the drop. Dropping the colour already in it back
    // onto itself is not a second one, so it is allowed through to the
    // no-op check below.
    if (zoneIsFull(bands, zone) && !bands[zone].includes(moving)) return;
    // And a band this style does not sell through refuses it too — dragging
    // is the other way in, and a button that says no while a drag says yes
    // would be worse than either.
    if (!allowsZone(s, zone)) return;

    const next = { sample: [], main: [], extra: [] };
    for (const z of COLORWAY_ZONES) {
      for (const c of bands[z]) {
        if (c !== moving) next[z].push(c);     // lifted out of wherever it was
      }
    }
    next[zone].push(moving);
    for (const z of SORTED_ZONES) next[z].sort(alphabetical);

    const items = COLORWAY_ZONES.flatMap(
      (z) => next[z].map((color) => ({ color, zone: z })));
    // Nothing actually moved — dropped back where it came from.
    const was = COLORWAY_ZONES.flatMap(
      (z) => bands[z].map((c) => `${z}:${c}`)).join('|');
    if (items.map((x) => `${x.zone}:${x.color}`).join('|') === was) return;
    onArrange(s, items);
  };
  // The colourway whose delete is waiting to be confirmed. One at a time:
  // the confirm replaces that row's controls, so two at once would be two
  // rows asking the same question.
  const [confirming, setConfirming] = useState(null);

  const submitColour = async () => {
    const name = newColour.trim();
    if (!name) { setAdding(false); return; }
    // Kept open for the next one; the bar that was open stays the open one.
    setNewColour('');
    // `adding` holds which band's button is open, which is the band the
     // colour belongs in.
    await onAddColour?.(s, name, adding || 'main');
  };

  const fileId = useId();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const takeFile = async (file) => {
    if (!file || !onPhoto || busy) return;
    setBusy(true);
    try { await onPhoto(s, file); } finally { setBusy(false); }
  };

  return (
    <div className={classes.join(' ')} data-style-id={s.id} {...(drag?.handlers || {})}>
      {drag && (
        <span className="sheet-drag" aria-hidden="true" title={drag.title}>
          <GripVertical size={13} />
        </span>
      )}

      {/* The channel is read off the number rather than given a badge of its
          own: the cell is already there, and a colour on it costs no height
          on a card that has to fit A4. */}
      {index != null && (() => {
        const tone = CHANNEL_MARK[s.whs_channel];
        const className = `sheet-index${tone ? ` idx-${tone}` : ''}`;
        // On paper, and on the sales sheet, it is a number. Only where the
        // Matrix is being set up does it also set the channel.
        if (!onChannel) return <div className={className}>{index}</div>;
        return (
          <button type="button" className={`${className} idx-click`}
            title={`Sells through ${s.whs_channel || 'nothing recorded'}`
                   + ` — click for ${nextChannel(s.whs_channel)}`}
            onClick={() => onChannel(s, nextChannel(s.whs_channel))}>
            {index}
            <span className="sr-only">
              {`, sells through ${s.whs_channel || 'nothing recorded'}`}
            </span>
          </button>
        );
      })()}

      {/* The hand-applied highlighter, under the number. Only interactive
          where editing is on; on paper it is just a band of colour. */}
      {/* The two hand-applied bars are Matrix Master's. The Sales History
          sheet is read for what sold, and a band nobody set while looking at
          sales numbers would only ask a question it cannot answer.

          Left in place rather than deleted: they work, and they come back by
          dropping the `view !== 'sales'` guard. The next-season circles below
          stay on both sheets — those are about where the garment is going,
          which is exactly what a sales sheet is being read to decide. */}
      {view !== 'sales' && (<>
      {/* The second bar, with its own star. Always rendered, like everything
          else stacked above the photo, so a marked card and an unmarked one
          stay level. The star is a separate mark on the same bar, not a
          state of it — a style can carry either, or both. */}
      <div className={`sheet-band${s.matrix_band ? ` band-${s.matrix_band}` : ''}`}
        title={s.matrix_band ? 'Banded' : undefined}>
        {onEdit && (
          <button type="button" className="sheet-band-hit"
            title={s.matrix_band ? 'Click to clear this band' : 'Click to band this style'}
            aria-label={`Band ${s.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(s, 'matrix_band', nextBand(s.matrix_band || ''));
            }}
            onDoubleClick={(e) => e.stopPropagation()} />
        )}
        {/* The star comes with the band — it is not a mark of its own, so
            there is nothing to click and nothing to keep in step. */}
        {s.matrix_band && (
          <span className="sheet-star" aria-hidden="true">
            {/* Filled, not outlined — at 9pt an outline is four hairlines and
                a hole, and the hole fills with the band behind it. */}
            <Star size={9} strokeWidth={1} fill="currentColor" />
          </span>
        )}
      </div>

      {/* Always rendered, like the row below it. On paper an unmarked bar is
          invisible but still takes its place, so a collection where one card
          is highlighted and the next is not still lines up. */}
      {(
        onEdit ? (
          <button
            type="button"
            className={`sheet-mark${s.matrix_highlight ? ` hl-${s.matrix_highlight}` : ''}`}
            title={s.matrix_highlight
              ? `Highlighted ${s.matrix_highlight} — click for the next colour`
              : 'Click to highlight'}
            aria-label={`Highlight ${s.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(s, 'matrix_highlight', nextHighlight(s.matrix_highlight || ''));
            }}
          />
        ) : (
          <div
            className={`sheet-mark${s.matrix_highlight ? ` hl-${s.matrix_highlight}` : ''}`}
            aria-hidden="true"
          />
        )
      )}
      </>)}

      {/* One row, two things it can say.

          Normally the two circles: which channels the next season's version
          of this style is set to sell through. Flagged, the whole row becomes
          NEED NEW PHOTO — because a style whose picture has to be reshot is
          being handed to the photographer, and where it sells next season is
          not the question being asked at that moment.

          Clicking the row switches between them; clicking a circle rings it,
          which is why the row's own target sits behind them. */}
      {s.needs_photo ? (
        <div className="sheet-next needs-photo">
          {onEdit && (
            <button type="button" className="sheet-next-hit"
              title="Click to clear NEED NEW PHOTO"
              aria-label={`Clear need new photo for ${s.name}`}
              onClick={(e) => { e.stopPropagation(); onEdit(s, 'needs_photo', 'false'); }}
              onDoubleClick={(e) => e.stopPropagation()} />
          )}
          <span className="sheet-next-label">NEED NEW PHOTO</span>
        </div>
      ) : (
        <div className="sheet-next" aria-hidden={onEdit ? undefined : "true"}
          title={hasPast
            ? `Repeat of last season — SY: ${s.prev_sells_sy ? 'yes' : 'no'},`
              + ` WHS 000: ${s.prev_sells_000 ? 'yes' : 'no'}`
              + (s.past_seasons ? ` · ran in ${s.past_seasons} earlier season`
                  + `${s.past_seasons === 1 ? '' : 's'}` : '')
            : undefined}>
          {onEdit && (
            <button type="button" className="sheet-next-hit"
              title="Click to flag NEED NEW PHOTO"
              aria-label={`Flag ${s.name} as needing a new photo`}
              onClick={(e) => { e.stopPropagation(); onEdit(s, 'needs_photo', 'true'); }}
              onDoubleClick={(e) => e.stopPropagation()} />
          )}
          {/* The ring is read off the season links, not clicked on. It says
              the garment ran in BOTH of the two previous seasons, which is a
              fact about the links — so there is nothing to set, and no way for
              a hand-applied ring to disagree with the data under it.

              Both circles take the same ring: running two seasons back is a
              property of the garment, not of one channel.

              Yellow is not drawn. It is meant to mean "ran before, but that
              past season is not confirmed", and what makes a season confirmed
              is still open (docs/caveats.md §10). */}
          {hasPast && [
            ['sy', s.prev_sells_sy, 'SY'],
            ['whs', s.prev_sells_000, 'WHS 000'],
          ].map(([channel, on, label]) => {
            const className = `sheet-next-dot ${channel}${on ? ' on' : ''}`
              + (s.repeats_two_past ? ' ring-orange' : '');
            const title = `Last season, ${label}: ${on ? 'yes' : 'no'}`
              + (s.repeats_two_past ? ' — ran in the two previous seasons' : '');
            return <i key={channel} className={className} title={title} />;
          })}
        </div>
      )}

      <div
        className={`sheet-photo${frameMark ? ` mark-${frameMark}` : ''}${
          open ? ' can-open' : ''}`}
        onDoubleClick={open}
        title={open ? `Double-click to open ${s.name}` : undefined}
        // Dropping a file anywhere on the frame is the quickest way through a
        // collection: no dialog, no editor, one drag per style.
        onDragOver={onPhoto ? (e) => {
          if (!e.dataTransfer.types.includes('Files')) return;   // not a card
          e.preventDefault();
          e.stopPropagation();
        } : undefined}
        onDrop={onPhoto ? (e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          e.stopPropagation();
          takeFile(e.dataTransfer.files[0]);
        } : undefined}>
        {s.image_path
          ? <img src={s.image_path} alt={s.name} />
          : <Shirt size={38} strokeWidth={1.3} />}

        {onEdit && (
          <>
            <button type="button"
              className={`sheet-note-open${s.notes ? ' has-note' : ''}`}
              title={s.notes ? `Note: ${s.notes}` : `Add a note to ${s.name}`}
              aria-label={`Note for ${s.name}`}
              aria-expanded={noteOpen}
              onClick={(e) => { e.stopPropagation(); setNoteOpen((v) => !v); }}
              onDoubleClick={(e) => e.stopPropagation()}>
              <StickyNote size={11} strokeWidth={2.2} />
            </button>

          </>
        )}

        {onPhoto && (
          <>
            <input
              id={fileId}
              ref={fileRef}
              className="sheet-photo-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                takeFile(e.target.files?.[0]);
                e.target.value = '';      // so the same file can be picked again
              }}
            />
            <button
              type="button"
              className="sheet-photo-add"
              disabled={busy}
              title={s.image_path ? `Replace the photo for ${s.name}`
                                  : `Add a photo for ${s.name}`}
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              // The frame opens the style on double-click; two quick clicks on
              // this button must not do that as well.
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <ImagePlus size={15} />
              {busy ? 'Uploading…' : s.image_path ? 'Replace' : 'Add photo'}
            </button>
          </>
        )}
      </div>

      {/* Which channels the style sells through. Kept even when the style
          carries no badge, so the table below starts at the same height on
          every card. */}
      {view === 'sales' && (
        <div className="sheet-badges">
          {CHANNEL_MARK[s.whs_channel] && (
            <span className={`sheet-chan ${CHANNEL_MARK[s.whs_channel]}`}>
              {s.whs_channel}
            </span>
          )}
        </div>
      )}

      {/* Beside the card rather than in it: at 160px there is no room to
          write in, and the photo clips its own contents. */}
      {noteOpen && (
        <div className="sheet-note-panel" onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={note}
            placeholder={`Note for ${s.name}`}
            aria-label={`Note for ${s.name}`}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setNote(s.notes || ''); setNoteOpen(false); }
            }}
          />
          <div className="sheet-note-actions">
            <button type="button" className="btn-chip"
              onClick={() => { onEdit(s, 'notes', note); setNoteOpen(false); }}>
              Save
            </button>
            <button type="button" className="btn-chip ghost"
              onClick={() => { setNote(s.notes || ''); setNoteOpen(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Under the photo and above the name, which is where it is read: the
          note is about the garment in the picture.

          Always rendered, blank when there is nothing to say, so a card with
          a note and one without keep their names on the same line. The empty
          one shows no yellow — it holds the space and nothing else. */}
      <div className={`sheet-note${s.notes ? '' : ' empty'}`}>{s.notes || ''}</div>

      <div className={`sheet-name${nameMark ? ` mark-${nameMark}` : ''}`}>
        {s.name}
      </div>

      {view === 'sales' ? (
        <table className="sheet-sales">
          <thead>
            <tr><th /><th>WHS 000</th><th>SY</th></tr>
          </thead>
          <tbody>
            {s.colorways.map((c) => (
              <tr key={c}>
                {/* Same pen as the Matrix sheet: it is the same colourway, and
                    a name written in red there that is black here would read
                    as two different things. */}
                <th scope="row"
                  className={penOf(s, c) ? `pen-${penOf(s, c)}` : undefined}>
                  {breakable(c)}
                </th>
                <td>{cell(qty(s, c, 'whs_000'))}</td>
                <td>{cell(qty(s, c, 'sy'))}</td>
              </tr>
            ))}
            {s.colorways.length === 0 && (
              <tr><th scope="row" className="none">no colourways</th><td /><td /></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">TOTAL</th>
              <td>{cell(sum(s, 'whs_000'))}</td>
              <td>{cell(sum(s, 'sy'))}</td>
            </tr>
          </tfoot>
        </table>
      ) : (<>
        {/* Worked out, never set: a garment that ran in an earlier season is
            a repeat, and one that did not is new. The product link answers it.

            Read off last_season rather than is_repeat, because is_repeat is
            true of a style linked only FORWARD — 4 of the 36 in S26/BEACH —
            and something that has not run yet is not a repeat of anything. */}
        <div className={`sheet-repeat${s.last_season ? ' repeat' : ' new'}`}
          title={s.last_season
            ? `Ran before, most recently in ${s.last_season}`
            : 'No earlier season for this garment'}>
          {s.last_season ? 'EXACT REPEAT' : 'NEW'}
        </div>

        {/* Three bands, ruled apart: the sample colour, the main list, and
            a third below the red rule. The band is stored per colourway, so a
            colour is dragged between them rather than being wherever it
            happens to sit in one long list.

            Each band is its own <ul> so an EMPTY one can still be dropped
            into — a single list would have no target to aim at once the last
            colour had been dragged out of a band. */}
        {COLORWAY_ZONES.map((zone, zi) => {
          const colours = bands[zone];
          // The rule above this band. The first band has nothing above it.
          const rule = zi === 0 ? null : (zi === 1 ? 'black' : 'red');
          // On paper a rule separating nothing from nothing is a stray line;
          // while editing it is the boundary you drag across, so it stays.
          const showRule = rule && (onEdit
            || (colours.length && (bands[COLORWAY_ZONES[zi - 1]].length
                                   || zi === 2)));
          return (
            <Fragment key={zone}>
              {showRule && (
                <div className={`sheet-colour-rule ${rule}`} aria-hidden="true" />
              )}
              <ul
                className={`sheet-colours band-${zone}`
                  + (dropZone === zone ? ' drop-here' : '')}
                data-zone={zone}
                onDragOver={onArrange ? (e) => {
                  if (!dragColour) return;
                  // A full band does not light up — it would be offering a
                  // drop it is about to refuse.
                  if (zoneIsFull(bands, zone) && !bands[zone].includes(dragColour)) return;
                  if (!allowsZone(s, zone)) return;   // nothing to light up
                  e.preventDefault();
                  e.stopPropagation();
                  setDropZone(zone);
                } : undefined}
                onDragLeave={onArrange ? () => setDropZone(null) : undefined}
                onDrop={onArrange ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropOn(zone);
                } : undefined}
              >
                {colours.map((c) => {
                  const lit = litOf(s.colorway_highlights?.[c]);
                  // Two different things: `mark` is what someone applied by
                  // hand, which is what the pen cycles through; `pen` is what
                  // the name is actually written in, which falls back to green
                  // for a colour new this season.
                  const mark = s.colorway_marks?.[c] || '';
                  const pen = penOf(s, c, zone);
                  const className = [pen && `pen-${pen}`, `lit-${lit}`,
                    dragColour === c && 'dragging',
                    // Faded rather than removed: the colour is really there,
                    // and someone has to be able to drag it where it belongs.
                    !allowsZone(s, zone) && 'off-channel']
                    .filter(Boolean).join(' ');
                  return (
                    <li key={c} className={className}
                      draggable={onArrange ? true : undefined}
                      onDragStart={onArrange ? (e) => {
                        // Stops the CARD being dragged instead of the row:
                        // the card is draggable too, for the grid.
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', c);
                        setDragColour(c);
                      } : undefined}
                      onDragEnd={onArrange ? () => {
                        setDragColour(null); setDropZone(null);
                      } : undefined}
                      onDragOver={onArrange ? (e) => {
                        if (!dragColour || dragColour === c) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDropZone(zone);
                      } : undefined}
                      onDrop={onArrange ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropOn(zone);
                      } : undefined}>
                {onRenameColour ? (
                  <input
                    className="sheet-colour-name"
                    defaultValue={c}
                    aria-label={`Colourway of ${s.name}`}
                    onClick={(e) => e.stopPropagation()}
                    onInput={(e) => {
                      // Upper-cased as it is typed, so the field shows what will be
                      // stored. A CSS text-transform would only look right.
                      const at = e.target.selectionStart;
                      e.target.value = e.target.value.toUpperCase();
                      e.target.setSelectionRange(at, at);
                    }}
                    onBlur={(e) => {
                      const next = e.target.value.trim().toUpperCase();
                      if (!next || next === c) { e.target.value = c; return; }
                      onRenameColour(s, c, next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.target.blur();
                      if (e.key === 'Escape') { e.target.value = c; e.target.blur(); }
                    }}
                  />
                ) : breakable(c)}

                {onMarkColour && confirming !== c && (
                  <button type="button" className={`sheet-colour-pen-dot ${
                    pen ? `pen-${pen}` : 'none'}`}
                    title={pen
                      ? `Written in ${pen} — click for the next pen`
                      : 'Click to colour this name'}
                    aria-label={`Pen for ${c}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkColour(s, c, nextColorwayMark(mark, zone));
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}>A</button>
                )}

                {onHighlightColour && confirming !== c && (
                  <button type="button" className="sheet-colour-lit"
                    title={`Highlighted ${lit} — click to switch to ${
                      nextColorwayHighlight(lit)}`}
                    aria-label={`Highlight ${c}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onHighlightColour(s, c, nextColorwayHighlight(lit));
                    }}
                    onDoubleClick={(e) => e.stopPropagation()} />
                )}

                {/* Removing a colourway takes its yarn lines, its operation
                    overrides and any sold quantities fetched against it —
                    so it asks first. The confirm replaces the row's other
                    controls rather than opening a dialog: the question is
                    about this row, and it is answered where it is asked. */}
                {onDeleteColour && (confirming === c ? (
                  <>
                    <button type="button" className="sheet-colour-yes"
                      title={`Remove ${c} and anything filed under it`}
                      aria-label={`Confirm removing ${c}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirming(null);
                        onDeleteColour(s, c);
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}>
                      <Check size={11} strokeWidth={3} />
                    </button>
                    <button type="button" className="sheet-colour-no"
                      title="Keep it"
                      aria-label={`Keep ${c}`}
                      onClick={(e) => { e.stopPropagation(); setConfirming(null); }}
                      onDoubleClick={(e) => e.stopPropagation()}>
                      <X size={11} strokeWidth={3} />
                    </button>
                  </>
                ) : (
                  <button type="button" className="sheet-colour-del"
                    title={`Remove ${c}`}
                    aria-label={`Remove ${c}`}
                    onClick={(e) => { e.stopPropagation(); setConfirming(c); }}
                    onDoubleClick={(e) => e.stopPropagation()}>
                    <X size={10} strokeWidth={2.6} />
                  </button>
                ))}
                    </li>
                  );
                })}
                {/* One add bar under every band, each adding into the band
                    it sits under — including the sample band, above the black
                    rule. */}
                {onAddColour && !zoneIsFull(bands, zone) && (
                <li className={`sheet-colour-add ${zone}`}>
                  {adding === zone ? (
              <input
                className="sheet-colour-name"
                autoFocus
                value={newColour}
                placeholder="Colourway name"
                aria-label={`New colourway for ${s.name}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setNewColour(e.target.value.toUpperCase())}
                // Enter keeps the field open for the next one; a card
                // usually gains several colours in one sitting. Escape or
                // clicking away closes it.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); submitColour(); }
                  if (e.key === 'Escape') { setNewColour(''); setAdding(false); }
                }}
                onBlur={() => { if (!newColour.trim()) setAdding(false); }}
              />
            ) : (
              <button type="button"
                disabled={!allowsZone(s, zone)}
                title={allowsZone(s, zone)
                  ? `Add a colourway to ${s.name}`
                  : `${s.name} sells through ${s.whs_channel} — a colourway`
                    + ' here would be on the other channel'}
                aria-label={`Add a colourway to ${s.name}`}
                onClick={(e) => { e.stopPropagation(); setAdding(zone); }}
                onDoubleClick={(e) => e.stopPropagation()}>
                <Plus size={11} strokeWidth={2.6} />
              </button>
            )}
                </li>
                )}

                {/* Blank rows LAST, so the add bar sits directly under the
                    colours — at the top of the band when there are none —
                    rather than being pushed to the bottom by the padding.
                    Only the main band: the sample band is one row by
                    definition, and below the red rule a card is free to be
                    whatever height its content makes it. */}
                {zone === 'main' && Array.from(
                  { length: Math.max(0, minMainRows - colours.length) },
                  (_, i) => (
                    <li key={`pad-${i}`} className="sheet-colour-pad"
                      aria-hidden="true" />
                  ))}
              </ul>
            </Fragment>
          );
        })}

        {/* What has been prepared. Filled means done, the way the workbook
            greys a row in. */}
        {steps.length > 0 && (
          <div className="sheet-steps">
            {steps.map((st) => (
              <span key={st.code}
                className={`sheet-step${s.steps?.[st.code] ? ' done' : ''}`}
                title={st.label}>
                {st.code}
              </span>
            ))}
          </div>
        )}

        <dl className="sheet-attrs">
          {attributesOf(s).map((a) => {
            if (!onEdit || !a.field) {
              return (
                <dd key={a.key}
                  className={[a.value ? '' : 'empty', a.swatchClass]
                    .filter(Boolean).join(' ') || undefined}
                  title={a.label}>
                  {a.value}
                </dd>
              );
            }
            if (a.choices) {
              return (
                <dd key={a.key}
                  className={`editing ${a.swatchClass}`.trim()}
                  title={a.label}>
                  <select
                    className="sheet-attr-input"
                    value={a.raw || ''}
                    aria-label={`${a.label} — ${s.name}`}
                    onChange={(e) => onEdit(s, a.key, e.target.value)}
                  >
                    <option value="">—</option>
                    {/* Anything already stored that is not on the list is
                        offered too, so opening the field cannot silently
                        drop a value somebody meant. */}
                    {(a.choices.includes(a.raw)
                      ? a.choices
                      : [...a.choices, a.raw].filter(Boolean)
                    ).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </dd>
              );
            }
            const shown = a.shown ? a.shown(a.raw) : a.raw;
            return (
              <dd key={a.key}
                className={`editing${a.suffix ? ' has-suffix' : ''}`}
                title={a.label}>
                <input
                  className={`sheet-attr-input${a.inherited ? ' inherited' : ''}`}
                  defaultValue={shown}
                  inputMode={a.inputMode || (a.numeric ? 'numeric' : undefined)}
                  list={a.options ? `${a.options}-list` : undefined}
                  aria-label={`${a.label} — ${s.name}`}
                  placeholder={a.suffix ? '' : a.label}
                  title={a.inherited
                    ? `${a.label} — from the ends count. Type here to override it.`
                    : a.label}
                  // Saved on blur rather than per keystroke: a cell is a
                  // thought, not a stream, and a request per character would
                  // race itself. An untouched inherited value is not saved,
                  // which would turn a fallback into a stored override just
                  // by tabbing past it.
                  onBlur={(e) => {
                    if (e.target.value === String(shown)) return;
                    onEdit(s, a.key, a.parse ? a.parse(e.target.value) : e.target.value);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                />
                {a.suffix && (
                  <span className="sheet-attr-suffix" aria-hidden="true">
                    {a.suffix}
                  </span>
                )}
              </dd>
            );
          })}
        </dl>
      </>)}

      {/* Rendered per card rather than once per page so the card stays
          self-contained; identical ids collapse to one list in the browser. */}
      {onEdit && Object.entries(options).map(([name, values]) => (
        <datalist key={name} id={`${name}-list`}>
          {values.map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}
    </div>
  );
}
