import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Printer, ArrowLeft, Shirt, GripVertical, RotateCcw } from 'lucide-react';
import { api } from '../api.js';

// What fits on one A4 sheet, landscape, and still reads across a table.
const PER_PAGE = 10;

const today = () => new Date().toLocaleDateString(undefined,
  { day: 'numeric', month: 'long', year: 'numeric' });

// Sold quantity for one colourway on one channel. There is no sales data in
// the database yet, so this is where it will be read from — the table and its
// total are built on it, rather than on a blank that has to be replaced.
const qty = (style, colour, channel) => style.sales?.[colour]?.[channel] ?? null;

const sum = (style, channel) => {
  const values = style.colorways
    .map((c) => qty(style, c, channel))
    .filter((v) => v != null);
  return values.length ? values.reduce((a, b) => a + Number(b), 0) : null;
};

const cell = (v) => (v == null ? '' : Number(v).toLocaleString('en-US'));

/**
 * The Matrix Master colouring: two facts crossed.
 *
 *                     sold >= threshold      sold < threshold
 *   repeating           good (green)           drop (blue)
 *   not repeating       add  (red)             — nothing
 *
 * "Repeating" means the same garment runs again a year later in the same half
 * of the year (F26 -> F27), which the product link answers.
 *
 * Returns null — no colour at all — whenever the question cannot be answered:
 * no threshold set, no sales fetched, or the next season not imported yet.
 * Colouring an unknown green or red is worse than leaving it plain, because
 * a colour reads as a decision that someone made.
 */
const verdict = (repeating, sold, threshold) => {
  if (!threshold || sold == null) return null;
  const above = Number(sold) >= Number(threshold);
  if (repeating && above) return 'good';
  if (!repeating && above) return 'add';
  if (repeating && !above) return 'drop';
  return null;
};

/**
 * The key, spelled out. Every line names the season and the number, because
 * the sheet is handed to someone who was not in the room when the report was
 * set up — "over the threshold" means nothing on paper without the figure.
 */
// Which channels the style is released on. A blank is the one case left
// unbadged: the workbook never filled it in, and that is not the same as
// "both" — saying BOTH there would invent an answer nobody gave.
const CHANNEL_MARK = { '000 ONLY': 'whs', 'SY ONLY': 'sy', BOTH: 'both' };

const CHANNEL_LEGEND = [
  ['whs', '000 ONLY', 'Wholesale only. Not sold on the SY web store, so an empty SY column is expected, not a gap.'],
  ['sy', 'SY ONLY', 'SY web store only. Not sold through wholesale, so an empty 000 column is expected.'],
  ['both', 'BOTH', 'Released on both channels, so a quantity is expected in either column.'],
];

const legendFor = (season) => [
  {
    key: 'good',
    verdict: 'KEEP REPEATING',
    rule: `Repeating into ${season}, and sold at or over the threshold.`,
    reading: 'Selling well and already carried over. Nothing to decide.',
  },
  {
    key: 'add',
    verdict: 'SHOULD REPEAT',
    rule: `Sold at or over the threshold, but not repeating into ${season}.`,
    reading: 'Earned its place and is about to be dropped. Worth a second look.',
  },
  {
    key: 'drop',
    verdict: 'SHOULD NOT REPEAT',
    rule: `Repeating into ${season}, but sold under the threshold.`,
    reading: 'Carried over without the sales to justify it.',
  },
];

// The two surfaces, so the key can say which colour is answering which
// question. A surface with no threshold set stays plain, and says so rather
// than leaving the reader to wonder why nothing is marked.
const surfacesFor = (sy, whs) => [
  ['Frame around the photo', 'SY', sy],
  ['Highlight behind the name', 'WHS 000', whs],
];

/**
 * A hand-made order, kept per collection as a list of style ids.
 *
 * Reordering is presentation, not data: it never changes which collection a
 * style belongs to, so a card can only move within its own section. Moving one
 * across sections would be a claim about the garment, not about the page.
 *
 * Held in the browser rather than on the report — see the note on the reset
 * button. Every access is guarded: storage throws in a private window and
 * comes back empty after a clear, and a sheet that cannot save an order must
 * still print one.
 */
const ORDER_KEY = (view, season) => `im-master:sheet-order:${view}|${season || 'all'}`;

const readOrder = (view, season) => {
  try {
    const raw = window.localStorage.getItem(ORDER_KEY(view, season));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};

const writeOrder = (view, season, value) => {
  try {
    const key = ORDER_KEY(view, season);
    if (Object.keys(value).length) {
      window.localStorage.setItem(key, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch { /* a sheet that cannot remember an order still shows one */ }
};

/**
 * Sort by a saved list of ids, keeping anything unlisted in server order.
 *
 * A style added to the collection after the order was saved is not in the
 * list. It sorts to the end rather than disappearing or throwing — the order
 * is a preference about a set that keeps changing under it.
 */
const byManualOrder = (items, order) => {
  if (!order?.length) return items;
  const at = new Map(order.map((id, i) => [String(id), i]));
  return [...items].sort((a, b) => {
    const pa = at.has(String(a.id)) ? at.get(String(a.id)) : Infinity;
    const pb = at.has(String(b.id)) ? at.get(String(b.id)) : Infinity;
    return pa - pb;          // Array#sort is stable, so ties keep server order
  });
};

const SEASON_NAMES = { S: 'SPRING', F: 'FALL' };
const seasonTitle = (code) => (code
  ? `${SEASON_NAMES[code[0]] || ''} ${code.slice(1)}`.trim()
  : 'ALL SEASONS');

/**
 * The review sheet, laid out for paper.
 *
 * One section per collection, split into A4 pages, so the boss gets the same
 * thing the Matrix Master worksheet gave them: the styles of a collection,
 * what each looks like, and whether it is new or a repeat.
 *
 * New or repeat is not a field anyone fills in — it is whether this garment
 * ran in an earlier season, which the product link answers.
 */
export default function PrintSheet() {
  const [params, setParams] = useSearchParams();
  const season = params.get('season') || '';
  const collection = params.get('collection') || '';
  const title = params.get('title') || '';
  // 'sales' turns the colourway list into a table of sold quantities.
  const view = params.get('view') || 'matrix';
  const startDate = params.get('start_date') || '';
  const endDate = params.get('end_date') || '';
  // Carried on the report, so the printed sheet marks the same styles
  // the operator set the report up to mark.
  const syThreshold = params.get('sy_threshold') || '';
  const whsThreshold = params.get('whs_000_threshold') || '';
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [periods, setPeriods] = useState(null);

  // The pickers live in the toolbar, which is hidden when printing, so the
  // selection is in the URL and the sheet itself carries no controls.
  const choose = (key) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(key, e.target.value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  // Empty cells look the same whether nothing sold or nothing was loaded.
  // Knowing which windows exist is what lets the page say which it is.
  useEffect(() => {
    if (view !== 'sales') return;
    api.salesPeriods(season).then(setPeriods).catch(() => setPeriods([]));
  }, [view, season]);

  const loaded = (periods || []).some(
    (p) => p.period_start === startDate && p.period_end === endDate);

  // One verdict per style, from its SY total across every colourway —
  // which is what the threshold is set against. It is shown twice: as a
  // frame around the photo and behind the name.
  // The two channels are judged separately and shown on different surfaces:
  // the frame around the photo is SY, the highlight behind the name is
  // WHS 000. Same rule, different quantity and different threshold — a style
  // can be worth repeating for the web store and not for wholesale.
  const syVerdict = (s) => (s.next_season_loaded
    ? verdict(s.repeats_next, sum(s, 'sy'), syThreshold)
    : null);
  const whsVerdict = (s) => (s.next_season_loaded
    ? verdict(s.repeats_next, sum(s, 'whs_000'), whsThreshold)
    : null);

  // Which season the repeat question is about, and whether it can be asked.
  // Every row of one report shares a season, so the first row speaks for all.
  const nextSeason = rows?.[0]?.next_season || '';
  // Either threshold on its own is enough: the report may care about one
  // channel only, and the surface without a threshold simply stays plain.
  const canJudge = Boolean(rows?.[0]?.next_season_loaded)
    && Boolean(syThreshold || whsThreshold);


  useEffect(() => {
    setRows(null);
    api.matrix({ season, collection, start_date: startDate, end_date: endDate })
      .then(setRows)
      .catch(() => setRows([]));
  }, [season, collection, startDate, endDate]);

  // A hand-made order, per collection. Loaded once per sheet, then written
  // back on every change.
  const [order, setOrder] = useState(() => readOrder(view, season));
  useEffect(() => { setOrder(readOrder(view, season)); }, [view, season]);
  useEffect(() => { writeOrder(view, season, order); }, [view, season, order]);

  const [dragging, setDragging] = useState(null);   // {id, collection}
  const [over, setOver] = useState(null);           // id the card is above

  // Collections in server order, each with its own cards ordered by hand.
  const groups = useMemo(() => {
    if (!rows) return [];
    const out = [];
    for (const r of rows) {
      const name = r.collection || 'No collection';
      let group = out.find((g) => g.name === name);
      if (!group) { group = { name, items: [] }; out.push(group); }
      group.items.push(r);
    }
    return out.map((g) => ({ ...g, items: byManualOrder(g.items, order[g.name]) }));
  }, [rows, order]);

  // Pages are cut from the ordered list, so dragging a card past the tenth
  // position moves it onto the next sheet — which is the point.
  const pages = useMemo(() => {
    const out = [];
    for (const g of groups) {
      const total = Math.ceil(g.items.length / PER_PAGE) || 1;
      for (let i = 0; i < total; i += 1) {
        out.push({
          collection: g.name,
          page: i + 1,
          of: total,
          items: g.items.slice(i * PER_PAGE, (i + 1) * PER_PAGE),
        });
      }
    }
    return out;
  }, [groups]);

  // Drop `fromId` where `toId` currently sits, within one collection.
  const moveCard = (collection, fromId, toId) => {
    if (fromId === toId) return;
    const group = groups.find((g) => g.name === collection);
    if (!group) return;
    const ids = group.items.map((r) => String(r.id));
    const from = ids.indexOf(String(fromId));
    const to = ids.indexOf(String(toId));
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setOrder((prev) => ({ ...prev, [collection]: ids }));
  };

  // Only the collections on screen count: an order saved for a collection you
  // are not looking at is not something the reset button should silently drop.
  const reordered = groups.filter((g) => order[g.name]).map((g) => g.name);
  const resetOrder = () => setOrder((prev) => {
    const next = { ...prev };
    for (const name of reordered) delete next[name];
    return next;
  });

  return (
    <div className="sheet-root">
      <div className="sheet-bar">
        <Link to="/report" className="btn-chip ghost"><ArrowLeft size={15} /> Back</Link>
        <select className="input sheet-pick" value={season} onChange={choose('season')}
          aria-label="Season">
          <option value="">All seasons</option>
          {(meta?.seasons || []).map((s) => (
            <option key={s.code} value={s.code}>{s.code}</option>
          ))}
        </select>

        <select className="input sheet-pick wide" value={collection}
          onChange={choose('collection')} aria-label="Collection">
          <option value="">All collections</option>
          {(meta?.collections || []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {reordered.length > 0 && (
          <button type="button" className="btn-chip ghost" onClick={resetOrder}
            title="Put the cards back in their original order">
            <RotateCcw size={15} /> Reset order
          </button>
        )}

        <span className="sheet-bar-title">
          {title && <strong>{title} · </strong>}
          {rows && <>{rows.length} styles · {pages.length} page{pages.length === 1 ? '' : 's'}</>}
        </span>
        <button type="button" className="btn btn-save" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </div>

      {view === 'sales' && periods && !loaded && (
        <div className="sheet-warn">
          <strong>No sales loaded for this period.</strong>{' '}
          {startDate
            ? <>Nothing has been fetched for {startDate} to {endDate}, so every
                quantity below is blank — it does not mean these styles sold
                nothing.</>
            : <>This sheet has no period, so there is nothing to look up. Add a
                date range to the report.</>}
          {periods.length > 0 && (
            <div className="sheet-warn-list">
              Loaded so far:{' '}
              {[...new Set(periods.map((p) => `${p.period_start} to ${p.period_end}`))]
                .map((p) => <span key={p} className="rep-period">{p}</span>)}
            </div>
          )}
        </div>
      )}

      {view === 'sales' && rows?.length > 0 && !canJudge && (
        <div className="sheet-warn">
          <strong>No repeat colouring on this sheet.</strong>{' '}
          {!syThreshold
            ? <>The report has no SY threshold, so there is no line between
                &ldquo;sold enough&rdquo; and &ldquo;did not&rdquo;.</>
            : <>{nextSeason} has not been imported, so nothing can be marked as
                repeating into it. Every style would read as
                &ldquo;not repeating&rdquo;, which is not the same as a decision
                to drop it.</>}
        </div>
      )}

      {rows === null && <div className="spinner" aria-label="Loading" />}
      {rows?.length === 0 && (
        <p className="result-count sheet-empty">
          Nothing to print for this selection.
        </p>
      )}

      {pages.map((p, i) => (
        <article className="sheet" key={`${p.collection}-${p.page}-${i}`}>
          <header className="sheet-head">
            <h1>
              {seasonTitle(season)} — {p.collection.toUpperCase()}
              {view === 'sales' && ' — SALES HISTORY'}
            </h1>
            <span className="sheet-page">PAGE {p.page} OF {p.of}</span>
            {view === 'sales' && startDate && (
              <span className="sheet-date">{startDate} to {endDate}</span>
            )}
            <span className="sheet-date">Printed {today()}</span>
          </header>

          {view === 'sales' && (
            <div className="sheet-legend">
              {/* The repeat key depends on a threshold and a next season.
                  The channel key below does not, so it prints either way —
                  a fragment keeps both as direct children of the grid. */}
              {canJudge && (<>
              <div className="sheet-legend-lead">
                <strong>KEY</strong>
                <span>
                  {surfacesFor(syThreshold, whsThreshold).map(([where, chan, t], i) => (
                    <span key={chan}>
                      {i > 0 && '  ·  '}
                      <b>{where}</b> — <b>{chan}</b> quantity sold
                      {t
                        ? <> against a threshold of <b className="sheet-legend-num">{t}</b>.</>
                        : <>, not marked: no threshold set.</>}
                    </span>
                  ))}
                  {' '}Both are totalled across every colourway for the period.
                </span>
              </div>
              {legendFor(nextSeason).map((l) => (
                <div className="sheet-legend-item" key={l.key}>
                  <i className={`sheet-key mark-${l.key}`} aria-hidden="true" />
                  <div>
                    <b>{l.verdict}</b>
                    <span className="sheet-legend-rule">{l.rule}</span>
                    <span className="sheet-legend-reading">{l.reading}</span>
                  </div>
                </div>
              ))}
              <div className="sheet-legend-note">
                Unmarked: not repeating into {nextSeason} and sold under the
                threshold — the sales agree with the decision, so there is
                nothing to flag. A blank quantity means nothing was fetched,
                not that nothing sold, and is never marked. The two surfaces
                are judged separately, so a style can be framed and not
                highlighted, or the other way round.
              </div>
              </>)}

              <div className="sheet-legend-chan">
                <strong>CHANNEL</strong>
                {CHANNEL_LEGEND.map(([key, label, text]) => (
                  <span className="sheet-legend-chan-item" key={key}>
                    <i className={`sheet-key chan-${key}`} aria-hidden="true" />
                    <span><b>{label}</b> — {text}</span>
                  </span>
                ))}
                <span className="sheet-legend-chan-item plain">
                  No badge: the workbook did not say which.
                </span>
              </div>
            </div>
          )}

          <div className="sheet-grid">
            {p.items.map((s) => (
              <div
                key={s.id}
                className={`sheet-card${dragging?.id === s.id ? ' dragging' : ''}${
                  over === s.id && dragging && dragging.id !== s.id ? ' drop-here' : ''}`}
                draggable
                onDragStart={(e) => {
                  setDragging({ id: s.id, collection: p.collection });
                  e.dataTransfer.effectAllowed = 'move';
                  // Firefox will not start a drag without data on the transfer.
                  e.dataTransfer.setData('text/plain', String(s.id));
                }}
                onDragEnd={() => { setDragging(null); setOver(null); }}
                onDragOver={(e) => {
                  // Only within the same section: a card cannot change which
                  // collection it belongs to by being dragged.
                  if (!dragging || dragging.collection !== p.collection) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (over !== s.id) setOver(s.id);
                }}
                onDragLeave={() => { if (over === s.id) setOver(null); }}
                onDrop={(e) => {
                  if (!dragging || dragging.collection !== p.collection) return;
                  e.preventDefault();
                  moveCard(p.collection, dragging.id, s.id);
                  setDragging(null); setOver(null);
                }}
              >
                <span className="sheet-drag" aria-hidden="true"
                  title={`Drag to move ${s.name} within ${p.collection}`}>
                  <GripVertical size={13} />
                </span>
                <div className={`sheet-photo${
                  view === 'sales' && syVerdict(s) ? ` mark-${syVerdict(s)}` : ''}`}>
                  {s.image_path
                    ? <img src={s.image_path} alt={s.name} />
                    : <Shirt size={38} strokeWidth={1.3} />}
                </div>
                <div className="sheet-badges">
                  {/* Yarn weight and NEW/REPEAT are Matrix Master concerns.
                      The sales sheet is read for what sold, so both only add
                      noise there — and the repeat question is already answered
                      by the frame and the name highlight. */}
                  {view !== 'sales' && (<>
                    <span className="sheet-ply">{s.ply ? `${s.ply} PLY` : 'PLY —'}</span>
                    <span className={`sheet-rep ${s.is_repeat ? 'repeat' : 'new'}`}>
                      {s.is_repeat ? `REPEAT ${s.last_season || ''}`.trim() : 'NEW'}
                    </span>
                  </>)}
                  {/* Which channels the style sells through at all. A separate
                      question from the repeat rule, and independent of it: a
                      style can be 000 ONLY and still be repeating. BOTH and
                      blank get no badge — only the restrictions are worth
                      calling out. */}
                  {view === 'sales' && CHANNEL_MARK[s.whs_channel] && (
                    <span className={`sheet-chan ${CHANNEL_MARK[s.whs_channel]}`}>
                      {s.whs_channel}
                    </span>
                  )}
                </div>
                <div className={`sheet-name${
                  view === 'sales' && whsVerdict(s) ? ` mark-${whsVerdict(s)}` : ''}`}>
                  {s.name}
                </div>
                <div className="sheet-code">{s.style_code || ''}</div>
                {view === 'sales' ? (
                  <table className="sheet-sales">
                    <thead>
                      <tr><th /><th>WHS 000</th><th>SY</th></tr>
                    </thead>
                    <tbody>
                      {s.colorways.map((c) => (
                        <tr key={c}>
                          <th scope="row">{c}</th>
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
                ) : (
                  <ul className="sheet-colours">
                    {s.colorways.map((c) => <li key={c}>{c}</li>)}
                    {s.colorways.length === 0 && <li className="none">no colourways</li>}
                  </ul>
                )}

              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
