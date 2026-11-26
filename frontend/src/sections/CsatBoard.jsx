import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { api } from '../api.js';

/**
 * CSAT — the Color Sequence Adjustment Table.
 *
 * A page where colours are put next to each other to be compared: the paper
 * exercise of laying swatches on a desk before deciding which one stands in
 * for which. Positions only — nothing here changes a colour, a palette or a
 * figure, and that is what makes it safe to drag things around on.
 *
 * The layout is shared, not per person: everyone who opens the page sees the
 * same arrangement, because the point is to agree on one. x is stored as a
 * share of the width so a narrower screen shows the same relative layout;
 * top is pixels, because a page scrolls down and not sideways.
 *
 * The kilos are formatted by the board's own formatter, passed in: one
 * rule for how a kilo reads, in one place.
 *
 * Saving is automatic and debounced — a drag is not a form, and nobody
 * should have to remember to press a button after moving a swatch.
 */

const SWATCH_FALLBACK = '#D9D6D0';
const SAVE_AFTER_MS = 700;
const CARD_W = 120;                 // keeps a dropped card inside the page

export default function CsatBoard({ colors, fmt, onClose }) {
  const [pages, setPages] = useState([]);
  const [name, setName] = useState('default');
  const [page, setPage] = useState(null);     // {items, title, focus_id}
  const [query, setQuery] = useState('');
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const [dragging, setDragging] = useState(null);  // {y, dx, dy}

  const area = useRef(null);
  const live = useRef(true);
  const timer = useRef(null);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; clearTimeout(timer.current); };
  }, []);

  const byId = useMemo(() => new Map(colors.map((c) => [c.id, c])), [colors]);

  const loadPages = useCallback(() => api.csatPages()
    .then((r) => { if (live.current) setPages(r.pages || []); })
    .catch((e) => { if (live.current) setErr(e.message || 'Could not list the pages'); }),
  []);

  useEffect(() => { loadPages(); }, [loadPages]);
  useEffect(() => {
    let on = true;
    setPage(null);
    api.csatPage(name)
      .then((p) => { if (on && live.current) setPage(p); })
      .catch((e) => { if (on && live.current) setErr(e.message || 'Could not open the page'); });
    return () => { on = false; };
  }, [name]);

  // One debounced save for every kind of edit: a drag, an add, a rename.
  const save = useCallback((next) => {
    setPage(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.saveCsat(name, {
        items: next.items, title: next.title, focus_id: next.focus_id,
      })
        .then(() => {
          if (!live.current) return;
          setSaved(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
          loadPages();
        })
        .catch((e) => { if (live.current) setErr(e.message || 'Could not save the page'); });
    }, SAVE_AFTER_MS);
  }, [name, loadPages]);

  if (!page) {
    return (
      <div className="csat">
        <p className="ct-empty">Opening the table…</p>
      </div>
    );
  }

  const items = page.items || [];
  const used = new Set(items.map((i) => i.y));
  const found = query.trim().length > 1
    ? colors.filter((c) => !used.has(c.id)
        && c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const add = (color) => {
    // Added colours stack down the left, so a new one is never hidden under
    // the last one.
    const row = items.length % 6;
    const col = Math.floor(items.length / 6) % 5;
    save({ ...page, items: [...items, { y: color.id, x: 0.08 + col * 0.18, top: 30 + row * 130 }] });
    setQuery('');
  };

  const remove = (id) => save({ ...page, items: items.filter((i) => i.y !== id) });

  const onPointerDown = (e, item) => {
    if (e.button !== 0) return;
    const box = area.current.getBoundingClientRect();
    setDragging({
      y: item.y,
      dx: e.clientX - (box.left + item.x * box.width),
      dy: e.clientY - (box.top + item.top),
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const box = area.current.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - dragging.dx - box.left) / box.width, 0),
                       1 - CARD_W / box.width);
    const top = Math.min(Math.max(e.clientY - dragging.dy - box.top, 0), 19000);
    setPage((p) => ({
      ...p,
      items: p.items.map((i) => (i.y === dragging.y
        ? { ...i, x: Math.round(x * 10000) / 10000, top: Math.round(top) } : i)),
    }));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(null);
    save(page);            // the move is already in `page`; this persists it
  };

  const newPage = () => {
    const taken = new Set(pages.map((p) => p.name));
    let n = 2;
    while (taken.has(`page-${n}`)) n += 1;
    api.saveCsat(`page-${n}`, { items: [], title: `Page ${n}` })
      .then(() => loadPages())
      .then(() => setName(`page-${n}`))
      .catch((e) => setErr(e.message || 'Could not add a page'));
  };

  const dropPage = () => {
    api.deleteCsat(name)
      .then(() => loadPages())
      .then(() => setName('default'))
      .then(() => api.csatPage('default'))
      .then((p) => { if (live.current) setPage(p); })
      .catch((e) => setErr(e.message || 'Could not delete the page'));
  };

  return (
    <div className="csat">
      <div className="csat-bar">
        <div className="csat-tabs">
          {pages.map((p) => (
            <button key={p.name} type="button"
              className={p.name === name ? 'on' : undefined}
              onClick={() => setName(p.name)}>
              {p.title || (p.name === 'default' ? 'Page 1' : p.name)}
              <i>{p.n}</i>
            </button>
          ))}
          <button type="button" className="csat-new" onClick={newPage} title="New page">
            <Plus size={15} />
          </button>
        </div>
        <input className="input csat-title" value={page.title || ''}
          placeholder="Name this page…" aria-label="Page name"
          onChange={(e) => save({ ...page, title: e.target.value })} />
        <button type="button" className="btn-chip" onClick={dropPage}>
          <Trash2 size={14} /> {name === 'default' ? 'Clear' : 'Delete page'}
        </button>
        <button type="button" className="btn-chip" onClick={onClose}>Back to the board</button>
      </div>

      <div className="csat-add">
        <input className="input" value={query} placeholder="Add a colour…"
          onChange={(e) => setQuery(e.target.value)} />
        <ul>
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => add(c)}>
                <i style={{ background: c.hex || SWATCH_FALLBACK }} />
                {c.name}
              </button>
            </li>
          ))}
        </ul>
        <span className="csat-saved">
          {err ? <em className="ct-error">{err}</em>
            : saved ? `saved ${saved}` : `${items.length} colour${items.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="csat-area" ref={area}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {items.length === 0 && (
          <p className="ct-empty csat-hint">
            Empty table. Add a colour above, then drag the cards around to
            compare them — the layout is shared with everyone who opens this
            page.
          </p>
        )}
        {items.map((it) => {
          const c = byId.get(it.y);
          if (!c) return null;
          return (
            <div key={it.y}
              className={`csat-card${dragging?.y === it.y ? ' dragging' : ''}`}
              style={{ left: `${it.x * 100}%`, top: it.top }}
              onPointerDown={(e) => onPointerDown(e, it)}>
              <span className="csat-chip" style={{ background: c.hex || SWATCH_FALLBACK }} />
              <span className="csat-name">{c.name}</span>
              <span className="csat-av">
                {c.qty_with_proj == null ? '—' : `${fmt(c.qty_with_proj)} kg`}
              </span>
              <button type="button" className="csat-x" aria-label={`Remove ${c.name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => remove(it.y)}>
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
