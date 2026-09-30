import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Printer, ArrowLeft, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
// The card itself is shared with the Matrix screen, so what the team
// arranges there is what comes out of the printer.
import SheetCard, { qty, sum, attributesOf, numberCards } from '../sections/SheetCard.jsx';

// What fits on one A4 sheet, landscape, and still reads across a table.
// Adjustable from the toolbar: how much fits depends on how tall the cards
// come out, which depends on how many attributes a season has filled in.
const PER_PAGE = 10;
const PAGE_SIZES = [5, 8, 10, 12, 13, 15, 20];

// Two ways to fill a sheet. 'grid' keeps five roomy cards across and runs
// down the page; 'row' puts every card of the page in one line, the way the
// workbook does, so the cards get as narrow as the count demands.
const LAYOUTS = [['grid', 'Grid, 5 across'], ['row', 'One row']];

// A4 landscape, less the 12mm margins each side.
const PAGE_WIDTH_MM = 297 - 24;
const COLUMN_GAP_MM = 1.5;

const cardWidthMm = (columns) =>
  (PAGE_WIDTH_MM - (columns - 1) * COLUMN_GAP_MM) / columns;

/**
 * Type size for a given number of columns across.
 *
 * Scaled rather than fixed, because a sheet of eight has room the same sheet
 * of twenty does not, and there is no reason to print eight at the size
 * twenty forces.
 *
 * 6pt is the floor worth printing: below it an office laser on plain paper
 * fills in the counters and the text greys out rather than reads. The sheet
 * still renders below that — it is the operator's call, not ours — but the
 * toolbar says so.
 */
const LEGIBLE_PT = 6;

const typeScale = (columns) => {
  const width = cardWidthMm(columns);
  // Roughly a point of type per 3mm of card, which keeps a two-word style
  // name on two or three lines rather than seven.
  const base = Math.max(4, Math.min(8, width / 3));
  return {
    name: base,
    body: base * 0.85,
    chip: base * 0.75,
    legible: base >= LEGIBLE_PT,
  };
};

// A photo holding both the front and the back of a garment is about twice as
// wide as a single shot. Its card takes two columns rather than squeezing the
// pair into one, and counts as two places on the page.
const WIDE_RATIO = 1.3;

const today = () => new Date().toLocaleDateString(undefined,
  { day: 'numeric', month: 'long', year: 'numeric' });

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

const CHANNEL_LEGEND = [
  ['whs', '000 ONLY', 'Wholesale only. Not sold on the SY web store, so an empty SY column is expected, not a gap.'],
  ['sy', 'SY ONLY', 'SY web store only. Not sold through wholesale, so an empty 000 column is expected.'],
  ['both', 'BOTH', 'Released on both channels, so a quantity is expected in either column.'],
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

/**
 * Cut a collection into pages, counting places rather than cards.
 *
 * A wide card takes two places, so a page is full when the places are used up,
 * not when a number of cards is reached. A card that would straddle the end
 * starts the next page instead of being split across the fold.
 *
 * Always returns at least one page, so a collection with nothing in it still
 * prints its heading rather than vanishing from the run.
 */
const cutPages = (items, perPage, isWide) => {
  const places = Math.max(1, Number(perPage) || 1);
  const out = [];
  let current = [];
  let used = 0;
  for (const item of items) {
    // A card wider than a whole page still has to go somewhere: it gets a
    // page of its own rather than looping for ever looking for room.
    const takes = Math.min(isWide(item) ? 2 : 1, places);
    if (used + takes > places && current.length) {
      out.push(current); current = []; used = 0;
    }
    current.push(item);
    used += takes;
  }
  if (current.length || !out.length) out.push(current);
  return out;
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
  const navigate = useNavigate();
  const location = useLocation();
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
  useEffect(() => { api.checklistSteps().then(setSteps).catch(() => setSteps([])); }, []);

  // Read each photo's own proportions before laying the page out. Done here
  // rather than from a stored flag because the file already knows, and a flag
  // is one more thing to keep in step with it. The browser has the bytes
  // cached by the time the card renders, so this costs one pass, not two.
  useEffect(() => {
    if (!rows?.length) { setWide({}); return undefined; }
    let live = true;
    Promise.all(rows.filter((r) => r.image_path).map((r) => new Promise((done) => {
      const img = new window.Image();
      img.onload = () => done([r.id, img.naturalWidth / img.naturalHeight >= WIDE_RATIO]);
      img.onerror = () => done([r.id, false]);   // a broken photo is not wide
      img.src = r.image_path;
    }))).then((pairs) => { if (live) setWide(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [rows]);

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

  // How many places a page holds, and which photos are wide. Both feed
  // pagination, so both are settled before the pages are cut.
  const perPage = Number(params.get('per_page')) || PER_PAGE;
  const layout = params.get('layout') === 'row' ? 'row' : 'grid';
  const scale = typeScale(layout === 'row' ? perPage : 5);
  const [steps, setSteps] = useState([]);
  const [wide, setWide] = useState({});

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
      const sheets = cutPages(g.items, perPage, (item) => Boolean(wide[item.id]));
      // Numbered over the whole collection before it is cut into pages: the
      // web-store-only styles carry their own S sequence, so a card's number
      // cannot be worked out from its position on the page.
      const numbers = numberCards(g.items);
      sheets.forEach((items, i) => out.push({
        collection: g.name, page: i + 1, of: sheets.length, items, numbers,
      }));
    }
    return out;
  }, [groups, wide, perPage]);

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
        {/* Back to the page this sheet was opened from, with whatever was
            set up on it — a fresh /matrix would land on the season picker and
            the filters would have to be chosen again.

            A plain link when there is nowhere to go back to: the sheet is
            printed from a saved report's link and opened cold often enough
            that history cannot be assumed. */}
        <button type="button" className="btn-chip ghost"
          onClick={() => {
            if (location.key && location.key !== 'default') navigate(-1);
            else navigate(view === 'sales' ? '/report' : '/matrix');
          }}>
          <ArrowLeft size={15} /> Back
        </button>
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

        <select className="input sheet-pick" value={layout}
          aria-label="Page layout"
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('layout', e.target.value);
            setParams(next, { replace: true });
          }}>
          {LAYOUTS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select className="input sheet-pick" value={perPage}
          aria-label="Cards per page"
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('per_page', e.target.value);
            setParams(next, { replace: true });
          }}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>

        {layout === 'row' && !scale.legible && (
          <span className="sheet-warn-inline"
            title="Office printers stop resolving type below about 6pt on plain paper">
            {cardWidthMm(perPage).toFixed(0)}mm cards · {scale.name.toFixed(1)}pt —
            too small to print
          </span>
        )}

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

          <div
            className={`sheet-grid${layout === 'row' ? ' one-row' : ''}`}
            style={layout === 'row' ? {
              gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))`,
              '--name-pt': `${scale.name.toFixed(2)}pt`,
              '--body-pt': `${scale.body.toFixed(2)}pt`,
              '--chip-pt': `${scale.chip.toFixed(2)}pt`,
            } : undefined}
          >
            {p.items.map((s) => (
              <SheetCard
                key={s.id}
                style={s}
                index={p.numbers[s.id]}
                view={view}
                steps={steps}
                wide={Boolean(wide[s.id])}
                frameMark={view === 'sales' ? syVerdict(s) : null}
                nameMark={view === 'sales' ? whsVerdict(s) : null}
                onOpen={(style) => navigate(`/edit/${style.id}`)}
                drag={{
                  isDragging: dragging?.id === s.id,
                  isOver: over === s.id && dragging && dragging.id !== s.id,
                  title: `Drag to move ${s.name} within ${p.collection}`,
                  handlers: {
                    draggable: true,
                    onDragStart: (e) => {
                      setDragging({ id: s.id, collection: p.collection });
                      e.dataTransfer.effectAllowed = 'move';
                      // Firefox will not start a drag without data on the transfer.
                      e.dataTransfer.setData('text/plain', String(s.id));
                    },
                    onDragEnd: () => { setDragging(null); setOver(null); },
                    onDragOver: (e) => {
                      // Only within the same section: a card cannot change
                      // which collection it belongs to by being dragged.
                      if (!dragging || dragging.collection !== p.collection) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (over !== s.id) setOver(s.id);
                    },
                    onDragLeave: () => { if (over === s.id) setOver(null); },
                    onDrop: (e) => {
                      if (!dragging || dragging.collection !== p.collection) return;
                      e.preventDefault();
                      moveCard(p.collection, dragging.id, s.id);
                      setDragging(null); setOver(null);
                    },
                  },
                }}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
