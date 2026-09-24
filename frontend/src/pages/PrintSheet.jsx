import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Printer, ArrowLeft, Shirt } from 'lucide-react';
import { api } from '../api.js';

// What fits on one A4 sheet, landscape, and still reads across a table.
const PER_PAGE = 10;

const today = () => new Date().toLocaleDateString(undefined,
  { day: 'numeric', month: 'long', year: 'numeric' });

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
  // 'sales' adds the season-by-season table to each card.
  const view = params.get('view') || 'matrix';
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);

  // The pickers live in the toolbar, which is hidden when printing, so the
  // selection is in the URL and the sheet itself carries no controls.
  const choose = (key) => (e) => {
    const next = new URLSearchParams(params);
    if (e.target.value) next.set(key, e.target.value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);

  // Newest first, and exactly the seasons that exist — the table is the
  // history, so it should not invent rows for seasons nobody has run.
  const seasonRows = (meta?.seasons || []).map((s) => s.code);

  useEffect(() => {
    setRows(null);
    api.matrix({ season, collection })
      .then(setRows)
      .catch(() => setRows([]));
  }, [season, collection]);

  // Collection first, then A4-sized pages inside it.
  const pages = useMemo(() => {
    if (!rows) return [];
    const byCollection = [];
    for (const r of rows) {
      const name = r.collection || 'No collection';
      let group = byCollection.find((g) => g.name === name);
      if (!group) { group = { name, items: [] }; byCollection.push(group); }
      group.items.push(r);
    }
    const out = [];
    for (const g of byCollection) {
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
  }, [rows]);

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

        <span className="sheet-bar-title">
          {title && <strong>{title} · </strong>}
          {rows && <>{rows.length} styles · {pages.length} page{pages.length === 1 ? '' : 's'}</>}
        </span>
        <button type="button" className="btn btn-save" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </div>

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
            <span className="sheet-date">Printed {today()}</span>
          </header>

          <div className="sheet-grid">
            {p.items.map((s) => (
              <div className="sheet-card" key={s.id}>
                <div className="sheet-photo">
                  {s.image_path
                    ? <img src={s.image_path} alt={s.name} />
                    : <Shirt size={38} strokeWidth={1.3} />}
                </div>
                <div className="sheet-badges">
                  <span className="sheet-ply">{s.ply ? `${s.ply} PLY` : 'PLY —'}</span>
                  <span className={`sheet-rep ${s.is_repeat ? 'repeat' : 'new'}`}>
                    {s.is_repeat ? `REPEAT ${s.last_season || ''}`.trim() : 'NEW'}
                  </span>
                </div>
                <div className="sheet-name">{s.name}</div>
                <div className="sheet-code">{s.style_code || ''}</div>
                <ul className="sheet-colours">
                  {s.colorways.map((c) => <li key={c}>{c}</li>)}
                  {s.colorways.length === 0 && <li className="none">no colourways</li>}
                </ul>

                {view === 'sales' && (
                  <table className="sheet-sales">
                    <tbody>
                      {seasonRows.map((code) => {
                        const ran = (s.seasons_run || []).includes(code);
                        return (
                          <tr key={code} className={ran ? 'ran' : ''}>
                            <th scope="row">{code}</th>
                            <td>{ran ? '' : '\u2014'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
