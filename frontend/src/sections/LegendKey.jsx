import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound } from 'lucide-react';

/**
 * The key to the Layout sheet — what the colours and marks on a card mean.
 *
 * The sheet carries meaning in colour: a repeat is tinted, a highlight pen is
 * a colour someone chose by hand, a colourway mark is a dot. All of it is
 * obvious to whoever applied it and to nobody else, so the page has to say so
 * somewhere. It floats under the TBD tray rather than sitting in the page,
 * because it is read while looking at a card, not before scrolling to one.
 *
 * ---------------------------------------------------------------------
 * TO FILL IT IN: write the rows into LEGEND below. That array is the whole
 * contents — nothing else in this file needs touching, and nothing reads it
 * from the database. One object per row:
 *
 *   heading  a divider label. On its own: { heading: 'The number' }, or
 *            with a `note` for a plain sub-line under it.
 *   sub      on a heading, makes it a sub-heading under the section
 *            above it. Without it a heading IS a section — darker,
 *            with a rule under it.
 *   also     on a heading, a second band name under the first with an "&"
 *            between them. For two bands that take the SAME keys: listing
 *            them twice says they might differ.
 *   swatch   a colour chip. Any CSS colour.
 *   round    draw the chip as a circle, for the keys that ARE circles.
 *   ring     a colour drawn as a ring OUTSIDE the chip, for a key that
 *            is a ring rather than a fill. Pair it with a `swatch` for
 *            what sits inside, usually '#fff'.
 *   cross    draw a black X through the chip, for the keys the card marks
 *            with one.
 *   mark     a character or two in a chip, for a key that is a mark rather
 *            than a colour. Use one of swatch or mark, not both.
 *   label    what it means. Short — it sits on one line. Not the name
 *            of the colour: the chip beside it already shows that.
 *   note     optional second line. Used by nothing at the moment — one
 *            line per key is the rule, and a key that needs two lines
 *            is usually a label that has not been cut down yet.
 *
 * The colours below are the card's own, taken from styles.css. If one of them
 * changes there, change it here too — a legend that disagrees with the sheet
 * is worse than no legend.
 * --------------------------------------------------------------------- */

// Pink is 000 and red is SY, wherever either appears on a card. The number
// cell and the repeat circles both say it, which is why they share a chip
// colour here.
const C_000 = '#ED70F8';
const C_SY = '#EA3323';

// The pens, written once and used in each band that offers them. A colour
// changed here changes everywhere it appears, which is the point: the same
// pen must not come to mean two things in two bands.
const BLACK = '#1b1b1b';
const GREEN = '#4FAE5B';

// The three hand pens that have a meaning of their own, rather than a place
// in the new/repeat × 000-only grid above. Straight from --pen-* in
// styles.css. Magenta is not here: it is the "new colour, 000 only" pink in
// BAND_PENS, so it belongs to the grid.
const PEN_BLUE = '#2A64F6';
const PEN_PURPLE = '#8C1AF5';
const PEN_RED = '#EA3323';

// The pens the first two bands offer, written once and used in both. A
// colour changed here changes in both places, which is the point: the same
// pen must not come to mean two things in two bands.
//
// Read down the column and the four are one rule stated twice — two pens
// for a colour that sells on both channels, two more for the same two
// states when it sells on 000 only. The channels are written "000 + SY" in
// both, in that order, so the pair reads as one phrase.
//
// No row names its own colour. The chip beside it IS the colour, and
// "Green — new colour" spends the line saying what the reader can already
// see instead of what it means. So the label is the meaning, straight.
const BAND_PENS = [
  { swatch: GREEN, label: 'New colour — 000 + SY' },
  { swatch: BLACK, label: 'Repeat colour — 000 + SY' },
  { swatch: '#EA35F7', label: 'New colour, 000 only' },
  { swatch: '#F6B3F0', label: 'Repeat colour, 000 only' },
];

export const LEGEND = [
  { heading: 'The number' },
  { swatch: C_000, label: '000 only' },
  { swatch: C_SY, label: 'SY only' },
  // A style with no channel recorded is drawn the same as BOTH — both
  // cells are white — so one key covers the two.
  { swatch: '#fff', label: 'Both channels' },

  { heading: 'Above the photo' },
  // Crossed, because a filled dot on a card carries an X — the mark the
  // Matrix Master workbook puts in it. The hollow one below does not: there
  // is nothing to mark where the garment did not sell.
  { swatch: C_000, round: true, cross: true, label: 'Repeat, sold 000 last season' },
  { swatch: C_SY, round: true, cross: true, label: 'Repeat, sold SY last season' },
  { swatch: '#fff', round: true, label: 'Repeat, but not on that channel' },
  // The ring is read off the season links, not applied by hand.
  // A RING, not a fill. On the card the ring is drawn outside the dot as a
  // box-shadow and the dot keeps its own channel colour underneath, so the
  // key has to be a ring too — shown round a plain dot, because the ring
  // means the same thing whichever colour it encircles.
  { swatch: '#fff', round: true, ring: '#DE8344',
    label: 'Ran in the two previous seasons' },
  // Reserved, and NOT DRAWN YET. --ring-yellow and .sheet-next-dot.ring-yellow
  // exist in styles.css, but nothing sets the class: what makes a past season
  // confirmed is still open (docs/caveats.md §10). Listed here because the
  // meaning is settled even though the mark is not.
  { swatch: '#fff', round: true, ring: '#FFFF54',
    label: 'Not sure it is a repeat' },
  // No circles at all is itself the answer, and the most common one.
  { mark: '—', label: 'No circles: not a repeat' },

  // Set out by band rather than as one list of four, because WHICH pens can
  // appear differs: the first two bands take all four, the third takes two.
  // Someone reading the third band should not have to work out for
  // themselves that the two pink rows are not about it.
  //
  // Two facts crossed, not four unrelated pens: is the colour new or a
  // repeat, and does it sell on 000 only. Green/black is the first fact;
  // pink/light pink is that same fact with the second one added.
  // One title over all three bands. They are three readings of the same
  // thing — what colour a colourway's name is written in — and without it
  // the numbered headings look like three unrelated sections.
  { heading: 'Colourway font colour' },
  // One heading over both, not two headings with the same four keys under
  // each. The bands take an identical set, and printing it twice invites
  // the reader to hunt for the difference — and leaves two lists to keep
  // in step the next time a pen changes.
  { heading: '1 · Above the black rule — SAMPLE COLOUR', sub: true,
    also: '2 · Between the two rules' },
  ...BAND_PENS,
  // Two pens, not four: the band is SY-ONLY by position, so a pen saying
  // "000 only" would contradict the band it is written in.
  { heading: '3 · Below the red rule — SY-ONLY', sub: true },
  { swatch: GREEN, label: 'New colour' },
  { swatch: BLACK, label: 'Repeat colour' },

  // The pens that are not part of the grid. Green/black/pink/light pink
  // answer two questions about every colour; these three say one particular
  // thing about one colour, which is why they are listed apart rather than
  // repeated under each band.
  //
  // Where the card offers them (ZONE_PENS in SheetCard.jsx): purple between
  // the rules, red and blue below the red rule. Which fits what they mean —
  // two of the three are about SY, and SY is the band under the red rule.
  { heading: 'Misc', sub: true },
  { swatch: PEN_BLUE, label: 'Discontinued colour for SY' },
  { swatch: PEN_PURPLE, label: 'Year round colour' },
  { swatch: PEN_RED, label: 'Hold colour for SY' },

  { heading: 'Colourway row' },
  { swatch: '#FFFF54', label: 'Untouched' },
  { swatch: '#D9D9D9', label: 'Switched by hand' },

  { heading: 'At the foot' },
  { swatch: '#1b1b1b', label: 'Step done' },
  { swatch: '#fff', label: 'Step not done yet' },

  // ------------------------------------------------------------------
  // STILL TO SAY. Applied by hand, and the app records no meaning for
  // them — only whoever marks them knows, so they have to be written down
  // rather than worked out. Uncomment and finish each line.
  //
  // { heading: 'Marked by hand' },
  // { swatch: '#75FB4C', label: 'Green bar', note: '' },
  // { swatch: '#F5C342', label: 'Amber bar', note: '' },
  // { swatch: '#68C8FA', label: 'Blue bar', note: '' },
  // { swatch: '#8D3AF6', label: 'Purple band', note: '' },
  // { mark: '★', label: 'Star on the purple band', note: '' },
  // ------------------------------------------------------------------
];

/* ---------------------------------------------------------------------
 * WHAT THE APP ACTUALLY DRAWS TODAY, against the four name pens above.
 *
 * Green and black are right: penOf() in SheetCard.jsx derives them from
 * new_colorways, which matrix_rows works out in SQL by matching the colour
 * against earlier seasons of the same product. Nobody picks them, and they
 * cannot disagree with the data.
 *
 * Pink and light pink are NOT drawn. The app has no such pens. What it has
 * instead is four hand-applied pens — magenta, purple, red and blue —
 * offered two per band. Of those, magenta (#EA35F7) is the pink above;
 * there is no light pink at all.
 *
 * The missing half is "does this colour sell on 000 only". style_colorways
 * now has whs_channel for exactly that, and the style editor writes it, but
 * all 3,582 rows are still null — nothing has been imported, so the fact
 * still lives only in the pen someone applies by hand.
 *
 * So making the sheet match this legend is: derive the pen from the two
 * facts rather than offering four colours, and fill in the column. Until
 * then these two rows describe the workbook, not the screen.
 *
 * The other three pens DO mean what the Misc rows say — blue, purple and
 * red are applied by hand and nothing derives them, so the legend is the
 * only place that meaning is written down. They are not part of the grid:
 * the grid answers two questions about every colour, and these say one
 * particular thing about one colour.
 * ------------------------------------------------------------------- */

// An empty key still shows, as a panel saying it is not filled in yet, so it
// is visible that the thing exists. Flip this to true and the whole widget
// stays off the page until LEGEND has rows in it.
const HIDE_WHEN_EMPTY = false;

const OPEN_KEY = 'im-master:legend-open';

export default function LegendKey({ title = 'Legend' }) {
  const [open, setOpen] = useState(true);

  // Remembered per browser, like the TBD tray: a panel someone collapsed
  // should stay collapsed. It is a convenience, not state anything relies
  // on — a browser that refuses to store it just starts open.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPEN_KEY);
      if (saved !== null) setOpen(saved === '1');
    } catch { /* starts open */ }
  }, []);

  const toggle = () => {
    setOpen((was) => {
      try { window.localStorage.setItem(OPEN_KEY, was ? '0' : '1'); } catch { /* fine */ }
      return !was;
    });
  };

  if (HIDE_WHEN_EMPTY && LEGEND.length === 0) return null;

  return (
    <aside className={`legend-key${open ? '' : ' shut'}`} aria-label="What the marks on a card mean">
      <button type="button" className="legend-head" onClick={toggle} aria-expanded={open}>
        <KeyRound size={15} />
        <span className="legend-title">{title}</span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>

      {open && (
        <div className="legend-body">
          {LEGEND.length === 0 ? (
            <p className="legend-empty">Not filled in yet.</p>
          ) : (
            <ul className="legend-list">
              {LEGEND.map((row, i) => (
                // The label is the identity here — there is no id to key on,
                // and these rows are written by hand, not reordered at runtime.
                <li key={`${row.heading || row.label}-${i}`}
                  className={row.heading
                    ? `legend-group${row.sub ? ' sub' : ''}` : undefined}>
                  {row.heading ? (
                    <>
                      {row.heading}
                      {row.also && (
                        <>
                          <span className="legend-group-amp">&amp;</span>
                          {row.also}
                        </>
                      )}
                      {row.note && <span className="legend-group-note">{row.note}</span>}
                    </>
                  ) : (
                    <>
                      {row.mark
                        ? <span className="legend-mark" aria-hidden="true">{row.mark}</span>
                        : <span className={`legend-swatch${row.round ? ' round' : ''}`
                            + `${row.cross ? ' crossed' : ''}`}
                            aria-hidden="true"
                            style={{
                              background: row.swatch || 'transparent',
                              // Outside the chip, like the card's own ring,
                              // so it reads as a ring and not a thick border.
                              ...(row.ring
                                ? { boxShadow: `0 0 0 2px ${row.ring}` } : null),
                            }} />}
                      <span className="legend-text">
                        <span className="legend-label">{row.label}</span>
                        {row.note && <span className="legend-note">{row.note}</span>}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
