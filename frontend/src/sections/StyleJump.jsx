import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api.js';

/**
 * Jump straight to another style from the editor's header.
 *
 * The editor is where someone spends the afternoon, and until now moving to
 * the next style meant going back to Browse, searching, and clicking through.
 *
 * `onLeave` is given the id rather than navigating here, because the editor
 * has unsaved-changes handling of its own — jumping away has to go through
 * the same guard as every other way out, or a half-typed style is lost.
 */
export default function StyleJump({ onLeave }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return undefined; }
    // Waits for a pause in typing: a request per keystroke would race itself
    // and the later answer is not always the later request.
    const t = setTimeout(() => {
      api.listStyles({ q, limit: 8 })
        .then((rows) => { setHits(rows.slice(0, 8)); setOpen(true); })
        .catch(() => setHits([]));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // Clicking anywhere else puts it away.
  useEffect(() => {
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const go = (style) => {
    setQuery('');
    setHits([]);
    setOpen(false);
    onLeave(style.id);
  };

  return (
    <div className="style-jump" ref={box}>
      <Search size={15} className="style-jump-icon" aria-hidden="true" />
      <input
        className="input"
        type="search"
        value={query}
        placeholder="Go to style…"
        aria-label="Go to another style"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (hits.length) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setQuery(''); setOpen(false); }
          if (e.key === 'Enter' && hits.length) { e.preventDefault(); go(hits[0]); }
        }}
      />
      {open && hits.length > 0 && (
        <ul className="style-jump-hits">
          {hits.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => go(s)}>
                <span className="style-jump-name">{s.name}</span>
                <span className="style-jump-meta">{s.season}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= 2 && hits.length === 0 && (
        <ul className="style-jump-hits">
          <li className="style-jump-none">Nothing matches “{query.trim()}”</li>
        </ul>
      )}
    </div>
  );
}
