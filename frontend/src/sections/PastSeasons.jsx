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

  const reload = () => {
    if (!styleId) { setRows([]); return Promise.resolve(); }
    return api.related(styleId)
      .then(setRows)
      .catch(() => setRows([]));
  };

  useEffect(() => {
    if (!styleId) { setRows([]); return undefined; }
    let live = true;
    api.related(styleId)
      .then((r) => { if (live) setRows(r); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [styleId]);

  // Search as they type, but not on every keystroke.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!adding || query.trim().length < 2) { setHits([]); return undefined; }
    // The timer cleanup stops a fetch STARTING late; this flag stops one
    // that already started from LANDING late — a slow response for "ME"
    // must not overwrite the hits for "MERRY".
    let live = true;
    timer.current = setTimeout(() => {
      api.listStyles({ q: query.trim(), limit: 24 })
        .then((r) => { if (live) setHits(r.filter((s) => s.id !== styleId).slice(0, 8)); })
        .catch(() => { if (live) setHits([]); });
    }, 250);
    return () => { live = false; clearTimeout(timer.current); };
  }, [query, adding, styleId]);

  const link = async (otherId) => {
    try {
      setRows(await api.linkStyle(styleId, otherId));
      setAdding(false); setQuery(''); setHits([]);
      onToast?.('Linked — these are now one product');
    } catch (e) { onToast?.(e.message, 'error'); }
  };

  /**
   * Take ONE season out of the group.
   *
   * The route answers with the related list of the style it detached, which
   * is not the style on screen, so the panel is reloaded rather than filled
   * from the reply.
   *
   * Everything else stays linked to everything else: splitting F26 out of
   * {F27, F26, F25} leaves F27 and F25 one garment, which is what "unlink
   * this one" means when it is a row that is being pointed at.
   */
  const unlinkOne = async (row) => {
    try {
      await api.unlinkStyle(row.id);
      await reload();
      onToast?.(`${row.season} unlinked — the rest stay linked`);
    } catch (e) { onToast?.(e.message, 'error'); }
  };

  // Take the style being EDITED out of the group. The others keep each
  // other; from here that looks like the list emptying, which is why this
  // one says whose link it is breaking.
  const unlinkSelf = async () => {
    try {
      setRows(await api.unlinkStyle(styleId));
      onToast?.('This style is its own product now — the others stay linked');
    } catch (e) { onToast?.(e.message, 'error'); }
  };

  if (!styleId) {
    return (
      <div className="past">
        <div className="group-label">Linked seasons</div>
        <p className="muted past-empty">Save the style to link it to earlier seasons.</p>
      </div>
    );
  }

  return (
    <div className="past">
      <div className="group-label">Linked seasons</div>

      {rows === null && <p className="muted past-empty">Looking…</p>}

      {rows?.length === 0 && (
        <p className="muted past-empty">
          No other season linked. If this style ran before under any name, link it.
        </p>
      )}

      {rows?.map((r) => (
        <div className="past-row-wrap" key={r.id}>
        <button type="button" className="past-row"
          onClick={() => onOpen(r.id)}
          title={`Open ${r.name} (${r.season})`}>
          <span className="acc-season">{r.season}</span>
          <span className="past-name">{r.name}</span>
          {/* The last three of the style code. A dash where a style has no
              number yet — 9 of 1,467 — rather than an empty column, so the
              row still reads as having been looked at. */}
          <span className={`past-sku${r.sku_tail ? '' : ' none'}`}
            title={r.sku_tail ? 'Last three of the style code' : 'No style number yet'}>
            {r.sku_tail || '—'}
          </span>
        </button>
        <button type="button" className="past-unlink"
          onClick={() => unlinkOne(r)}
          aria-label={`Unlink ${r.name} (${r.season})`}
          title={`Unlink ${r.season} — the other seasons stay linked`}>
          <Unlink size={14} />
        </button>
        </div>
      ))}

      {!adding ? (
        <div className="past-actions">
          <button type="button" className="btn-chip" onClick={() => setAdding(true)}>
            <Link2 size={15} /> Link a past style
          </button>
          {rows?.length > 0 && (
            <button type="button" className="btn-chip ghost" onClick={unlinkSelf}
              title={`Take ${styleName || 'this style'} out of the group`
                     + ' — the other seasons stay linked to each other'}>
              <Unlink size={15} /> Unlink this style
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
