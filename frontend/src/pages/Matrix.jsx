import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CirclePlus, ClipboardList, TextSearch, ListChecks, Printer, RotateCcw, Plus,
} from 'lucide-react';
import { Field, useToast } from '../components/ui.jsx';
import { api } from '../api.js';
// The same card the printed sheet draws, so what is arranged here is
// what comes out of the printer.
import SheetCard from '../sections/SheetCard.jsx';

/**
 * Matrix Master, as the team sets it up.
 *
 * Two jobs on one page, because they are the same sitting: filling in what
 * each garment is, and arranging the order the boss will see them in. Both
 * are worked across a whole collection at once, which is why neither belongs
 * on the per-style editor.
 *
 * The order is saved on the style, not in this browser — it is a decision the
 * team makes together, and the printed sheet reads the same column.
 */
export default function Matrix() {
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const [fields, setFields] = useState([]);
  const [steps, setSteps] = useState([]);
  const [yarnCodes, setYarnCodes] = useState([]);
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState('');
  const [collection, setCollection] = useState('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('grid');
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api.matrixFields().then(setFields).catch(() => setFields([])); }, []);
  useEffect(() => { api.checklistSteps().then(setSteps).catch(() => setSteps([])); }, []);
  useEffect(() => { api.yarnCodes().then(setYarnCodes).catch(() => setYarnCodes([])); }, []);

  // A season is required. Without one this would read every style of every
  // season into one screen, and "COTTON" would appear five times over —
  // collections belong to a season, so the page has no meaning until one is
  // picked.
  const load = () => {
    if (!season) { setRows(null); return; }
    setRows(null);
    api.matrix({ season, collection }).then(setRows).catch(() => setRows([]));
  };
  useEffect(load, [season, collection]);

  // Only this season's blocks. A collection carried over from the previous
  // season would silently match nothing, so it is dropped when the season
  // changes rather than left showing a name that no longer applies.
  const collections = meta?.collections_by_season?.[season] || [];
  useEffect(() => {
    if (collection && !collections.includes(collection)) setCollection('');
  }, [season, meta]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter(
      (r) => `${r.name} ${r.style_code || ''}`.toLowerCase().includes(q));
  }, [rows, query]);

  // Collections keep server order; only the cards inside one are arrangeable,
  // because which collection a style belongs to is data, not layout.
  const groups = useMemo(() => {
    const out = [];
    for (const r of shown) {
      const name = r.collection || 'No collection';
      let g = out.find((x) => x.name === name);
      if (!g) { g = { name, items: [] }; out.push(g); }
      g.items.push(r);
    }
    return out;
  }, [shown]);

  // Saved on blur rather than per keystroke: a cell is a thought, not a
  // stream, and a request per character would race itself.
  const save = async (row, key, value) => {
    const before = row[key] ?? '';
    if (String(value) === String(before)) return;
    setRows((prev) => prev.map(
      (r) => (r.id === row.id ? { ...r, [key]: value === '' ? null : value } : r)));
    try {
      await api.updateMatrix(row.id, { [key]: value });
    } catch (err) {
      setRows((prev) => prev.map(
        (r) => (r.id === row.id ? { ...r, [key]: before || null } : r)));
      toast?.(err.message || 'Could not save that', 'error');
    }
  };

  const move = async (collectionName, fromId, toId) => {
    if (fromId === toId) return;
    const group = groups.find((g) => g.name === collectionName);
    if (!group) return;
    const ids = group.items.map((r) => r.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);

    // Shown straight away, then confirmed. The whole block is sent, so the
    // server never has to work out what the screen meant by "third".
    const byId = new Map(group.items.map((r) => [r.id, r]));
    const reordered = ids.map((id) => byId.get(id));
    setRows((prev) => {
      const others = prev.filter((r) => (r.collection || 'No collection') !== collectionName);
      return [...others, ...reordered].sort(
        (a, b) => groups.findIndex((g) => g.name === (a.collection || 'No collection'))
                - groups.findIndex((g) => g.name === (b.collection || 'No collection')));
    });
    try {
      await api.setMatrixOrder(ids);
    } catch (err) {
      toast?.(err.message || 'Could not save the order', 'error');
      load();
    }
  };

  // Which collection block is having a style added to it, if any.
  const [adding, setAdding] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const addStyle = async (collectionName) => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      // status: 'active' on purpose. save_style defaults a new style to
      // 'draft', and the sheet filters drafts out — so a style added here
      // would be created and then immediately vanish from the page that
      // created it.
      await api.createStyle({
        name,
        season,
        collection: collectionName === 'No collection' ? '' : collectionName,
        status: 'active',
      });
      setNewName('');
      setAdding(null);
      load();          // it sorts to the end of its block, where it was added
    } catch (err) {
      toast?.(err.message || 'Could not add that style', 'error');
    } finally {
      setCreating(false);
    }
  };

  const resetOrder = async (group) => {
    try {
      await api.setMatrixOrder(group.items.map((r) => r.id), true);
      load();
    } catch (err) {
      toast?.(err.message || 'Could not reset the order', 'error');
    }
  };

  const printHref = `/print?${new URLSearchParams(
    Object.entries({ season, collection }).filter(([, v]) => v))}`;

  return (
    <>
      <header className="band">
        <div className="band-row">
          <Link to="/" className="logo">IM Master</Link>
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
          <Link to="/browse" className="band-link"><TextSearch size={18} /> Browse</Link>
          <Link to="/checklist" className="band-link"><ListChecks size={18} /> Checklist</Link>
          <Link to="/report" className="band-link"><ClipboardList size={18} /> Report</Link>
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          <h2 className="card-title">Matrix Master</h2>
          <p className="card-sub">
            What each garment is, and the order the sheet shows them in. Both
            save as you go, and both are what gets printed.
          </p>

          <div className="chk-filters">
            <Field label="Season" hint="Required">
              <select className="input" value={season} required
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
            <Field label="Style" hint="Name or code">
              <input className="input" type="search" value={query}
                placeholder="Search" onChange={(e) => setQuery(e.target.value)} />
            </Field>
            {season && (
              <Link className="btn-chip" to={printHref}>
                <Printer size={15} /> Print this
              </Link>
            )}
          </div>

          {season && (
          <div className="rep-tabs" role="tablist" style={{ marginTop: 18 }}>
            <button type="button" role="tab" aria-selected={tab === 'grid'}
              className={`card-title tab${tab === 'grid' ? ' on' : ''}`}
              onClick={() => setTab('grid')}>Attributes</button>
            <button type="button" role="tab" aria-selected={tab === 'layout'}
              className={`card-title tab${tab === 'layout' ? ' on' : ''}`}
              onClick={() => setTab('layout')}>Layout</button>
          </div>
          )}
        </section>

        {!season && (
          <p className="result-count mx-waiting">
            Choose a season to start. Collections belong to a season, so the
            sheet is built one season at a time.
          </p>
        )}

        {season && rows === null && <div className="spinner" aria-label="Loading" />}
        {rows?.length === 0 && (
          <p className="result-count">No styles for this selection.</p>
        )}
        {rows?.length > 0 && shown.length === 0 && (
          <p className="result-count">No style matches “{query}”.</p>
        )}

        {tab === 'grid' && shown.length > 0 && (
          <section className="card chk-card">
            <div className="chk-scroll">
              <table className="chk-grid mx-grid">
                <thead>
                  <tr>
                    <th className="chk-style">Style</th>
                    <th className="mx-read">Weight</th>
                    {fields.map((f) => <th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="chk-style">
                        <Link to={`/edit/${r.id}`}>{r.name}</Link>
                        <span className="chk-code">{r.style_code}</span>
                      </th>
                      {/* Weight is graded across four sizes from the S/M
                          figure, so it is edited where that grading lives. */}
                      <td className="mx-read" title="Edited on the style, where the sizes are graded">
                        {r.weight_sm == null ? '' : `${Number(r.weight_sm).toFixed(3)} kg`}
                      </td>
                      {fields.map((f) => (
                        <td key={f.key}>
                          <input
                            className="mx-cell"
                            defaultValue={r[f.key] ?? ''}
                            inputMode={f.numeric ? 'numeric' : undefined}
                            aria-label={`${f.label} — ${r.name}`}
                            onBlur={(e) => save(r, f.key, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* The sheet itself, editable. The cards are the ones that print,
            so the arrangement and the attributes are judged in the shape they
            will be read in rather than in a table that looks nothing like it. */}
        {tab === 'layout' && groups.map((g) => (
          <section className="card mx-sheet" key={g.name}>
            <div className="mx-layout-head">
              <h3 className="card-title">{g.name}</h3>
              <span className="result-count">{g.items.length} styles</span>
              <button type="button" className="btn-chip ghost"
                onClick={() => resetOrder(g)}
                title="Back to alphabetical order">
                <RotateCcw size={15} /> Reset order
              </button>
            </div>
            <div className="sheet-grid">
              {g.items.map((r) => (
                <SheetCard
                  key={r.id}
                  style={r}
                  view="matrix"
                  steps={steps}
                  options={{ yarn_codes: yarnCodes }}
                  onEdit={(style, key, value) => save(style, key, value)}
                  drag={{
                    isDragging: dragging === r.id,
                    isOver: over === r.id && dragging && dragging !== r.id,
                    title: `Drag to move ${r.name} within ${g.name}`,
                    handlers: {
                      draggable: true,
                      onDragStart: (e) => {
                        setDragging(r.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(r.id));
                      },
                      onDragEnd: () => { setDragging(null); setOver(null); },
                      onDragOver: (e) => {
                        if (!dragging) return;
                        e.preventDefault();
                        if (over !== r.id) setOver(r.id);
                      },
                      onDragLeave: () => { if (over === r.id) setOver(null); },
                      onDrop: (e) => {
                        e.preventDefault();
                        move(g.name, dragging, r.id);
                        setDragging(null); setOver(null);
                      },
                    },
                  }}
                />
              ))}

              {/* An empty slot at the end of the block. A style added here
                  belongs to this collection and this season by virtue of
                  where it was added, so neither has to be asked for. */}
              <div className="sheet-card mx-add">
                {adding === g.name ? (
                  <form className="mx-add-form"
                    onSubmit={(e) => { e.preventDefault(); addStyle(g.name); }}>
                    <input
                      className="mx-add-input"
                      autoFocus
                      value={newName}
                      placeholder="Style name"
                      aria-label={`New style in ${g.name}`}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { setAdding(null); setNewName(''); }
                      }}
                    />
                    <div className="mx-add-actions">
                      <button type="submit" className="btn-chip"
                        disabled={!newName.trim() || creating}>
                        {creating ? 'Adding…' : 'Add'}
                      </button>
                      <button type="button" className="btn-chip ghost"
                        onClick={() => { setAdding(null); setNewName(''); }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="mx-add-open"
                    onClick={() => { setAdding(g.name); setNewName(''); }}>
                    <Plus size={26} strokeWidth={1.6} />
                    <span>Add a style<br />to {g.name}</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        ))}

      </main>
    </>
  );
}
