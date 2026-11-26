import { useEffect, useRef, useState } from 'react';
import { Search, Shirt, CornerDownLeft } from 'lucide-react';
import { api } from '../api.js';

/**
 * Import an existing style into this season, as the same garment.
 *
 * Most of a new season's sheet is the last one's. Before this, saying so
 * meant typing the name, then every colourway, then every yarn of every
 * colourway — and then remembering to link the two seasons, which is the
 * step that gets forgotten, and the one that decides whether the sales
 * report can see that the garment ran before.
 *
 * So the copy and the link are one action. There is no way to do the first
 * without the second.
 *
 * Shown as a dialog rather than inside the add card: the card is 160px wide
 * and this needs a search field and a list of results.
 */
export default function ImportStyle({ season, collection, onClose, onImported }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Debounced, because this fires on every keystroke and the list is the
  // whole style table. 200ms is below the gap between two typed characters
  // and above the gap inside a burst.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setSearching(false); return undefined; }
    setSearching(true);
    let live = true;
    const t = setTimeout(() => {
      api.listStyles({ q, limit: 12 })
        .then((rows) => { if (live) setHits(rows || []); })
        .catch(() => { if (live) setHits([]); })
        .finally(() => { if (live) setSearching(false); });
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const choose = (row) => {
    setChosen(row);
    setName(row.name);          // renameable, because a repeat often is renamed
    setError('');
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!chosen || busy) return;
    setBusy(true);
    setError('');
    try {
      const made = await api.importStyle(chosen.id, {
        season,
        collection: collection === 'No collection' ? '' : collection,
        // Only sent when it was actually changed, so the server keeps the
        // source's name rather than being handed back what it already has.
        name: name.trim() && name.trim() !== chosen.name ? name.trim() : null,
      });
      onImported?.(made, chosen);
    } catch (err) {
      setError(err.message || 'Could not import that style');
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog import-dialog" role="dialog" aria-modal="true"
        aria-label="Import an existing style"
        onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }}>
        <h3>Import an existing style</h3>
        <p className="import-sub">
          Into <strong>{season}</strong>
          {collection && collection !== 'No collection'
            ? <> · <strong>{collection}</strong></> : null}
        </p>

        <label className="import-search">
          <Search size={15} aria-hidden="true" />
          <input
            autoFocus
            className="input"
            value={query}
            placeholder="Search a style from any season"
            aria-label="Search for the style to import"
            onChange={(e) => { setQuery(e.target.value); setChosen(null); }}
          />
        </label>

        {/* The list and the chosen-style panel share one slot. Showing both
            would mean the thing just picked scrolls out of sight under the
            results it was picked from. */}
        {chosen ? (
          <form className="import-chosen" onSubmit={submit}>
            <div className="import-chosen-head">
              <span className="import-season">{chosen.season}</span>
              <strong>{chosen.name}</strong>
              <button type="button" className="btn-chip ghost"
                onClick={() => setChosen(null)} disabled={busy}>
                Change
              </button>
            </div>

            <label className="import-rename">
              <span>Name in {season}</span>
              <input
                className="input"
                value={name}
                aria-label={`Name for the imported style in ${season}`}
                onChange={(e) => setName(e.target.value.toUpperCase())}
              />
            </label>

            {/* Said plainly, because the thing people get wrong about a copy
                is assuming it copied more than it did. */}
            <ul className="import-carries">
              <li className="yes">
                Colourways and their yarns, sizes and weights, measurements,
                trims, minutes, and the attribute block
              </li>
              <li className="yes">
                Linked to {chosen.season} as the same garment, keeping its
                style number
              </li>
              <li className="no">
                Not the checklist, notes, pen marks or prices — those are
                this season&rsquo;s to decide
              </li>
            </ul>

            {error && <p className="import-error" role="alert">{error}</p>}

            <div className="dialog-actions">
              <button type="button" className="btn-ghost" onClick={onClose}
                disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-save"
                disabled={busy || !name.trim()}>
                {busy ? 'Importing…' : 'Import into ' + season}
              </button>
            </div>
          </form>
        ) : (
          <div className="import-results">
            {query.trim().length < 2 && (
              <p className="import-hint">
                Type at least two letters. Any season — the copy lands in
                {' '}{season}.
              </p>
            )}
            {query.trim().length >= 2 && searching && hits.length === 0 && (
              <p className="import-hint">Searching…</p>
            )}
            {query.trim().length >= 2 && !searching && hits.length === 0 && (
              <p className="import-hint">Nothing matches that.</p>
            )}
            <ul>
              {hits.map((row) => (
                <li key={row.id}>
                  <button type="button" className="import-hit"
                    onClick={() => choose(row)}>
                    <span className="import-thumb">
                      {row.image_path
                        ? <img src={row.image_path} alt="" />
                        : <Shirt size={16} aria-hidden="true" />}
                    </span>
                    <span className="import-hit-name">{row.name}</span>
                    <span className="import-hit-meta">
                      <span className="import-season">{row.season}</span>
                      {/* A style with no colourways copies almost nothing,
                          which is worth knowing before picking it. */}
                      <span className={row.colorway_count ? '' : 'none'}>
                        {row.colorway_count || 'no'} colour
                        {row.colorway_count === 1 ? '' : 's'}
                      </span>
                    </span>
                    <CornerDownLeft size={13} className="import-pick"
                      aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
