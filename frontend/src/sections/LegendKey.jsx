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
 *   heading  a divider label. On its own: { heading: 'The number' }
 *   swatch   a colour chip. Any CSS colour.
 *   round    draw the chip as a circle, for the keys that ARE circles.
 *   mark     a character or two in a chip, for a key that is a mark rather
 *            than a colour. Use one of swatch or mark, not both.
 *   label    what it means. Short — it sits on one line.
 *   note     optional second line, for when the label needs a qualifier.
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

export const LEGEND = [
  { heading: 'The number' },
  { swatch: C_000, label: '000 only', note: 'Sells wholesale only' },
  { swatch: C_SY, label: 'SY only', note: 'Web store only. Numbered S1, S2… on its own run' },
  { swatch: '#fff', label: 'Both channels', note: 'Also how a blank reads' },

  { heading: 'Above the photo' },
  { swatch: C_000, round: true, label: 'Repeat, sold 000 last season' },
  { swatch: C_SY, round: true, label: 'Repeat, sold SY last season' },
  { swatch: '#fff', round: true, label: 'Repeat, but not on that channel' },
  // The ring is read off the season links, not applied by hand.
  { swatch: '#DE8344', round: true, label: 'Ran in the two previous seasons' },
  // No circles at all is itself the answer, and the most common one.
  { mark: '—', label: 'No circles: not a repeat' },

  { heading: 'Colourways' },
  { mark: '1', label: 'Above the black rule', note: 'The sample colour' },
  { mark: '2', label: 'Between the rules', note: 'WHS 000' },
  { mark: '3', label: 'Below the red rule', note: 'SY' },
  { swatch: '#FFFF54', label: 'Yellow row', note: 'Untouched — the state every row starts in' },
  { swatch: '#D9D9D9', label: 'Grey row', note: 'Switched by hand' },
  { swatch: '#4FAE5B', label: 'Green name', note: 'New to this garment this season' },
  { swatch: '#1b1b1b', label: 'Black name', note: 'Carried over from a previous season' },

  { heading: 'At the foot' },
  { swatch: '#1b1b1b', label: 'Filled step chip', note: 'That step is done' },
  { swatch: '#fff', label: 'Outlined step chip', note: 'Not done yet' },

  // ------------------------------------------------------------------
  // STILL TO SAY. These three are applied by hand and the app records no
  // meaning for them — only whoever marks them knows what they mean, so
  // they have to be written down rather than worked out. Uncomment and
  // finish each line.
  //
  // { heading: 'Marked by hand' },
  // { swatch: '#75FB4C', label: 'Green bar', note: '' },
  // { swatch: '#F5C342', label: 'Amber bar', note: '' },
  // { swatch: '#68C8FA', label: 'Blue bar', note: '' },
  // { swatch: '#8D3AF6', label: 'Purple band', note: '' },
  // { mark: '★', label: 'Star on the purple band', note: '' },
  // { swatch: '#EA35F7', label: 'Magenta name', note: '' },   // WHS band
  // { swatch: '#8C1AF5', label: 'Purple name', note: '' },    // WHS band
  // { swatch: '#EA3323', label: 'Red name', note: '' },       // SY band
  // { swatch: '#2A64F6', label: 'Blue name', note: '' },      // SY band
  // ------------------------------------------------------------------
];

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
                  className={row.heading ? 'legend-group' : undefined}>
                  {row.heading ? row.heading : (
                    <>
                      {row.mark
                        ? <span className="legend-mark" aria-hidden="true">{row.mark}</span>
                        : <span className={`legend-swatch${row.round ? ' round' : ''}`}
                            aria-hidden="true"
                            style={{ background: row.swatch || 'transparent' }} />}
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
