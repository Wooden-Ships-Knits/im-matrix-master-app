import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePlus, ClipboardList, TextSearch, Check, Ruler} from 'lucide-react';
import { Field, useToast } from '../components/ui.jsx';
import { api } from '../api.js';
import Wordmark from '../components/Wordmark.jsx';

// Who ticked it. The API records this against every tick; until there are
// accounts, the browser remembers what was typed so it is not retyped daily.
const WHO_KEY = 'im-master:checklist-who';
const readWho = () => {
  try { return window.localStorage.getItem(WHO_KEY) || ''; } catch { return ''; }
};

/**
 * The preparation checklist, as a grid: styles down, steps across.
 *
 * A grid rather than a panel on the style editor because the steps are ticked
 * in bulk. Nine steps across forty styles is a lot of ticks in one sitting,
 * and through the editor each one costs a page load and a back button.
 *
 * The steps are independent and in no enforced order — the workbook keeps
 * them as rows greyed in when done, and nothing stops a later one being
 * finished first.
 */
export default function Checklist() {
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const [steps, setSteps] = useState([]);
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState('');
  const [collection, setCollection] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [query, setQuery] = useState('');
  const [who, setWho] = useState(readWho);
  // Ticks in flight, so a cell cannot be clicked twice before it answers.
  const [busy, setBusy] = useState(() => new Set());

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api.checklistSteps().then(setSteps).catch(() => setSteps([])); }, []);

  // A season is required. Without one this reads every style of every season
  // — 1,467 rows and ten steps each — to fill a grid nobody works through
  // that way, and the collection names collide across seasons anyway.
  useEffect(() => {
    if (!season) { setRows(null); return; }
    setRows(null);
    api.checklist({ season, collection })
      .then(setRows)
      .catch(() => setRows([]));
  }, [season, collection]);

  useEffect(() => {
    try { window.localStorage.setItem(WHO_KEY, who); } catch { /* fine */ }
  }, [who]);

  const named = who.trim().length > 0;
  // Clearing the name puts the page back to the start rather than leaving a
  // loaded grid whose ticks would be recorded against nobody.
  useEffect(() => { if (!named && season) setSeason(''); }, [named]);

  // Collections belong to a season — S26's COTTON and F26's COTTON are
  // different blocks — so only this season's are offered, and one carried
  // over from a previous choice is cleared rather than left matching nothing.
  const collections = meta?.collections_by_season?.[season] || [];
  useEffect(() => {
    if (collection && !collections.includes(collection)) setCollection('');
  }, [season, meta]);

  const done = (row, code) => Boolean(row.steps?.[code]);
  const doneCount = (row) => steps.filter((s) => done(row, s.code)).length;
  const complete = (row) => steps.length > 0 && doneCount(row) === steps.length;

  // Search matches the name or the style code, so K57C3W207 finds it too.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (hideDone && complete(r)) return false;
      if (!q) return true;
      return `${r.name} ${r.style_code || ''}`.toLowerCase().includes(q);
    });
  }, [rows, hideDone, steps, query]);

  // Which step is holding things up. Counted over what is on screen rather
  // than the whole season: the numbers describe the rows under them, so
  // narrowing the list narrows the count with it.
  const perStep = useMemo(() => {
    const out = {};
    for (const s of steps) out[s.code] = shown.filter((r) => done(r, s.code)).length;
    return out;
  }, [shown, steps]);

  const toggle = async (row, code, auto) => {
    if (auto) return;                    // worked out from the data
    const key = `${row.id}:${code}`;
    if (busy.has(key)) return;
    const next = !done(row, code);
    setBusy((b) => new Set(b).add(key));
    // Shown as ticked straight away: the operator is working down a column
    // and a round trip per cell would make the grid feel broken.
    setRows((prev) => prev.map((r) => {
      if (r.id !== row.id) return r;
      const s = { ...(r.steps || {}) };
      if (next) s[code] = { by: who || null, at: new Date().toISOString() };
      else delete s[code];
      return { ...r, steps: s };
    }));
    try {
      await api.setStep(row.id, code, next, who);
      // A hand tick can change a computed one — IM decides C-IM — and only
      // the server knows the rules, so take the row's steps back from it.
      const fresh = await api.checklist({ season, collection });
      const updated = fresh.find((r) => r.id === row.id);
      if (updated) {
        setRows((prev) => prev.map(
          (r) => (r.id === row.id ? { ...r, steps: updated.steps } : r)));
      }
    } catch (err) {
      // Put it back the way it was, and say so — a tick that silently did
      // not save is worse than no tick.
      setRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r;
        const s = { ...(r.steps || {}) };
        if (next) delete s[code]; else s[code] = row.steps[code];
        return { ...r, steps: s };
      }));
      toast?.(err.message || 'Could not save that tick', 'error');
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(key); return n; });
    }
  };

  const total = shown.length;

  return (
    <>
      <header className="band">
        <div className="band-row">
          <Wordmark />
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
          <Link to="/matrix" className="band-link"><Ruler size={18} /> Matrix</Link>
          <Link to="/browse" className="band-link"><TextSearch size={18} /> Browse</Link>
          <Link to="/report" className="band-link"><ClipboardList size={18} /> Report</Link>
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          <h2 className="card-title">Checklist</h2>
          <p className="card-sub">
            What has been prepared for each style. Ticks save as you make them.
            Columns marked <em>auto</em> are worked out from the style record
            rather than ticked — hover one to see what decides it.
          </p>

          <div className="chk-filters">
            {/* First, and required before anything else: every tick is
                recorded against a person, and a grid of ticks nobody is
                attached to is worth less than no grid at all. The browser
                remembers it, so this is a one-off on most days. */}
            <Field label="Your name" hint="Recorded against each tick">
              <input className="input" value={who} placeholder="e.g. Putri"
                required aria-required="true"
                onChange={(e) => setWho(e.target.value)} />
            </Field>
            <Field label="Season"
              hint={named ? 'Required' : 'Enter your name first'}>
              <select className="input" value={season} required disabled={!named}
                onChange={(e) => setSeason(e.target.value)}>
                <option value="">Choose a season…</option>
                {(meta?.seasons || []).map((s) => (
                  <option key={s.code} value={s.code}>{s.code}</option>
                ))}
              </select>
            </Field>
            <Field label="Collection"
              hint={season ? `${collections.length} in ${season}` : 'Pick a season first'}>
              <select className="input" value={collection} disabled={!season}
                onChange={(e) => setCollection(e.target.value)}>
                <option value="">
                  {season ? `All collections in ${season}` : '—'}
                </option>
                {collections.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <label className="chk-toggle">
              <input type="checkbox" checked={hideDone}
                onChange={(e) => setHideDone(e.target.checked)} />
              Hide completed
            </label>
          </div>
        </section>

        {!named && (
          <p className="result-count mx-waiting">
            Put your name in first. Every tick is recorded against the person
            who made it, so the sheet can say who did what and when.
          </p>
        )}

        {named && !season && (
          <p className="result-count mx-waiting">
            Choose a season to start. The checklist is worked through one
            season at a time, and collection names repeat across seasons.
          </p>
        )}

        {season && rows === null && <div className="spinner" aria-label="Loading" />}
        {rows?.length === 0 && (
          <p className="result-count">No styles for this selection.</p>
        )}
        {rows?.length > 0 && shown.length === 0 && (
          <p className="result-count">
            No style matches “{query}”{hideDone && ' among the unfinished ones'}.
          </p>
        )}

        {rows?.length > 0 && (
          <section className="card chk-card">
            <div className="chk-scroll">
              <table className="chk-grid">
                <thead>
                  <tr>
                    <th className="chk-style">
                      <div className="chk-search">
                        <span>Style</span>
                        <input
                          className="input chk-search-input"
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search name or code"
                          aria-label="Filter styles by name or code" />
                      </div>
                    </th>
                    {steps.map((s) => (
                      <th key={s.code}
                        className={`chk-step${s.auto ? ' is-auto' : ''}`}
                        title={s.auto ? `${s.label} — ${s.rule}` : s.label}>
                        {s.code}
                        {s.auto && <span className="chk-auto-mark" aria-hidden="true">auto</span>}
                      </th>
                    ))}
                    <th className="chk-count">Done</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className={complete(r) ? 'is-complete' : undefined}>
                      <th scope="row" className="chk-style">
                        <Link to={`/edit/${r.id}`}>{r.name}</Link>
                        <span className="chk-code">{r.style_code}</span>
                      </th>
                      {steps.map((s) => {
                        const on = done(r, s.code);
                        const mark = r.steps?.[s.code];
                        const title = s.auto
                          ? `${s.label} — ${s.rule}`
                          : (on && mark?.by ? `${s.label} — ${mark.by}` : s.label);
                        return (
                          <td key={s.code} className="chk-cell">
                            <button
                              type="button"
                              className={`chk-box${on ? ' on' : ''}${s.auto ? ' is-auto' : ''}`}
                              aria-pressed={on}
                              aria-disabled={s.auto || undefined}
                              aria-label={`${s.label} — ${r.name}`}
                              title={title}
                              onClick={() => toggle(r, s.code, s.auto)}
                            >
                              {on && <Check size={13} strokeWidth={3} />}
                            </button>
                          </td>
                        );
                      })}
                      <td className="chk-count">{doneCount(r)}/{steps.length}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {/* Read across: the lowest number is what the season is
                        waiting on. */}
                    <th scope="row" className="chk-style">
                      Styles with this done
                    </th>
                    {steps.map((s) => (
                      <td key={s.code} className="chk-total">{perStep[s.code] ?? 0}</td>
                    ))}
                    <td className="chk-count">of {total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
