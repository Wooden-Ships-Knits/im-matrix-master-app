import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpZA, Check, Filter, Search, X } from 'lucide-react';

/**
 * The funnel on a column header: sort, search, and tick the values to keep.
 *
 * Shaped after the spreadsheet the Matrix replaces, because that is where
 * the team already knows how to narrow a column down — the same three things
 * in the same order, so nobody has to be taught this one.
 *
 * It owns no data. The page holds which values are kept and which column is
 * sorted, and hands both back down: a filter that remembered its own state
 * would disagree with the table the moment a row changed underneath it.
 *
 * BLANK is a real choice, not the absence of one — "which styles still have
 * no construction" is the question this grid gets asked most, and a list
 * that quietly dropped the empties could not answer it.
 */
export const BLANK = '';
const BLANK_LABEL = '(Blank)';

// Drawn in a fixed layer rather than inside the <th>. The grid scrolls
// sideways inside .chk-scroll, and a panel positioned in the header is
// clipped by it — overflow-x:auto makes the other axis a scroll box too, so
// there is no way to let it hang out.
function panelStyle(rect) {
  if (!rect) return { visibility: 'hidden' };
  const W = 252;
  // Keep it on screen: a column near the right edge opens leftwards.
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8));
  return { top: `${rect.bottom + 4}px`, left: `${left}px`, width: `${W}px` };
}

export default function ColumnFilter({
  label,
  // Every value this column can show, already in display form.
  values = [],
  // The values being kept, or null for "all of them". Null rather than a
  // full list: a column with no filter must stay unfiltered when a new style
  // is added, and a list of everything-as-of-now would silently exclude it.
  selected = null,
  onChange,
  // 'asc' | 'desc' | null — this column's part of the table's single sort.
  sort = null,
  onSort,
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  // Only when it has actually moved: a scroll inside the panel's own value
  // list fires this too, and a setState per scroll tick made a long list
  // stutter.
  const place = () => {
    const next = btnRef.current?.getBoundingClientRect() || null;
    setRect((was) => (
      was && next && was.top === next.top && was.left === next.left
      && was.bottom === next.bottom ? was : next));
  };

  // Measured before paint, or the panel is drawn at the top-left corner for
  // one frame and jumps.
  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const shut = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;   // the button toggles
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    // Capture, so a scroll inside any container moves the panel with its
    // column rather than leaving it hanging over the wrong one.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', shut, true);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', shut, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const shownValues = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => (v === BLANK ? BLANK_LABEL : v).toLowerCase().includes(q));
  }, [values, find]);

  const keeps = (v) => selected === null || selected.includes(v);

  const toggle = (v) => {
    // The first tick off a clean column turns "everything" into a real list,
    // which is the only point where null has to be spelled out.
    const now = selected === null ? values : selected;
    const next = now.includes(v) ? now.filter((x) => x !== v) : [...now, v];
    // Back to everything is back to no filter, so later rows are not excluded
    // by a list that happens to name them all today.
    onChange(next.length === values.length ? null : next);
  };

  // Only what the search is showing, so "find COTTON, tick all" means that
  // and not "tick all 180 yarns".
  const allShown = shownValues.every(keeps);
  const toggleShown = () => {
    const now = selected === null ? values : selected;
    const next = allShown
      ? now.filter((v) => !shownValues.includes(v))
      : [...new Set([...now, ...shownValues])];
    onChange(next.length === values.length ? null : next);
  };

  const filtered = selected !== null;
  const title = `${label} — ${filtered ? 'filtered' : 'sort and filter'}`;

  return (
    <span className="colf">
      <button
        type="button"
        ref={btnRef}
        className={`colf-btn${filtered ? ' on' : ''}${sort ? ' sorted' : ''}`}
        title={title}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {sort === 'asc' ? <ArrowDownAZ size={13} />
          : sort === 'desc' ? <ArrowUpZA size={13} />
            : <Filter size={12} />}
      </button>

      {open && (
        <div className="colf-panel" ref={panelRef} style={panelStyle(rect)}
          role="dialog" aria-label={`Sort and filter ${label}`}>
          <div className="colf-sorts">
            <button type="button" className={`colf-sort${sort === 'asc' ? ' on' : ''}`}
              onClick={() => onSort(sort === 'asc' ? null : 'asc')}>
              <ArrowDownAZ size={13} /> A → Z
            </button>
            <button type="button" className={`colf-sort${sort === 'desc' ? ' on' : ''}`}
              onClick={() => onSort(sort === 'desc' ? null : 'desc')}>
              <ArrowUpZA size={13} /> Z → A
            </button>
          </div>

          <div className="colf-find">
            <Search size={13} aria-hidden="true" />
            <input
              className="colf-find-input"
              value={find}
              placeholder="Search values"
              aria-label={`Search the values in ${label}`}
              autoFocus
              onChange={(e) => setFind(e.target.value)}
            />
            {find && (
              <button type="button" className="colf-find-clear" aria-label="Clear the search"
                onClick={() => setFind('')}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="colf-bar">
            <button type="button" className="colf-link" onClick={toggleShown}
              disabled={shownValues.length === 0}>
              {allShown && shownValues.length > 0 ? 'Clear these' : 'Select these'}
            </button>
            <span className="colf-n">{shownValues.length}</span>
          </div>

          <ul className="colf-list">
            {shownValues.length === 0 && <li className="colf-none">Nothing matches.</li>}
            {shownValues.map((v) => (
              <li key={v || '\u0000blank'}>
                <label className="colf-row">
                  <span className={`colf-tick${keeps(v) ? ' on' : ''}`} aria-hidden="true">
                    {keeps(v) && <Check size={11} strokeWidth={3.5} />}
                  </span>
                  <input type="checkbox" className="sr-only"
                    checked={keeps(v)} onChange={() => toggle(v)} />
                  <span className={`colf-val${v === BLANK ? ' blank' : ''}`}>
                    {v === BLANK ? BLANK_LABEL : v}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {filtered && (
            <button type="button" className="colf-reset" onClick={() => onChange(null)}>
              Show all in this column
            </button>
          )}
        </div>
      )}
    </span>
  );
}
