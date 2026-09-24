import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

/**
 * Look a garment up and see every season it ran in.
 *
 * The Master File Lookup workbook pivots sales by style name and marks the
 * repeating ones by hand, which only works while the name stays the same.
 * Here the search covers every name a product has been known by, so a rename
 * does not split the history.
 *
 * Sales quantities are not shown: no sales data is loaded into this database
 * yet. What it answers is which styles are one garment — which is the part
 * the workbook has to be told.
 */
export default function MatrixSalesHistory() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setRows(null); return; }
    timer.current = setTimeout(() => {
      api.lookup(q.trim()).then(setRows).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div>
      <input className="input mfl-search" value={q} autoComplete="off"
        placeholder="Search a style — any name it has ever had, e.g. ARDEN"
        onChange={(e) => setQ(e.target.value)} />

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="muted mfl-hint">Keep typing…</p>
      )}
      {rows?.length === 0 && <p className="muted mfl-hint">Nothing matches.</p>}

      {rows?.map((p) => (
        <div className="mfl-row" key={p.id}>
          <div className="mfl-head">
            <span className="mfl-name">{p.display_name}</span>
            <span className={`mfl-count${p.seasons > 1 ? ' repeat' : ''}`}>
              {p.seasons === 1 ? 'one season' : `${p.seasons} seasons`}
            </span>
          </div>
          <div className="mfl-runs">
            {p.runs.map((r) => (
              <Link className="mfl-run" key={r.style_id} to={`/edit/${r.style_id}`}
                title={`Open ${r.name}`}>
                <span className="acc-season">{r.season}</span>
                <span className="mfl-run-name">{r.name}</span>
                <span className="mfl-run-cw">{r.colorways} cw</span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {rows === null && q.trim().length < 2 && (
        <p className="muted mfl-hint">
          Type a style name. Styles linked as the same garment are listed
          together, even where the name changed between seasons.
        </p>
      )}
    </div>
  );
}
