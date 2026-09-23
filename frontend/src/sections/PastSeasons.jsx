import { useEffect, useRef, useState } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { api } from '../api.js';

/**
 * The same garment in other seasons.
 *
 * Style names and SKUs change between seasons — 267 products already run in
 * more than one — so what holds them together is the product, not the name.
 * This is what a sales report merges on (identity.md), and it is the reason
 * a wrong link matters: it would merge two garments' sales silently.
 */
export default function PastSeasons({ styleId, styleName, onOpen, onToast }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    if (!styleId) { setRows([]); return; }
    let live = true;
    api.related(styleId)
      .then((r) => { if (live) setRows(r); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [styleId]);

  // Search as they type, but not on every keystroke.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!adding || query.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => {
      api.listStyles({ q: query.trim() })
        .then((r) => setHits(r.filter((s) => s.id !== styleId).slice(0, 8)))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query, adding, styleId]);

  const link = async (otherId) => {
    try {
      setRows(await api.linkStyle(styleId, otherId));
      setAdding(false); setQuery(''); setHits([]);
      onToast?.('Linked — these are now one product');
    } catch (e) { onToast?.(e.message, 'error'); }
  };

  const unlink = async () => {
    try {
      setRows(await api.unlinkStyle(styleId));
      onToast?.('Unlinked — this style is its own product now');
    } catch (e) { onToast?.(e.message, 'error'); }
  };

  if (!styleId) {
    return (
      <div className="past">
        <div className="group-label">Past seasons</div>
        <p className="muted past-empty">Save the style to link it to earlier seasons.</p>
      </div>
    );
  }

  return (
    <div className="past">
      <div className="group-label">Past seasons</div>

      {rows === null && <p className="muted past-empty">Looking…</p>}

      {rows?.length === 0 && (
        <p className="muted past-empty">
          No other season linked. If this style ran before under any name, link it.
        </p>
      )}

      {rows?.map((r) => (
        <button type="button" key={r.id} className="past-row"
          onClick={() => onOpen(r.id)}
          title={`Open ${r.name} (${r.season})`}>
          <span className="acc-season">{r.season}</span>
          <span className="past-name">{r.name}</span>
        </button>
      ))}

      {!adding ? (
        <div className="past-actions">
          <button type="button" className="btn-chip" onClick={() => setAdding(true)}>
            <Link2 size={15} /> Link a past style
          </button>
          {rows?.length > 0 && (
            <button type="button" className="btn-chip ghost" onClick={unlink}>
              <Unlink size={15} /> Unlink this one
            </button>
          )}
        </div>
      ) : (
        <div className="past-search">
          <input className="input" autoFocus value={query}
            placeholder={`Search a style, e.g. ${(styleName || 'ALEX').split(' ')[0]}`}
            onChange={(e) => setQuery(e.target.value)} />
          {hits.map((h) => (
            <button type="button" key={h.id} className="past-hit"
              onClick={() => link(h.id)}>
              <span className="acc-season">{h.season}</span>
              <span className="past-name">{h.name}</span>
            </button>
          ))}
          {query.trim().length >= 2 && hits.length === 0 && (
            <p className="muted past-empty">Nothing matches.</p>
          )}
          <button type="button" className="btn-chip ghost"
            onClick={() => { setAdding(false); setQuery(''); }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
