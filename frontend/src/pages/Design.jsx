import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CirclePlus, ClipboardList, TextSearch, Ruler, Shirt, Printer, ListChecks, ZoomIn, ZoomOut } from 'lucide-react';
import { Field } from '../components/ui.jsx';
import { api } from '../api.js';
import Wordmark from '../components/Wordmark.jsx';

/**
 * The design sheets: which yarn sits in each knit slot, per colourway.
 *
 * One sheet per style, as the workbook keeps them — the slots down the side
 * and the colourways across, with the photo beneath:
 *
 *     C1 PLY    | 2                  | 2
 *     C1        | YST ALMOND BUTTER  | YST SILVER DEW
 *     C2 PLY    | 2                  | 2
 *     C2        | YST HUSKY BEIGE    | YST FRIGID GRAY
 *     TAG COLOR | ALMOND BUTTER/…    | SILVER DEW/…
 *
 * Its own page rather than a panel on the style editor, because the editor
 * shows one colourway's bill of materials at a time. Nothing in the app could
 * show that C2 is HUSKY BEIGE in one colourway and FRIGID GRAY in another,
 * and reading across that row is the whole job — it is what catches a slot
 * somebody forgot to change when the colourway was copied.
 *
 * Read-only. The yarns and their ply are edited in the style editor's BOM
 * section, which is where the add-a-line and remove-a-line controls are; a
 * second place to edit the same thing would be a second place to get it
 * wrong.
 */

/**
 * Listen for the rest of a pointer drag, and hand back the way to stop.
 *
 * Every exit a drag can take is here, because the one that was missing is
 * what froze a label mid-air: pointerup when it lands, pointercancel when the
 * system takes the gesture, blur when the button is released over another
 * window, Escape when it is abandoned.
 *
 * On the window, not on the label. Handlers on the element plus
 * setPointerCapture look equivalent and are not — capture is dropped without
 * warning when the element re-renders elsewhere in the tree, which is exactly
 * what a label does when it moves between the photo and the tray.
 *
 * Returns a detach that is safe to call more than once, since several of
 * these paths can race.
 */
export const trackPointer = (target, { onMove, onUp, onBail }) => {
  const move = (e) => onMove(e);
  const up = (e) => onUp(e);
  const bail = () => onBail();
  const key = (e) => { if (e.key === 'Escape') onBail(); };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', bail);
  target.addEventListener('blur', bail);
  target.addEventListener('keydown', key);
  let off = false;
  return () => {
    if (off) return;
    off = true;
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', bail);
    target.removeEventListener('blur', bail);
    target.removeEventListener('keydown', key);
  };
};

// How each sheet was last being looked at, remembered per style so coming
// back lands on the same view rather than at 100%. Keyed by style under one
// entry, since the page draws a whole collection at once and 39 keys for one
// preference is 39 keys.
//
// In the browser, not on the style: a zoom is how somebody is reading the
// sheet today, not a fact about the garment, and two people should be able to
// look at the same style at different magnifications.
//
// Same prefix as the other two remembered things (TbdTray, Checklist).
const ZOOM_KEY = 'im-master:design-zoom';

/** A sheet's saved view: zoom, and where the box was scrolled to. */
const AT_REST = { z: 1, x: 0, y: 0 };

export const readViews = () => {
  let raw;
  try { raw = JSON.parse(window.localStorage.getItem(ZOOM_KEY) || '{}'); }
  catch { return {}; }               // private window, blocked storage, junk
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    // A plain number is the older shape, from before the scroll position was
    // kept. Read as a zoom with the photo at its top-left, which is where it
    // would have been.
    const z = typeof v === 'number' ? v : Number(v?.z);
    if (!Number.isFinite(z) || z < 1) continue;
    out[id] = {
      z,
      x: Math.max(0, Number(v?.x) || 0),
      y: Math.max(0, Number(v?.y) || 0),
    };
  }
  return out;
};

/**
 * Remember how a sheet is being looked at, or forget it once it is back to
 * normal.
 *
 * Forgetting matters: without it the entry grows a key for every style ever
 * zoomed and never loses one, and most of them would say "100%, top left",
 * which is what it would have done anyway.
 */
export const writeView = (id, view) => {
  try {
    const all = readViews();
    const z = Math.max(1, Number(view?.z) || 1);
    const x = Math.max(0, Math.round(Number(view?.x) || 0));
    const y = Math.max(0, Math.round(Number(view?.y) || 0));
    if (z === 1 && x === 0 && y === 0) delete all[String(id)];
    else all[String(id)] = { z, x, y };
    window.localStorage.setItem(ZOOM_KEY, JSON.stringify(all));
  } catch { /* a browser that will not store it just starts at rest */ }
};

// The photo's width at rest, in px, and how far it will go. Here rather than
// in the stylesheet because the zoom multiplies it, and a number the CSS owns
// and the JS guesses at is a number that drifts.
export const PHOTO_WIDTH = 320;
export const MAX_ZOOM = 4;

/** PLY prints as a whole number where it is one — 2, not 2.0. */
export const ply = (v) => {
  if (v == null) return '';
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : String(n);
};

// useLayoutEffect is right in a browser and warns under a server renderer,
// which only the render tests use. Same hook, no noise.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function DesignSheet({ style: s, onMarks = null }) {
  const cols = s.colorways || [];
  const slots = s.slots || [];
  const cell = (slot, cw) => s.cells?.[String(slot)]?.[cw] || {};

  // Where each slot's marker sits on the photo, as fractions. Held locally
  // so a drag draws at once; the server is told on pointer-up.
  const [marks, setMarks] = useState(s.design_marks || {});
  useEffect(() => { setMarks(s.design_marks || {}); }, [s.design_marks]);
  const photoRef = useRef(null);
  const boxRef = useRef(null);
  const ghostRef = useRef(null);

  // How far the photo is blown up. The garment is 320px wide at rest, which
  // is enough to see it and not enough to put a label on the second letter
  // of "merry". Transient: a zoom is how you are looking at the sheet now,
  // not something about the style.
  // The whole view — zoom and scroll — in one ref, written as one thing.
  // Scroll arrives as a stream of events and zoom as single clicks; keeping
  // both here means neither can write a value that undoes the other.
  const view = useRef({ ...AT_REST, ...(readViews()[String(s.id)] || {}) });
  const [zoom, setZoom] = useState(view.current.z);
  // Where the box still has to be scrolled to. Held until it takes, because
  // on a reload the photo has no height yet and scrolling it does nothing.
  const pending = useRef(view.current.x || view.current.y ? { ...view.current } : null);
  const saving = useRef(null);

  const persist = () => writeView(s.id, view.current);

  const zoomTo = (next) => {
    const z = Math.min(Math.max(next, 1), MAX_ZOOM);
    view.current.z = z;
    setZoom(z);
    persist();
  };

  /**
   * Put the box back where it was.
   *
   * Called after mount and again when the photo loads. The first call
   * usually does nothing — the image has no height yet, so there is nothing
   * to scroll and the browser clamps to zero — which is why `pending` is
   * only cleared once the scroll actually took.
   */
  const restore = () => {
    const box = boxRef.current;
    const want = pending.current;
    if (!box || !want) return;
    box.scrollLeft = want.x;
    box.scrollTop = want.y;
    if (Math.abs(box.scrollLeft - want.x) <= 1
        && Math.abs(box.scrollTop - want.y) <= 1) {
      pending.current = null;
    }
  };

  // Scrolling fires continuously, and localStorage is synchronous. Written
  // once the box has been still for a moment rather than per event.
  const onScroll = (e) => {
    if (pending.current) return;     // still being put back; not a real scroll
    const box = e.currentTarget;
    view.current.x = Math.round(box.scrollLeft);
    view.current.y = Math.round(box.scrollTop);
    clearTimeout(saving.current);
    saving.current = setTimeout(persist, 200);
  };

  useBeforePaint(restore, [zoom]);
  useEffect(() => () => clearTimeout(saving.current), []);

  // The live drag lives in a ref, not in state. A pointermove fires dozens of
  // times a second and this sheet can be a 17-row table four colourways wide;
  // re-rendering it per move is what made dragging feel like wading. Only two
  // things re-render, and both change at most twice in a drag: which slot is
  // being dragged, and whether the pointer is over the photo.
  const drag = useRef(null);
  const detach = useRef(null);
  const [dragSlot, setDragSlot] = useState(null);
  const [overPhoto, setOverPhoto] = useState(false);

  // What the window listeners below read. They are registered once per drag
  // and outlive several renders, so reading `marks` from their closure would
  // read whatever it was when the drag started.
  const latest = useRef(null);
  latest.current = { marks, onMarks, style: s };

  const placed = slots.filter((n) => marks[String(n)]);
  const waiting = slots.filter((n) => !marks[String(n)]);

  const save = (next) => {
    const { marks: was, onMarks: fn, style } = latest.current;
    setMarks(next);
    fn?.(style, next)?.catch?.(() => setMarks(was));
  };

  const clamp = (v) => Math.min(Math.max(v, 0), 1);
  // Below this a press is a click, not a drag. Without it, clicking a placed
  // label to see what it says would unplace it.
  const SLOP = 4;

  const end = () => {
    detach.current?.();
    detach.current = null;
    drag.current = null;
    setDragSlot(null);
    setOverPhoto(false);
  };

  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < SLOP
          && Math.abs(e.clientY - d.startY) < SLOP) return;
      d.moved = true;
      setDragSlot(d.slot);          // one render, when it becomes a drag
    }
    d.x = e.clientX - d.offX;
    d.y = e.clientY - d.offY;
    // Straight to the DOM. Through state this would re-render the table.
    const g = ghostRef.current;
    if (g) g.style.transform = `translate(${d.x}px, ${d.y}px) translate(-50%, -50%)`;
    // Same value means React does not re-render, so this only costs anything
    // on the two frames where the pointer crosses the edge of the photo.
    setOverPhoto(onPhoto(d.x, d.y));
  };

  /**
   * Is this point on the visible part of the photo?
   *
   * Two rectangles, not one. Zoomed in, the photo is bigger than the box it
   * sits in and the rest is scrolled out of sight — so a point can be inside
   * the photo's rectangle while sitting visually over the tray next to it.
   * Dropping there would put a label somewhere nobody pointed.
   */
  const onPhoto = (x, y) => {
    const photo = photoRef.current?.getBoundingClientRect();
    const box = boxRef.current?.getBoundingClientRect();
    if (!photo) return false;
    const inside = (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    return inside(photo) && (!box || inside(box));
  };

  const finish = (e) => {
    const d = drag.current;
    const { marks: now } = latest.current;
    end();
    if (!d || !d.moved) return;     // a click changes nothing
    const key = String(d.slot);
    const box = photoRef.current?.getBoundingClientRect();
    const x = e.clientX - d.offX;
    const y = e.clientY - d.offY;
    const on = !!box && onPhoto(x, y);
    // Dropped on the photo places it; dropped anywhere else puts it back in
    // the tray. One gesture both ways, so there is no separate remove.
    if (!on && !(key in now)) return;        // out of the tray, back to it
    const next = { ...now };
    if (on) {
      next[key] = { x: clamp((x - box.left) / box.width),
                    y: clamp((y - box.top) / box.height) };
    } else {
      delete next[key];
    }
    save(next);
  };

  /**
   * Start a drag, and own it from the window until it is let go.
   *
   * Everything after the press belongs to the window — see trackPointer for
   * why the label cannot be trusted to hold its own drag.
   */
  const begin = (slot) => (e) => {
    if (!onMarks || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    end();                                   // never two drags at once
    const box = e.currentTarget.getBoundingClientRect();
    drag.current = {
      slot,
      startX: e.clientX, startY: e.clientY,
      // Where inside the label it was picked up. Kept so the label stays
      // under the part of it you grabbed instead of jumping to centre.
      offX: e.clientX - (box.left + box.width / 2),
      offY: e.clientY - (box.top + box.height / 2),
      x: e.clientX, y: e.clientY,
      moved: false,
    };
    detach.current = trackPointer(window, {
      onMove, onUp: finish, onBail: end,
    });
  };

  // Leaving the page mid-drag must not leave listeners behind.
  useEffect(() => () => { detach.current?.(); }, []);

  // The ghost mounts on the render that starts the drag, so it has no
  // position until the next pointermove — one frame in the corner. Placing it
  // here, before the browser paints, removes that flicker.
  useBeforePaint(() => {
    const d = drag.current;
    const g = ghostRef.current;
    if (d && g) {
      g.style.transform = `translate(${d.x}px, ${d.y}px) translate(-50%, -50%)`;
    }
  }, [dragSlot]);

  // One marker, wherever it currently lives. Only pointerdown is on the
  // label; everything after it belongs to the window, so a label that moves
  // between the photo and the tray mid-drag cannot take the drag with it.
  const marker = (slot, inTray) => {
    const m = marks[String(slot)];
    const style = inTray ? undefined
      : { left: `${(m.x * 100).toFixed(2)}%`, top: `${(m.y * 100).toFixed(2)}%` };
    return (
      <button
        key={slot}
        type="button"
        className={`design-mark${inTray ? ' in-tray' : ''}`
          + (dragSlot === slot ? ' dragging' : '')}
        style={style}
        disabled={!onMarks}
        title={onMarks
          ? `C${slot} — drag onto the garment, or off the photo to put it back`
          : `C${slot}`}
        onPointerDown={begin(slot)}
      >
        C{slot}
      </button>
    );
  };

  return (
    <section className="card card-pad design-sheet">
      <h3 className="design-title">
        {s.style_code ? <span className="design-code">{s.style_code}</span> : null}
        {s.style_code ? ' — ' : ''}{s.name}
        <Link className="btn-chip ghost design-open" to={`/edit/${s.id}`}>
          Open
        </Link>
      </h3>

      {cols.length === 0 ? (
        <p className="design-empty">No colourways on this style yet.</p>
      ) : (
        <div className="design-scroll">
          <table className="design-table">
            <tbody>
              {slots.map((slot) => (
                /* Two rows per slot, the ply above the yarn, exactly as the
                   workbook stacks them. Kept as one <tbody> group so the pair
                   cannot be split across a printed page. */
                <Fragment key={slot}>
                  <tr className="design-ply">
                    <th scope="row">C{slot} PLY</th>
                    {cols.map((cw) => (
                      <td key={cw}>{ply(cell(slot, cw).ply)}</td>
                    ))}
                  </tr>
                  <tr className="design-yarn">
                    <th scope="row">C{slot}</th>
                    {cols.map((cw) => {
                      const v = cell(slot, cw);
                      return (
                        <td key={cw}
                          className={[!v.yarn && 'blank', v.trim && 'is-trim']
                            .filter(Boolean).join(' ') || undefined}
                          title={v.percent != null ? `${v.percent}%` : undefined}>
                          {v.yarn || ''}
                          {/* A zip, button or stamp filed in a yarn slot.
                              Said outright, because the PLY above it then
                              means a count of fastenings, not of strands. */}
                          {v.trim && <span className="design-trim">trim</span>}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              ))}
              <tr className="design-tag">
                <th scope="row">TAG COLOR</th>
                {cols.map((cw) => <td key={cw}>{cw}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Under the table, as the workbook has it: the slots are labelled on
          the garment, so the picture is the legend for the rows above.
          The workbook draws an arrow from C1 to the body and C2 to the yoke;
          these are those arrows, dragged into place. */}
      <div className="design-place">
        <div className="design-photo-wrap">
          {/* The window onto the photo. It scrolls rather than the page, so
              zooming in to place a label does not move the rest of the sheet
              out from under you. */}
          <div className="design-photo-box" ref={boxRef}
            onScroll={s.image_path ? onScroll : undefined}
            // Ctrl or ⌘ and the wheel, the gesture every map and every image
            // viewer uses. A bare wheel is left alone: this box is in the
            // middle of a long page and stealing the scroll would trap it.
            onWheel={s.image_path ? (e) => {
              if (!e.ctrlKey && !e.metaKey) return;
              e.preventDefault();
              zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
            } : undefined}
          >
            <div className={`design-photo${overPhoto ? ' drop-here' : ''}`}
              ref={photoRef}
              style={s.image_path
                ? { width: `${Math.round(PHOTO_WIDTH * zoom)}px` }
                : undefined}>
              {s.image_path
                ? <img src={s.image_path} alt={s.name} draggable="false"
                    // The scroll cannot be put back before there is anything
                    // to scroll, and on a reload that is not until here.
                    onLoad={restore} />
                : <span className="design-nophoto"><Shirt size={30} strokeWidth={1.2} /> No photo</span>}
              {placed.map((n) => marker(n, false))}
            </div>
          </div>

          {s.image_path && (
            <div className="design-zoom">
              <button type="button" className="btn-chip ghost" disabled={zoom <= 1}
                title="Zoom out" onClick={() => zoomTo(zoom / 1.5)}>
                <ZoomOut size={15} />
              </button>
              {/* Doubles as the reset: the number is the thing you want to
                  put back to 100%. */}
              <button type="button" className="design-zoom-at" disabled={zoom === 1}
                title="Back to 100%" onClick={() => zoomTo(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <button type="button" className="btn-chip ghost" disabled={zoom >= MAX_ZOOM}
                title="Zoom in" onClick={() => zoomTo(zoom * 1.5)}>
                <ZoomIn size={15} />
              </button>
            </div>
          )}
        </div>

        {/* The label follows the pointer while it is being dragged. Without
            it a drag out of the tray looks like a click that did nothing
            until the moment it lands. */}
        {dragSlot != null && (
          <span className="design-mark ghost" aria-hidden="true" ref={ghostRef}>
            C{dragSlot}
          </span>
        )}

        {/* One marker per slot the style actually uses, which is what the
            C rows above come to. They wait here until somebody says which
            part of the garment each one is. */}
        <div className="design-tray">
          <span className="design-tray-title">
            {waiting.length ? 'Not placed yet' : 'All placed'}
          </span>
          <div className="design-tray-slots">
            {waiting.map((n) => marker(n, true))}
          </div>
          {onMarks && slots.length > 0 && (
            <p className="design-tray-hint">
              {s.image_path
                ? 'Drag a label onto the part of the garment that uses it. Drag it back off to unplace it.'
                : 'Add a photo to the style before placing these.'}
            </p>
          )}
          {slots.length === 0 && (
            <p className="design-tray-hint">No yarn slots on this style yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Design() {
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState(params.get('season') || '');
  const [collection, setCollection] = useState(params.get('collection') || '');
  const [query, setQuery] = useState('');

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  useEffect(() => {
    const next = new URLSearchParams(params);
    for (const [k, v] of [['season', season], ['collection', collection]]) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [season, collection]);

  // A season is required, same as the Matrix: without one this reads the
  // bill of materials of every style of every season — 8,461 lines — to draw
  // sheets nobody flips through that way.
  useEffect(() => {
    if (!season) { setRows(null); return; }
    setRows(null);
    api.design({ season, collection }).then(setRows).catch(() => setRows([]));
  }, [season, collection]);

  const collections = meta?.collections_by_season?.[season] || [];
  useEffect(() => {
    if (collection && !collections.includes(collection)) setCollection('');
  }, [season, meta]);

  // The sheet draws from what it was given, so the saved arrangement has to
  // land back in `rows` or the markers would snap back on the next render.
  const setMarks = (style, marks) => {
    setRows((prev) => (prev || []).map(
      (r) => (r.id === style.id ? { ...r, design_marks: marks } : r)));
    return api.setDesignMarks(style.id, marks).catch((err) => {
      // Handed back so the sheet can restore what it had. Nothing else on
      // the page changes, so there is nothing else to undo.
      setRows((prev) => (prev || []).map(
        (r) => (r.id === style.id ? { ...r, design_marks: style.design_marks } : r)));
      throw err;
    });
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter(
      (r) => `${r.name} ${r.style_code || ''}`.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <>
      <header className="band">
        <div className="band-row">
          <Wordmark />
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
          <Link to="/matrix" className="band-link"><Ruler size={18} /> Matrix</Link>
          <Link to="/browse" className="band-link"><TextSearch size={18} /> Browse</Link>
          <Link to="/checklist" className="band-link"><ListChecks size={18} /> Checklist</Link>
          <Link to="/report" className="band-link"><ClipboardList size={18} /> Report</Link>
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          <h2 className="card-title">Color Sequence & Diagram</h2>
          <p className="card-sub">
            Which yarn sits in each knit slot, and at what ply, for every
            colourway side by side. Read across a C row to check a slot was
            changed in all of them. Edited in the style editor&rsquo;s BOM
            section.
          </p>

          <div className="chk-filters">
            <Field label="Season" hint="Required">
              <select className="input" value={season} required
                onChange={(e) => setSeason(e.target.value)}>
                <option value="">Choose a season…</option>
                {(meta?.seasons || []).map((s) => (
                  <option key={s.code} value={s.code}>{s.code}</option>
                ))}
              </select>
            </Field>
            <Field label="Collection"
              hint={season ? `${collections.length} in ${season}` : 'Pick a season first'}>
              <select className="input" value={collection} disabled={!season}
                onChange={(e) => setCollection(e.target.value)}>
                <option value="">
                  {season ? `All collections in ${season}` : '—'}
                </option>
                {collections.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            {rows?.length > 0 && (
              <Field label="Find a style" hint="Matches the name or the style code">
                <input className="input" type="search" value={query}
                  placeholder="e.g. ARGYLE, or K59Y2IW092"
                  onChange={(e) => setQuery(e.target.value)} />
              </Field>
            )}
          </div>

          {rows?.length > 0 && (
            <button type="button" className="btn-chip design-print"
              onClick={() => window.print()}>
              <Printer size={15} /> Print these sheets
            </button>
          )}
        </section>

        {!season && (
          <p className="result-count mx-waiting">
            Pick a season to see its design sheets.
          </p>
        )}
        {season && rows === null && (
          <p className="result-count mx-waiting">Loading…</p>
        )}
        {season && rows !== null && shown.length === 0 && (
          <p className="result-count mx-waiting">
            {rows.length === 0
              ? `Nothing in ${season}${collection ? ` · ${collection}` : ''}.`
              : 'Nothing matches that.'}
          </p>
        )}

        {shown.map((s) => (
          <DesignSheet key={s.id} style={s} onMarks={setMarks} />
        ))}
      </main>
    </>
  );
}
