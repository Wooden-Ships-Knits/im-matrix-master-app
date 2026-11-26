import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePlus, Ruler, TextSearch, ListChecks, ClipboardList, Palette, ChevronDown, TriangleAlert, ArrowLeftRight, Download, LayoutGrid, X } from 'lucide-react';
import { api } from '../api.js';
import Wordmark from '../components/Wordmark.jsx';
import CsatBoard from '../sections/CsatBoard.jsx';

/**
 * The Color Table: the yarn colours as a swatch board.
 *
 * The team's board groups colours under palettes they name themselves —
 * "Overpriced", "Open Color" — with two numbers pinned to each swatch: kilos
 * available counting projected orders (green) and not counting them (blue).
 *
 * The colours come from the BOM import, so the board can answer the question
 * the spreadsheet never could: hover a swatch and it lists the styles
 * knitted with that colour; click it and the panel opens with the list, the
 * two facts a person owns (swatch hex, palette) and the kilos as stated.
 *
 * The kilos are stated, not typed. They come from one YARN ANALYSIS batch —
 * named at the top of the page with its stock date — so the figures cannot
 * be edited here and an import cannot overwrite anyone's work. The rows of
 * that file nobody could place are the queue behind "to check": answering
 * one teaches the resolver, and the next import places it by itself.
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

// Kilos read to one decimal, everywhere on this page. The workbook carries
// three ("15.163") because its formulas do, but a chip on a swatch is read
// at a glance across a desk, and nobody orders yarn by the gram. An em dash
// means nobody has said; 0.0 is a real answer (none left).
export const fmtQty = (v) => (v == null ? '—' : Number(v).toFixed(1));

// Each chip is a pair, the way the physical board writes it: AV 3 MONTHS /
// AV FULL SEASON. Both unknown collapses to one dash, not a dash fraction.
// Kilos add up to long tails in binary; the board writes two decimals.
export const round2 = (v) => Math.round(Number(v) * 100) / 100;

export const pairQty = (m3, full) =>
  (m3 == null && full == null ? '—' : `${fmtQty(m3)}/${fmtQty(full)}`);

// Dates on this page are the team's shorthand: "10 Nov", never a timestamp.
export const fmtDay = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
};

// PPIC's O4 status has no season: it is about the stock itself. Their own
// definitions (YARN ANALYSIS/ARTI O4.xlsx), in the order the board reads.
export const O4_SECTIONS = [
  { k: 'over', t: 'Overstock', d: 'In use, large quantity' },
  { k: 'open', t: 'Open color', d: 'Never used yet' },
  { k: 'obsolete', t: 'Obsolete', d: 'Used before, not in the running season' },
  { k: 'active', t: 'In use', d: 'No O4 status in the loaded file' },
];
export const o4Key = (o4) => {
  const s = String(o4 || '').toUpperCase();
  if (s.startsWith('OBSOLETE')) return 'obsolete';
  if (s.startsWith('OPEN')) return 'open';
  if (s.startsWith('OVERSTOCK')) return 'over';
  return 'active';
};

// The season palette, as the team defines it. "EMBRO ONLY" is a qualifier on
// a status, not a status, so it groups with the status it qualifies.
export const PALETTE = [
  { k: 'core', t: 'Core', d: 'Always has an extra pad, cannot sell out' },
  { k: 'coregd', t: 'Core GD', d: 'Core, for the Game Day collection' },
  { k: 'regular', t: 'Regular', d: 'Keep ordering, with a small pad' },
  { k: 'sellout', t: 'Sell out', d: 'Sub to another colour once it sells out' },
  { k: 'tbd', t: 'To be decided', d: '"?" in YARN ANALYSIS' },
  { k: 'other', t: 'Other status', d: 'A status outside the four' },
  { k: 'none', t: 'No status this season', d: 'The file says nothing for this season' },
];
export const palKey = (status) => {
  const s = String(status || '').toUpperCase();
  if (!s) return 'none';
  if (s.includes('?') || /\bTBD\b/.test(s)) return 'tbd';
  if (s.startsWith('CORE PERMANENT GD')) return 'coregd';
  if (s.startsWith('CORE')) return 'core';
  if (s.startsWith('REGULAR')) return 'regular';
  if (s.startsWith('SELL OUT')) return 'sellout';
  return 'other';
};
export const SEASONS = ['F27', 'S28', 'S27', 'F26', 'S26'];

// A sub has to stay inside the yarn type. YST and YY are one yarn in two
// counts, YP and YTX likewise; the backend refuses anything else, and the
// pickers here only offer what it would accept.
export const yarnGroup = (name) => ({
  YST: 'yst', YY: 'yst', YCA: 'yca', YAC: 'yac', YP: 'yp', YTX: 'yp', BJ: 'bj',
}[String(name || '').trim().split(' ')[0].toUpperCase()] || '?');

const SWATCH_FALLBACK = '#D9D6D0';

function Swatch({ color, selected, ghosted, changed, draggable, onPick, onHover, onLeave, onDragStart, onDragEnd }) {
  const { label, code } = splitColorName(color.name);
  return (
    <button
      type="button"
      title={changed ? `Open changes move this colour by ${changed > 0 ? '+' : ''}${changed} kg` : undefined}
      className={`ct-swatch${selected ? ' ct-selected' : ''}${ghosted ? ' ct-ghosted' : ''}`
        + (changed ? ' ct-changed' : '')}
      style={{ background: color.hex || SWATCH_FALLBACK }}
      onClick={() => onPick(color)}
      onMouseEnter={(e) => onHover(color, e.currentTarget)}
      onMouseLeave={onLeave}
      onFocus={(e) => onHover(color, e.currentTarget)}
      onBlur={onLeave}
      draggable={draggable}
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

/**
 * The import's open questions. One row of PPIC's file per item, the reason
 * it could not be placed, and the candidates the resolver already found —
 * so the usual answer is one click, not a search.
 *
 * "It is …" writes an alias and places the row's figures at once. "Not ours"
 * closes the question without teaching anything, for a colour we genuinely
 * do not stock.
 */
function ReviewDialog({ open, colors, onClose, onAnswered }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  const [pickFor, setPickFor] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setItems(null);
    api.colorReview('open')
      .then((r) => { if (live) setItems(r.items || []); })
      .catch((e) => { if (live) setErr(e.message || 'Could not load the queue'); });
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { live = false; document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  if (!open) return null;

  const answer = (item, payload) => {
    setBusy(item.id);
    api.answerReview(item.id, payload)
      .then(() => {
        setItems((list) => (list || []).filter((i) => i.id !== item.id));
        setBusy(null);
        setPickFor(null);
        setQuery('');
        onAnswered();
      })
      .catch((e) => { setBusy(null); setErr(e.message || 'Could not save that answer'); });
  };

  // The candidates the resolver put on the item, the code's owner first.
  const candidates = (item) => {
    const seen = new Set();
    return [...(item.detail.code_belongs_to || []), ...(item.detail.same_name || [])]
      .filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
  };

  const found = query.trim().length > 1
    ? colors.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="dialog-backdrop rev-back"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog rev-dialog" role="dialog" aria-label="Rows to check">
        <button type="button" className="ct-close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        <h3>Rows to check</h3>
        <p className="rev-intro">
          Rows of the loaded YARN ANALYSIS that hold kilos but match no colour of
          ours, and codes our master spells under another name. An answer is
          remembered: the next import places that row by itself.
        </p>
        {err && <p className="ct-error">{err}</p>}
        {items === null && <p className="ct-empty">Reading the queue…</p>}
        {items?.length === 0 && (
          <p className="ct-empty">Nothing to check — every row of the file is placed.</p>
        )}
        <ul className="rev-list">
          {(items || []).map((item) => (
            <li key={item.id} className={`rev-item rev-${item.severity}`}>
              <div className="rev-head">
                <b>{item.raw}</b>
                <span className="rev-why">{item.title}</span>
                <span className="rev-loc">{item.locator}</span>
              </div>
              {item.rule === 'YARN_CODE_NAME_CONFLICT' && item.detail.code_belongs_to && (
                <p className="rev-note">
                  The file says {item.detail.code}{' '}is {item.detail.colour};
                  our master has it as {item.detail.code_belongs_to.map((c) => c.name).join(', ')}.
                </p>
              )}
              <div className="rev-acts">
                {candidates(item).map((c) => (
                  <button key={c.id} type="button" className="btn btn-small"
                    disabled={busy === item.id}
                    onClick={() => answer(item, { yarn_color_id: c.id })}>
                    It is {c.name}
                  </button>
                ))}
                <button type="button" className="btn btn-small btn-ghost"
                  disabled={busy === item.id}
                  onClick={() => { setPickFor(pickFor === item.id ? null : item.id); setQuery(''); }}>
                  Another colour…
                </button>
                <button type="button" className="btn btn-small btn-ghost"
                  disabled={busy === item.id}
                  onClick={() => answer(item, { dismiss: true })}>
                  Not ours
                </button>
              </div>
              {pickFor === item.id && (
                <div className="rev-pick">
                  <input className="input" autoFocus placeholder="Search our colours…"
                    value={query} onChange={(e) => setQuery(e.target.value)} />
                  <ul>
                    {found.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => answer(item, { yarn_color_id: c.id })}>
                          {c.name}
                        </button>
                      </li>
                    ))}
                    {query.trim().length > 1 && found.length === 0 && (
                      <li className="ct-empty">No colour of ours matches.</li>
                    )}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Every change somebody has proposed and nobody has closed: kilos of one
 * colour covering another's shortage, and yarn swaps per colourway.
 *
 * It shows each colour's AV now and after all of them together, because the
 * question an approver asks is "and then what is left" — a sub that fixes
 * one colour by over-drawing another is not a fix. The CSV is the same list
 * in the shape the team already circulates (NOTE PERUBAHAN).
 */
function ChangesDialog({ open, colors, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setData(null);
    api.colorChanges()
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) setErr(e.message || 'Could not load the changes'); });
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { live = false; document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  if (!open) return null;

  const av = (id) => colors.find((c) => c.id === id)?.qty_with_proj;
  const after = (id) => {
    const now = av(id);
    return now == null ? null : round2(now + (data?.delta?.[String(id)] || 0));
  };
  const close = (fn, id) => {
    setBusy(id);
    fn.then(() => api.colorChanges())
      .then((r) => { setData(r); setBusy(null); onChanged(); })
      .catch((e) => { setBusy(null); setErr(e.message || 'Could not withdraw that'); });
  };
  const Av = ({ id }) => (
    <span className="chg-av">
      {fmtQty(av(id))} <span aria-hidden>→</span>{' '}
      <b className={after(id) < 0 ? 'short' : undefined}>
        {fmtQty(after(id))}
      </b> kg
    </span>
  );

  return (
    <div className="dialog-backdrop rev-back"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog rev-dialog" role="dialog" aria-label="Open changes">
        <button type="button" className="ct-close" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
        <h3>Open changes</h3>
        <p className="rev-intro">
          Suggestions, not stock: nothing here edits a BOM or the figures from
          YARN ANALYSIS. Each line shows both colours’ available kilos now and
          after every open change together.
        </p>
        {err && <p className="ct-error">{err}</p>}
        {data === null && <p className="ct-empty">Reading…</p>}
        {data && !data.subs.length && !data.proposals.length && (
          <p className="ct-empty">Nothing open. Propose a swap from a colour’s panel.</p>
        )}

        {Boolean(data?.proposals?.length) && (
          <>
            <h4 className="chg-head">Yarn swaps</h4>
            <ul className="rev-list">
              {data.proposals.map((p) => (
                <li key={p.id} className="rev-item">
                  <div className="rev-head">
                    <b>{p.from_label} → {p.to_label}</b>
                    <span className="rev-loc">
                      {p.season} {p.style_name}
                      {p.colorway_name ? ` · ${p.colorway_name}` : ''} {p.slots}
                    </span>
                  </div>
                  <p className="chg-nums">
                    <Av id={p.from_id} /><Av id={p.to_id} />
                    {p.kg ? <em>{fmtQty(p.kg)} kg moved</em>
                      : <em className="chg-nokg">no kilos stated — AV unchanged</em>}
                  </p>
                  <div className="rev-acts">
                    <button type="button" className="btn btn-small btn-ghost"
                      disabled={busy === p.id}
                      onClick={() => close(api.withdrawProposal(p.id), p.id)}>
                      Withdraw
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {Boolean(data?.subs?.length) && (
          <>
            <h4 className="chg-head">Colour subs</h4>
            <ul className="rev-list">
              {data.subs.map((s) => (
                <li key={s.id} className="rev-item">
                  <div className="rev-head">
                    <b>{s.sub_label} covers {s.short_label}</b>
                    <span className="rev-loc">{fmtQty(s.kg)} kg</span>
                  </div>
                  <p className="chg-nums"><Av id={s.short_id} /><Av id={s.sub_id} /></p>
                  {s.note && <p className="rev-note">{s.note}</p>}
                  <div className="rev-acts">
                    <button type="button" className="btn btn-small btn-ghost"
                      disabled={busy === s.id}
                      onClick={() => close(api.withdrawColorSub(s.id), s.id)}>
                      Withdraw
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="rev-acts chg-foot">
          <a className="btn btn-small" href="/api/colors/changes.csv" download>
            <Download size={14} /> Export CSV
          </a>
          <button type="button" className="btn btn-small btn-ghost"
            onClick={() => (history
              ? setHistory(null)
              : api.colorChangeHistory().then((r) => setHistory(r.items)))}>
            {history ? 'Hide closed' : 'Closed changes'}
          </button>
        </div>
        {history && (
          <ul className="chg-hist">
            {history.length === 0 && <li className="ct-empty">Nothing closed yet.</li>}
            {history.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <b>{h.from} → {h.to}</b> {h.kg ? `· ${fmtQty(h.kg)} kg ` : ''}
                <i>{h.status}{h.closed_by ? ` by ${h.closed_by}` : ''}
                  {h.closed_at ? ` · ${fmtDay(h.closed_at)}` : ''}</i>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
  const [cways, setCways] = useState(null);         // colourways of `selected`
  const [cand, setCand] = useState(null);           // PPIC's named substitutes
  const [swapFor, setSwapFor] = useState(null);     // colourway id being swapped
  const [swapQuery, setSwapQuery] = useState('');
  const [swapKg, setSwapKg] = useState('');
  const [subKg, setSubKg] = useState('');
  const [allCways, setAllCways] = useState(false);
  const [changeErr, setChangeErr] = useState('');
  const [form, setForm] = useState(null);           // editable board facts
  const [saving, setSaving] = useState(false);
  const [tip, setTip] = useState(null);             // {id, name, count, x, y, list}
  const [reviewOpen, setReviewOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [csatOpen, setCsatOpen] = useState(false);
  const [groupBy, setGroupBy] = useState('palette');   // palette | o4 | season
  const [season, setSeason] = useState('F27');
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

  // Three ways to read the same board, and only one of them is ours:
  //   palette  the groups the team dragged together (drop targets)
  //   o4       PPIC's own stock status, straight out of the file
  //   season   PPIC's palette for one season (Core, Regular, Sell out …)
  // The dropdown's search filters the board too — it is the only search, as
  // on the board the team drew, and 400 colours need one.
  const sections = useMemo(() => {
    if (!table) return [];
    const match = (c) => !palQuery
      || c.name.toLowerCase().includes(palQuery.toLowerCase());
    const all = [...table.palettes.flatMap((p) => p.colors), ...table.unsorted]
      .filter(match);

    if (groupBy === 'o4') {
      return O4_SECTIONS.map((s) => ({
        id: `o4-${s.k}`, name: s.t, note: s.d, drop: false,
        colors: all.filter((c) => o4Key(c.o4) === s.k),
      })).filter((s) => s.colors.length > 0);
    }
    if (groupBy === 'season') {
      return PALETTE.map((s) => ({
        id: `pal-${s.k}`, name: s.t, note: s.d, drop: false,
        colors: all.filter((c) => palKey((c.pal || {})[season]) === s.k),
      })).filter((s) => s.colors.length > 0);
    }
    const out = table.palettes.map((p) => ({
      id: p.id, name: p.name, drop: true, colors: p.colors.filter(match),
    }));
    out.push({ id: null, name: 'Unsorted', drop: true,
               colors: table.unsorted.filter(match) });
    return out;
  }, [table, palQuery, groupBy, season]);

  // Every colour on the board, flat — what the review dialog searches when
  // the resolver had no candidate to offer.
  const allColors = useMemo(
    () => (table ? [...table.palettes.flatMap((p) => p.colors), ...table.unsorted] : []),
    [table]);
  // What the open changes would do to each colour's AV, keyed by id.
  const delta = table?.changes?.delta || {};

  const pick = (color) => {
    setSelected(color);
    setStyles(null);
    setCways(null);
    setCand(null);
    setSwapFor(null);
    setTip(null);
    // Only what a person owns. The kilos are the file's, shown beside these.
    setForm({ hex: color.hex || '', palette_id: color.palette_id ?? '' });
    api.colorStyles(color.id)
      .then((list) => { if (live.current) setStyles(list); })
      .catch(() => { if (live.current) setStyles([]); });
    api.colorColorways(color.id)
      .then((list) => { if (live.current) setCways(list); })
      .catch(() => { if (live.current) setCways([]); });
    api.colorCandidates(color.id)
      .then((r) => { if (live.current) setCand(r); })
      .catch(() => { if (live.current) setCand({ candidates: [], unmatched: [], notes: {} }); });
  };

  // Saving a change reloads the board, because every open change moves two
  // colours' AV and the board shows both.
  const afterChange = (p) => p
    .then(() => { if (live.current) { setChangeErr(''); } return load(); })
    .then(() => { if (selected) {
      api.colorColorways(selected.id)
        .then((list) => { if (live.current) setCways(list); }).catch(() => {});
    } })
    .catch((e) => { if (live.current) setChangeErr(e.message || 'Could not save that change'); });

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
    api.updateYarnColor(selected.id, {
      hex: form.hex || null,
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
              {table?.source?.file && (
                <p className="ct-source">
                  <b>{table.source.file}</b>
                  <span> · stock {fmtDay(table.source.stock_on)}</span>
                  <span> · read {fmtDay(table.source.loaded_at)}</span>
                  <span> · {table.source.placed} of {table.source.rows} rows placed</span>
                </p>
              )}
            </div>
            <div className="ct-headacts">
              {/* Three readings of one board. Only "Palette" is ours to
                  rearrange; the other two are PPIC's own words for these
                  colours, so dragging is off in them. */}
              <div className="ct-group" role="group" aria-label="Group the board by">
                {[['palette', 'Palette'], ['o4', 'O4 status'], ['season', 'Season']]
                  .map(([k, label]) => (
                    <button key={k} type="button"
                      className={groupBy === k ? 'on' : undefined}
                      onClick={() => setGroupBy(k)}>{label}</button>
                  ))}
              </div>
              {groupBy === 'season' && (
                <select className="input ct-season" value={season}
                  aria-label="Season"
                  onChange={(e) => setSeason(e.target.value)}>
                  {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {Boolean(table?.changes?.subs || table?.changes?.proposals) && (
                <button type="button" className="ct-chbtn"
                  onClick={() => setChangesOpen(true)}>
                  <ArrowLeftRight size={15} />
                  {' '}{(table.changes.subs + table.changes.proposals)} open change
                  {table.changes.subs + table.changes.proposals === 1 ? '' : 's'}
                </button>
              )}
              {Boolean(table?.queue?.open) && (
                <button type="button" className="ct-qbtn"
                  onClick={() => setReviewOpen(true)}>
                  <TriangleAlert size={15} /> {table.queue.open} to check
                </button>
              )}
              <button type="button"
                className={csatOpen ? 'ct-chbtn on' : 'ct-chbtn'}
                onClick={() => setCsatOpen((v) => !v)}>
                <LayoutGrid size={15} /> CSAT
              </button>
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
          </div>

          {error && <p className="ct-error">{error}</p>}
          {!table && !error && <p className="ct-empty">Loading the board…</p>}

          {csatOpen && (
            <CsatBoard colors={allColors} fmt={fmtQty}
              onClose={() => setCsatOpen(false)} />
          )}

          <div className={selected ? 'ct-body ct-split' : 'ct-body'}
            hidden={csatOpen}>
            <div className={`ct-sections${dragSrc != null ? ' ct-dragging' : ''}`}>
              {sections.map((sec) => (
                (sec.colors.length > 0 || sec.id !== null) && (
                  <div key={sec.id ?? 'unsorted'} id={`ct-sec-${sec.id ?? 'unsorted'}`}
                    className={`ct-section${dropSec === (sec.id ?? 'unsorted') ? ' ct-dropping' : ''}`}
                    onDragOver={(e) => {
                      if (dragId.current == null || !sec.drop) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropSec(sec.id ?? 'unsorted');
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setDropSec(undefined);
                    }}
                    onDrop={(e) => {
                      if (!sec.drop) return;
                      e.preventDefault();
                      sectionDrop(sec);
                    }}>
                    <h3>{sec.name} <span className="ct-count">{sec.colors.length}</span></h3>
                    {sec.note && <p className="ct-secnote">{sec.note}</p>}
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
                            changed={delta[String(c.id)] || 0}
                            draggable={groupBy === 'palette'}
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

                {/* The styles list that used to sit here said less than the
                    colourway list below and took more room; the hover card
                    still answers "which styles" at a glance. */}
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

                {/* Stated, not typed: these are the file's figures, and the
                    file is named under them. Nothing here is an input. */}
                <div className="ct-detail-card ct-stated">
                  <h4>As YARN ANALYSIS states it</h4>
                  <dl>
                    <div>
                      <dt>Qty av — with projection</dt>
                      <dd>{pairQty(selected.qty_with_proj_3m, selected.qty_with_proj)}
                        <em> 3 mo / season</em></dd>
                    </div>
                    <div>
                      <dt>Qty av — without projection</dt>
                      <dd>{pairQty(selected.qty_without_proj_3m, selected.qty_without_proj)}
                        <em> 3 mo / season</em></dd>
                    </div>
                    <div>
                      <dt>On hand</dt>
                      <dd>{fmtQty(selected.on_hand)}<em> kg</em></dd>
                    </div>
                    <div>
                      <dt>O4 status</dt>
                      <dd>{selected.o4 || '—'}</dd>
                    </div>
                    <div>
                      <dt>Colour family</dt>
                      <dd>{selected.family || '—'}</dd>
                    </div>
                  </dl>
                  {Boolean(delta[String(selected.id)]) && (
                    <p className="ct-after">
                      After the open changes:{' '}
                      <b>{fmtQty(round2((selected.qty_with_proj ?? 0)
                                        + delta[String(selected.id)]))}</b>
                      {' '}kg with projection
                      <em> ({delta[String(selected.id)] > 0 ? '+' : ''}
                        {delta[String(selected.id)]} kg)</em>
                    </p>
                  )}
                  <p className="ct-foot">
                    {table?.source?.file
                      ? `${table.source.file}, stock ${fmtDay(table.source.stock_on)}`
                      : 'No YARN ANALYSIS loaded yet.'}
                  </p>
                </div>

                {/* PPIC names substitutes in prose; these are the ones that
                    are a yarn we actually hold. Using one records kilos
                    moved, exactly as their SUB COLOR column does. */}
                <div className="ct-detail-card ct-subs">
                  <h4>Cover a shortage</h4>
                  {changeErr && <p className="ct-error">{changeErr}</p>}
                  {cand === null && <p className="ct-empty">Looking…</p>}
                  {cand && cand.candidates?.length === 0 && (
                    <p className="ct-empty">
                      {cand.notes?.subs || cand.notes?.similar
                        ? 'PPIC names substitutes for this yarn, but none of them is a colour we hold.'
                        : 'PPIC names no substitute for this yarn.'}
                    </p>
                  )}
                  {Boolean(cand?.candidates?.length) && (
                    <>
                      <label>Kilos to take from the colour that stands in
                        <input className="input" type="number" step="any" min="0"
                          placeholder="e.g. 48.1" value={subKg}
                          onChange={(e) => setSubKg(e.target.value)} />
                      </label>
                      <ul className="ct-candlist">
                        {cand.candidates.map((c) => (
                          <li key={c.id}>
                            <button type="button" disabled={!subKg}
                              title={subKg ? `Use ${subKg} kg of ${c.name}`
                                : 'Type the kilos first'}
                              onClick={() => afterChange(api.saveColorSub({
                                short_id: selected.id, sub_id: c.id, kg: Number(subKg),
                              })).then(() => setSubKg(''))}>
                              <span>{c.name}</span>
                              <i>{c.av == null ? '—' : `${fmtQty(c.av)} kg`}
                                {c.why === 'similar' ? ' · looks similar' : ''}</i>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {Boolean(cand?.unmatched?.length) && (
                    <p className="ct-foot">
                      Also named, not ours: {cand.unmatched.join(', ')}
                    </p>
                  )}
                </div>

                {/* A yarn swap is proposed against ONE colourway, because
                    that is where a yarn sits. The BOM is never written. */}
                <div className="ct-detail-card ct-cways">
                  <h4>Knitted in {cways ? cways.length : '…'} colourway
                    {cways?.length === 1 ? '' : 's'}</h4>
                  {cways === null && <p className="ct-empty">Looking…</p>}
                  {cways?.length === 0 && (
                    <p className="ct-empty">No colourway knits with this colour.</p>
                  )}
                  <ul className="ct-cwlist">
                    {(allCways ? cways || [] : (cways || []).slice(0, 8)).map((cw) => (
                      <li key={cw.colorway_id}>
                        <div className="ct-cwrow">
                          <span>
                            <b>{cw.season}</b>{' '}
                            <Link to={`/edit/${cw.style_id}`}>{cw.style_name}</Link>
                            {cw.colorway_name ? ` · ${cw.colorway_name}` : ''}
                            <i> {(cw.slots || []).map((s) => `C${s}`).join(' ')}</i>
                          </span>
                          <button type="button" className="btn-chip"
                            onClick={() => {
                              setSwapFor(swapFor === cw.colorway_id ? null : cw.colorway_id);
                              setSwapQuery(''); setSwapKg('');
                            }}>
                            {cw.proposal ? 'Change' : 'Swap'}
                          </button>
                        </div>
                        {cw.proposal && (
                          <p className="ct-proposed">
                            proposed: {cw.proposal.to_label}
                            {cw.proposal.kg ? ` · ${fmtQty(cw.proposal.kg)} kg` : ''}
                            <button type="button" className="btn-chip"
                              onClick={() => afterChange(
                                api.withdrawProposal(cw.proposal.id))}>
                              Withdraw
                            </button>
                          </p>
                        )}
                        {swapFor === cw.colorway_id && (
                          <div className="ct-swap">
                            <span className="ct-pairrow">
                              <input className="input" autoFocus
                                placeholder="Knit this colour instead…"
                                value={swapQuery}
                                onChange={(e) => setSwapQuery(e.target.value)} />
                              <input className="input" type="number" step="any" min="0"
                                placeholder="kg (optional)" value={swapKg}
                                onChange={(e) => setSwapKg(e.target.value)} />
                            </span>
                            <ul>
                              {swapQuery.trim().length > 1 && allColors
                                .filter((c) => c.id !== selected.id
                                  && yarnGroup(c.name) === yarnGroup(selected.name)
                                  && c.name.toLowerCase()
                                       .includes(swapQuery.trim().toLowerCase()))
                                .slice(0, 6)
                                .map((c) => (
                                  <li key={c.id}>
                                    <button type="button"
                                      onClick={() => afterChange(api.saveProposal({
                                        colorway_id: cw.colorway_id,
                                        from_id: selected.id, to_id: c.id,
                                        kg: swapKg === '' ? null : Number(swapKg),
                                      })).then(() => setSwapFor(null))}>
                                      {c.name}
                                      <i>{c.qty_with_proj == null ? '—'
                                        : `${fmtQty(c.qty_with_proj)} kg`}</i>
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {(cways?.length || 0) > 8 && (
                    <button type="button" className="btn-chip"
                      onClick={() => setAllCways((v) => !v)}>
                      {allCways ? 'Show fewer'
                        : `Show all ${cways.length} colourways`}
                    </button>
                  )}
                </div>
              </aside>
            )}
          </div>
        </section>
      </main>

      <ReviewDialog open={reviewOpen} colors={allColors}
        onClose={() => setReviewOpen(false)}
        onAnswered={load} />
      <ChangesDialog open={changesOpen} colors={allColors}
        onClose={() => setChangesOpen(false)}
        onChanged={load} />

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
