import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePlus, Ruler, TextSearch, ListChecks, ClipboardList, Palette, ChevronDown, X } from 'lucide-react';
import { api } from '../api.js';
import Wordmark from '../components/Wordmark.jsx';

/**
 * The Color Table: the yarn colours as a swatch board.
 *
 * The team's board groups colours under palettes they name themselves —
 * "Overpriced", "Open Color" — with two numbers pinned to each swatch: kilos
 * available counting projected orders (green) and not counting them (blue).
 *
 * The colours come from the BOM import, so the board can answer the question
 * the spreadsheet never could: hover a swatch and it lists the styles
 * knitted with that colour; click it and the panel opens with the list and
 * the editable board facts (swatch hex, quantities, palette).
 *
 * Colours nobody has sorted sit under "Unsorted" at the bottom — that is
 * most of them on day one, and moving one into a palette is done from the
 * panel rather than by drag, because 600 swatches make a drop target of
 * everything.
 */

// "YST ARTIC FOX - 507" -> label "YST ARTIC FOX", code "507".
// Some names carry no code ("BJ SANDSTONE"); the label is then the whole name.
export const splitColorName = (name) => {
  const m = /^(.*\S)\s+-\s+(\S+(?:\s\S+)?)$/.exec(String(name || '').trim());
  return m ? { label: m[1], code: m[2] } : { label: String(name || '').trim(), code: '' };
};

// The qty chips show the number as entered, or an em dash when nobody has
// said. 0 is a real answer (none left) and renders as 0.
export const fmtQty = (v) => (v == null ? '—' : String(Number(v)));

// Each chip is a pair, the way the physical board writes it: AV 3 MONTHS /
// AV FULL SEASON. Both unknown collapses to one dash, not a dash fraction.
export const pairQty = (m3, full) =>
  (m3 == null && full == null ? '—' : `${fmtQty(m3)}/${fmtQty(full)}`);

const SWATCH_FALLBACK = '#D9D6D0';

function Swatch({ color, selected, ghosted, onPick, onHover, onLeave, onDragStart, onDragEnd }) {
  const { label, code } = splitColorName(color.name);
  return (
    <button
      type="button"
      className={`ct-swatch${selected ? ' ct-selected' : ''}${ghosted ? ' ct-ghosted' : ''}`}
      style={{ background: color.hex || SWATCH_FALLBACK }}
      onClick={() => onPick(color)}
      onMouseEnter={(e) => onHover(color, e.currentTarget)}
      onMouseLeave={onLeave}
      onFocus={(e) => onHover(color, e.currentTarget)}
      onBlur={onLeave}
      draggable
      onDragStart={(e) => onDragStart(e, color)}
      onDragEnd={onDragEnd}
    >
      <span className="ct-qtys">
        <i className="ct-q ct-q-with"
          title="With projection — 3 months / full season">
          {pairQty(color.qty_with_proj_3m, color.qty_with_proj)}
        </i>
        <i className="ct-q ct-q-without"
          title="Without projection — 3 months / full season">
          {pairQty(color.qty_without_proj_3m, color.qty_without_proj)}
        </i>
      </span>
      <span className="ct-name">
        {code ? <b>#{code}</b> : null}
        {label}
      </span>
    </button>
  );
}

export default function ColorTable() {
  const [table, setTable] = useState(null);
  const [error, setError] = useState('');
  const [palOpen, setPalOpen] = useState(false);
  const [palQuery, setPalQuery] = useState('');
  const [newPal, setNewPal] = useState('');
  const [selected, setSelected] = useState(null);   // a colour row
  const [styles, setStyles] = useState(null);       // styles of `selected`
  const [form, setForm] = useState(null);           // editable board facts
  const [saving, setSaving] = useState(false);
  const [tip, setTip] = useState(null);             // {id, name, count, x, y, list}
  const [dropSec, setDropSec] = useState();         // section id under a drag
  const [dragSrc, setDragSrc] = useState(null);     // colour id being dragged
  const dragId = useRef(null);                      // same, for handlers

  // Hover lists, fetched once per colour per visit. A ref, not state: the
  // cache changing is never a reason to re-render.
  const tipCache = useRef(new Map());
  // true inside the effect body, not in the initializer: StrictMode mounts,
  // unmounts and mounts again in dev, and a ref set only at creation stays
  // false after that second mount — every fetch result then gets dropped.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  // The dropdown closes like one: a click anywhere else, or Escape. Left
  // open it floats over the board for ever, which is not what the mock does.
  const palWrap = useRef(null);
  useEffect(() => {
    if (!palOpen) return undefined;
    const away = (e) => {
      if (palWrap.current && !palWrap.current.contains(e.target)) setPalOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') setPalOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [palOpen]);

  const load = () => api.colorTable()
    .then((t) => { if (live.current) { setTable(t); setError(''); } })
    .catch((e) => { if (live.current) setError(e.message || 'Could not load'); });
  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // One flat list of sections: the palettes, then Unsorted. The dropdown's
  // search filters the board too — it is the only search, as on the board
  // the team drew, and 428 unsorted colours need one.
  const sections = useMemo(() => {
    if (!table) return [];
    const match = (c) => !palQuery
      || c.name.toLowerCase().includes(palQuery.toLowerCase());
    const out = table.palettes.map((p) => ({
      id: p.id, name: p.name, colors: p.colors.filter(match),
    }));
    out.push({ id: null, name: 'Unsorted', colors: table.unsorted.filter(match) });
    return out;
  }, [table, palQuery]);

  const pick = (color) => {
    setSelected(color);
    setStyles(null);
    setTip(null);
    setForm({
      hex: color.hex || '',
      qty_with_proj: color.qty_with_proj ?? '',
      qty_without_proj: color.qty_without_proj ?? '',
      qty_with_proj_3m: color.qty_with_proj_3m ?? '',
      qty_without_proj_3m: color.qty_without_proj_3m ?? '',
      palette_id: color.palette_id ?? '',
    });
    api.colorStyles(color.id)
      .then((list) => { if (live.current) setStyles(list); })
      .catch(() => { if (live.current) setStyles([]); });
  };

  const hover = (color, el) => {
    if (selected) return;                      // the panel already answers it
    const r = el.getBoundingClientRect();
    const base = { id: color.id, name: color.name, count: color.style_count,
                   x: Math.min(r.right + 10, window.innerWidth - 300),
                   y: Math.max(10, r.top) };
    const cached = tipCache.current.get(color.id);
    if (cached) { setTip({ ...base, list: cached }); return; }
    setTip({ ...base, list: null });
    if (!color.style_count) { tipCache.current.set(color.id, []); setTip({ ...base, list: [] }); return; }
    api.colorStyles(color.id).then((list) => {
      tipCache.current.set(color.id, list);
      setTip((t) => (t && t.id === color.id ? { ...t, list } : t));
    }).catch(() => { /* the count is still on screen */ });
  };

  // Drag a swatch onto another section to re-palette it. Native HTML5 drag:
  // the board is a mouse surface, and the panel's select stays as the way
  // that also works by touch and keyboard.
  const dragStart = (e, color) => {
    dragId.current = color.id;
    setTip(null);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(color.id)); } catch { /* old engines */ }
    // After the browser has taken its drag snapshot, not before: dimming the
    // source synchronously would dim the snapshot too.
    requestAnimationFrame(() => setDragSrc(color.id));
  };
  const dragEnd = () => { dragId.current = null; setDragSrc(null); setDropSec(undefined); };
  const sectionDrop = (sec) => {
    const id = dragId.current;
    dragEnd();
    if (id == null) return;
    const from = sections.find((s) => s.colors.some((c) => c.id === id));
    if (from && (from.id ?? null) === (sec.id ?? null)) return;
    api.updateYarnColor(id, { palette_id: sec.id })
      .then(() => load())
      .catch((err) => setError(err.message || 'Could not move the colour'));
  };

  const save = () => {
    if (!selected || !form) return;
    setSaving(true);
    const num = (v) => (v === '' ? null : v);
    api.updateYarnColor(selected.id, {
      hex: form.hex || null,
      qty_with_proj: num(form.qty_with_proj),
      qty_without_proj: num(form.qty_without_proj),
      qty_with_proj_3m: num(form.qty_with_proj_3m),
      qty_without_proj_3m: num(form.qty_without_proj_3m),
      palette_id: form.palette_id === '' ? null : Number(form.palette_id),
    })
      .then(() => load())
      .then(() => { if (live.current) setSaving(false); })
      .catch((e) => {
        if (live.current) { setSaving(false); setError(e.message || 'Save failed'); }
      });
  };

  const addPalette = () => {
    const name = newPal.trim();
    if (!name) return;
    api.createPalette(name)
      .then(() => { setNewPal(''); return load(); })
      .catch((e) => setError(e.message || 'Could not add palette'));
  };

  const jumpTo = (sec) => {
    setPalOpen(false);
    const el = document.getElementById(`ct-sec-${sec.id ?? 'unsorted'}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const palList = (table?.palettes || [])
    .filter((p) => !palQuery || p.name.toLowerCase().includes(palQuery.toLowerCase()));

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
          <Link to="/design" className="band-link"><Palette size={18} /> Design</Link>
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          <div className="ct-head">
            <div>
              <h2 className="card-title">Color Table</h2>
              <div className="ct-legend">
                <span><i className="ct-chip ct-q-with" /> qty av — with projection
                  <em> · 3 mo / season</em></span>
                <span><i className="ct-chip ct-q-without" /> qty av — without projection
                  <em> · 3 mo / season</em></span>
              </div>
            </div>
            <div className="ct-palwrap" ref={palWrap}>
              <button type="button" className="ct-palbtn"
                onClick={() => setPalOpen((v) => !v)}>
                Palette <ChevronDown size={16} />
              </button>
              {palOpen && (
                <div className="ct-pop">
                  <input className="input" placeholder="Search…" value={palQuery}
                    onChange={(e) => setPalQuery(e.target.value)} />
                  <ul>
                    {palList.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => jumpTo(p)}>{p.name}</button>
                      </li>
                    ))}
                    <li>
                      <button type="button" onClick={() => jumpTo({ id: null })}>Unsorted</button>
                    </li>
                  </ul>
                  <div className="ct-addpal">
                    <input className="input" placeholder="New palette…" value={newPal}
                      onChange={(e) => setNewPal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addPalette(); }} />
                    <button type="button" onClick={addPalette}>+</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && <p className="ct-error">{error}</p>}
          {!table && !error && <p className="ct-empty">Loading the board…</p>}

          <div className={selected ? 'ct-body ct-split' : 'ct-body'}>
            <div className={`ct-sections${dragSrc != null ? ' ct-dragging' : ''}`}>
              {sections.map((sec) => (
                (sec.colors.length > 0 || sec.id !== null) && (
                  <div key={sec.id ?? 'unsorted'} id={`ct-sec-${sec.id ?? 'unsorted'}`}
                    className={`ct-section${dropSec === (sec.id ?? 'unsorted') ? ' ct-dropping' : ''}`}
                    onDragOver={(e) => {
                      if (dragId.current == null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropSec(sec.id ?? 'unsorted');
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setDropSec(undefined);
                    }}
                    onDrop={(e) => { e.preventDefault(); sectionDrop(sec); }}>
                    <h3>{sec.name}</h3>
                    {sec.colors.length === 0 ? (
                      <p className="ct-empty">
                        {palQuery ? 'No colour here matches the search.'
                          : 'Nothing here yet — drag a colour in, or set its palette in the panel.'}
                      </p>
                    ) : (
                      <div className="ct-grid">
                        {sec.colors.map((c) => (
                          <Swatch key={c.id} color={c}
                            selected={selected?.id === c.id}
                            ghosted={dragSrc === c.id}
                            onPick={pick} onHover={hover}
                            onLeave={() => setTip(null)}
                            onDragStart={dragStart} onDragEnd={dragEnd} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>

            {selected && form && (
              <aside className="ct-detail">
                <button type="button" className="ct-close" aria-label="Close"
                  onClick={() => { setSelected(null); setForm(null); }}>
                  <X size={18} />
                </button>
                <div className="ct-big" style={{ background: form.hex || selected.hex || SWATCH_FALLBACK }} />
                <h3 className="ct-detail-title">{selected.name}</h3>

                <div className="ct-detail-card">
                  <h4>Used in {styles ? styles.length : '…'} style{styles?.length === 1 ? '' : 's'}</h4>
                  {styles === null && <p className="ct-empty">Looking…</p>}
                  {styles?.length === 0 && (
                    <p className="ct-empty">No style knits with this colour.</p>
                  )}
                  <ul className="ct-stylelist">
                    {(styles || []).map((s) => (
                      <li key={s.style_id}>
                        <Link to={`/edit/${s.style_id}`}>
                          <b>{s.season}</b> — {s.style_name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="ct-detail-card ct-form">
                  <h4>Board facts</h4>
                  <label>Swatch
                    <span className="ct-hexrow">
                      <input type="color" aria-label="Pick swatch colour"
                        value={/^#[0-9a-fA-F]{6}$/.test(form.hex) ? form.hex : '#d9d6d0'}
                        onChange={(e) => setForm({ ...form, hex: e.target.value })} />
                      <input className="input" placeholder="#aabbcc" value={form.hex}
                        onChange={(e) => setForm({ ...form, hex: e.target.value })} />
                    </span>
                  </label>
                  <label>Qty av — with projection · 3 months / full season
                    <span className="ct-pairrow">
                      <input className="input" type="number" step="any"
                        aria-label="With projection, 3 months"
                        value={form.qty_with_proj_3m}
                        onChange={(e) => setForm({ ...form, qty_with_proj_3m: e.target.value })} />
                      <input className="input" type="number" step="any"
                        aria-label="With projection, full season"
                        value={form.qty_with_proj}
                        onChange={(e) => setForm({ ...form, qty_with_proj: e.target.value })} />
                    </span>
                  </label>
                  <label>Qty av — without projection · 3 months / full season
                    <span className="ct-pairrow">
                      <input className="input" type="number" step="any"
                        aria-label="Without projection, 3 months"
                        value={form.qty_without_proj_3m}
                        onChange={(e) => setForm({ ...form, qty_without_proj_3m: e.target.value })} />
                      <input className="input" type="number" step="any"
                        aria-label="Without projection, full season"
                        value={form.qty_without_proj}
                        onChange={(e) => setForm({ ...form, qty_without_proj: e.target.value })} />
                    </span>
                  </label>
                  <label>Palette
                    <select className="input" value={form.palette_id}
                      onChange={(e) => setForm({ ...form, palette_id: e.target.value })}>
                      <option value="">Unsorted</option>
                      {(table?.palettes || []).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn btn-save" disabled={saving}
                    onClick={save}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </aside>
            )}
          </div>
        </section>
      </main>

      {tip && !selected && (
        <div className="ct-tip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.name}</b>
          {tip.count === 0 && <p>Not used in any style.</p>}
          {tip.count > 0 && tip.list === null && <p>Looking up {tip.count} style{tip.count === 1 ? '' : 's'}…</p>}
          {tip.list && tip.list.length > 0 && (
            <ul>
              {tip.list.slice(0, 10).map((s) => (
                <li key={s.style_id}><b>{s.season}</b> — {s.style_name}</li>
              ))}
              {tip.list.length > 10 && <li>…and {tip.list.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
