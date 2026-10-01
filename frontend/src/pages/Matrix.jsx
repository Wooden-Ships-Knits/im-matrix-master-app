import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CirclePlus, ClipboardList, TextSearch, ListChecks, Printer, RotateCcw, Plus,
  Trash2, Check, X,
} from 'lucide-react';
import { Field, useToast } from '../components/ui.jsx';
import { api } from '../api.js';
import { commaDecimal, pointDecimal, roundFixed } from '../format.js';
// The same card the printed sheet draws, so what is arranged here is
// what comes out of the printer.
import SheetCard, { numberCards } from '../sections/SheetCard.jsx';
import AddStyle from '../sections/AddStyle.jsx';
import Wordmark from '../components/Wordmark.jsx';

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
  const navigate = useNavigate();
  // A link can open the page already pointed somewhere — the style editor's
  // "Show in Matrix" sends ?season=&collection=&tab=layout&style=<id>. Read
  // once, as starting values: after that the page's own controls own them.
  const [params, setParams] = useSearchParams();
  const focusId = Number(params.get('style')) || null;
  const [meta, setMeta] = useState(null);
  const [fields, setFields] = useState([]);
  const [steps, setSteps] = useState([]);
  const [yarnCodes, setYarnCodes] = useState([]);
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState(params.get('season') || '');
  const [collection, setCollection] = useState(params.get('collection') || '');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState(params.get('tab') === 'layout' ? 'layout' : 'grid');
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
  // The selection lives in the URL as well as in state, so leaving the page
  // and coming back — or reloading, or sharing the link — lands on the same
  // screen instead of the empty season picker. Replaced rather than pushed:
  // changing a filter is not a place in history to go back to.
  useEffect(() => {
    const next = new URLSearchParams(params);
    for (const [key, value] of [['season', season], ['collection', collection],
                                ['tab', tab === 'layout' ? 'layout' : '']]) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [season, collection, tab]);

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
    // Not before meta arrives: until then every collection looks unknown, and
    // one given in the link would be dropped before it could be checked.
    if (!meta) return;
    if (collection && !collections.includes(collection)) setCollection('');
  }, [season, meta]);

  // Bring the linked style into view once its card is drawn, and mark it so
  // the eye finds it among the rest. Only the first time the rows arrive.
  const [focused, setFocused] = useState(null);
  const focusDone = useRef(false);
  useEffect(() => {
    if (!focusId || focusDone.current || !rows?.length) return;
    focusDone.current = true;
    const el = document.querySelector(`[data-style-id="${focusId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocused(focusId);
  }, [rows, tab]);
  useEffect(() => {
    if (!focused) return undefined;
    const t = setTimeout(() => setFocused(null), 2500);
    return () => clearTimeout(t);
  }, [focused]);

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
    // Numbered here so it happens once per collection rather than once per
    // card, and so the S sequence is counted over the whole block.
    return out.map((g) => ({ ...g, numbers: numberCards(g.items) }));
  }, [shown]);

  // Saved on blur rather than per keystroke: a cell is a thought, not a
  // stream, and a request per character would race itself.
  // Everything travels to the server as text, including flags. Put back into
  // the row as text, "false" is a non-empty string and therefore true — which
  // is why clearing NEED NEW PHOTO saved correctly and left the banner up.
  const asStored = (v) => {
    if (v === '') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  };

  const save = async (row, key, value) => {
    const before = row[key] ?? '';
    if (String(value) === String(before)) return;
    const patch = (fields) => setRows((prev) => prev.map(
      (r) => (r.id === row.id ? { ...r, ...fields } : r)));

    patch({ [key]: asStored(value) });          // shown straight away
    try {
      // The server answers with the stored values, in their real types. That
      // is the authority — the guess above only has to be close enough to
      // avoid a flicker.
      const saved = await api.updateMatrix(row.id, { [key]: value });
      if (saved && typeof saved === 'object') patch(saved);
    } catch (err) {
      patch({ [key]: before === '' ? null : before });
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

  // The collection is passed in rather than read from state: on the Layout
  // tab it comes from the block the slot sits in, and on an empty season
  // there is no block, so it has to be typed. Naming one that does not exist
  // creates it — save_style does get_or_create on the collection.
  const addStyle = async (collectionName, typed = null) => {
    const name = (typed ?? newName).trim();
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

  // The pen colour on a colourway name. Shown straight away, then confirmed,
  // the same way an attribute cell is.
  const markColour = async (style, colour, mark) => {
    const before = style.colorway_marks?.[colour] || '';
    const apply = (value) => setRows((prev) => prev.map((r) => {
      if (r.id !== style.id) return r;
      const marks = { ...(r.colorway_marks || {}) };
      if (value) marks[colour] = value; else delete marks[colour];
      return { ...r, colorway_marks: marks };
    }));
    apply(mark);
    try {
      await api.markColorway(style.id, colour, mark);
    } catch (err) {
      apply(before);
      toast?.(err.message || 'Could not colour that name', 'error');
    }
  };

  // A photo, straight onto the card. The row is updated from what the server
  // returns rather than from a local object URL, so what is on screen is the
  // stored file — a blob that only exists in this tab would look identical
  // and vanish on reload.
  const addPhoto = async (style, file) => {
    try {
      const { image_path: path } = await api.uploadImage(style.id, file);
      setRows((prev) => prev.map(
        (r) => (r.id === style.id ? { ...r, image_path: path } : r)));
      toast?.(`Photo added to ${style.name}`);
    } catch (err) {
      toast?.(err.message || 'Could not add that photo', 'error');
    }
  };

  // The background behind a colourway name. Same shape as the pen above it,
  // against a different field.
  const highlightColour = async (style, colour, value) => {
    const before = style.colorway_highlights?.[colour] || '';
    const apply = (v) => setRows((prev) => prev.map((r) => {
      if (r.id !== style.id) return r;
      const lit = { ...(r.colorway_highlights || {}) };
      if (v) lit[colour] = v; else delete lit[colour];
      return { ...r, colorway_highlights: lit };
    }));
    apply(value);
    try {
      await api.highlightColorway(style.id, colour, value);
    } catch (err) {
      apply(before);
      toast?.(err.message || 'Could not highlight that row', 'error');
    }
  };

  // Renaming and adding change the list itself, so both take the row back
  // from the server rather than guessing — the name is the key the pen, the
  // background and the sales figures are all filed under.
  // Rewrite one row in place rather than reloading the season. load() blanks
  // the grid while it refetches, which reads as the page reloading every time
  // a name is saved — and the other forty cards did not change.
  const patchRow = (id, fn) => setRows(
    (prev) => prev.map((r) => (r.id === id ? fn(r) : r)));

  // Renaming moves a colourway's key: the pen and the background are filed
  // under the name, so they have to move with it or they are left behind
  // pointing at a colourway that no longer exists.
  const renameKey = (map, from, to) => {
    if (!map || !(from in map)) return map;
    const next = { ...map };
    next[to] = next[from];
    delete next[from];
    return next;
  };

  const renameColour = async (style, colour, name) => {
    try {
      const saved = await api.renameColorway(style.id, colour, name);
      const to = saved?.color || name;
      patchRow(style.id, (r) => ({
        ...r,
        colorways: r.colorways.map((c) => (c === colour ? to : c)),
        colorway_marks: renameKey(r.colorway_marks, colour, to),
        colorway_highlights: renameKey(r.colorway_highlights, colour, to),
      }));
    } catch (err) {
      toast?.(err.message || 'Could not rename that colourway', 'error');
      load();          // the typed name is wrong; take the row back as stored
    }
  };

  // The name comes from the field on the card now, not a dialog.
  const addColour = async (style, name) => {
    try {
      const saved = await api.addColorway(style.id, name);
      const added = saved?.color || name.toUpperCase();
      // Appended, which is where the server puts it: sort_order is max + 1.
      patchRow(style.id, (r) => ({ ...r, colorways: [...r.colorways, added] }));
    } catch (err) {
      toast?.(err.message || 'Could not add that colourway', 'error');
    }
  };

  // Removing a colourway takes its yarn lines, operation overrides and any
  // fetched sales with it, so the toast says what went rather than a bare
  // "deleted" — by then there is nothing left to look at.
  const deleteColour = async (style, colour) => {
    try {
      const gone = await api.deleteColorway(style.id, colour);
      const also = [
        gone.yarns && `${gone.yarns} yarn line${gone.yarns === 1 ? '' : 's'}`,
        gone.sales && `${gone.sales} sales row${gone.sales === 1 ? '' : 's'}`,
        gone.operations && `${gone.operations} operation${gone.operations === 1 ? '' : 's'}`,
      ].filter(Boolean);
      toast?.(`${colour} removed${also.length ? `, with ${also.join(' and ')}` : ''}`);
      patchRow(style.id, (r) => {
        const marks = { ...(r.colorway_marks || {}) };
        const lit = { ...(r.colorway_highlights || {}) };
        delete marks[colour];
        delete lit[colour];
        return {
          ...r,
          colorways: r.colorways.filter((c) => c !== colour),
          colorway_marks: marks,
          colorway_highlights: lit,
          // The quantities were fetched against that colourway and went with
          // it, so the sales table must not keep showing its row.
          sales: r.sales
            ? Object.fromEntries(
              Object.entries(r.sales).filter(([c]) => c !== colour))
            : r.sales,
        };
      });
    } catch (err) {
      toast?.(err.message || 'Could not remove that colourway', 'error');
    }
  };

  // The style whose delete is waiting to be confirmed. One at a time: the
  // confirm replaces that row's button, so two at once would be two rows
  // asking the same question.
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Adding a season. The server builds it from the code alone — season_number
  // and the code itself are generated columns, and the new season inherits
  // the previous one's rates, so a fresh season is not blank in the costing.
  const [addingSeason, setAddingSeason] = useState(false);
  const [newSeason, setNewSeason] = useState('');
  const [addingCollection, setAddingCollection] = useState(false);
  const [newCollection, setNewCollection] = useState('');

  // Same shape as adding a season, against the collection picker. Scoped to
  // the chosen season, which is why the control is only offered once there is
  // one — a collection with no season has nowhere to go.
  const addCollection = async () => {
    const name = newCollection.trim().toUpperCase();
    if (!name) {
      toast?.('Give the collection a name', 'error');
      return;
    }
    try {
      await api.addMeta('collection', name, season);
      const fresh = await api.meta();
      setMeta(fresh);
      setNewCollection('');
      setAddingCollection(false);
      setCollection(name);      // land on the collection that was just made
      toast?.(`${name} added to ${season}`);
    } catch (err) {
      toast?.(err.message || 'Could not add that collection', 'error');
    }
  };

  const addSeason = async () => {
    const code = newSeason.trim().toUpperCase();
    if (!/^[SF]\d{2}$/.test(code)) {
      toast?.('A season code is S or F and two digits, like F29', 'error');
      return;
    }
    try {
      await api.addMeta('season', code);
      const fresh = await api.meta();
      setMeta(fresh);
      setNewSeason('');
      setAddingSeason(false);
      setSeason(code);          // land on the season that was just made
      toast?.(`${code} added`);
    } catch (err) {
      toast?.(err.message || 'Could not add that season', 'error');
    }
  };

  // Deleting a style takes its colourways, sizes, sales, checklist ticks and
  // yarn lines with it — eight tables cascade off styles. The server counts
  // what went and the toast says so, because afterwards there is nothing
  // left to look at.
  const deleteStyle = async (style) => {
    setConfirmDelete(null);
    try {
      const gone = await api.deleteStyle(style.id);
      const also = Object.entries(gone?.removed || {})
        .map(([what, n]) => `${n} ${what}`);
      toast?.(`${style.name} removed`
        + (also.length ? `, with ${also.join(', ')}` : ''));
      setRows((prev) => prev.filter((r) => r.id !== style.id));
    } catch (err) {
      toast?.(err.message || 'Could not remove that style', 'error');
      load();
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
          <Wordmark />
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
              <div className="mx-season-pick">
                {addingSeason ? (
                  <>
                    <input className="input" autoFocus value={newSeason}
                      placeholder="e.g. F29" aria-label="New season code"
                      onChange={(e) => setNewSeason(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addSeason(); }
                        if (e.key === 'Escape') { setNewSeason(''); setAddingSeason(false); }
                      }} />
                    <button type="button" className="btn-chip" onClick={addSeason}>Add</button>
                    <button type="button" className="btn-chip ghost"
                      onClick={() => { setNewSeason(''); setAddingSeason(false); }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <select className="input" value={season} required
                      onChange={(e) => setSeason(e.target.value)}>
                      <option value="">Choose a season…</option>
                      {(meta?.seasons || []).map((s) => (
                        <option key={s.code} value={s.code}>{s.code}</option>
                      ))}
                    </select>
                    {/* A button beside the picker, not an entry inside it —
                        an "add" option in a select reads as a season right up
                        until someone picks it by mistake. */}
                    <button type="button" className="mx-season-add"
                      title="Add a season" aria-label="Add a season"
                      onClick={() => setAddingSeason(true)}>
                      <Plus size={15} strokeWidth={2.6} />
                    </button>
                  </>
                )}
              </div>
            </Field>
            <Field label="Collection"
              hint={season ? `${collections.length} in ${season}` : 'Pick a season first'}>
              <div className="mx-season-pick">
                {addingCollection ? (
                  <>
                    <input className="input" autoFocus value={newCollection}
                      placeholder="e.g. CHRISTMAS COTTON" aria-label="New collection name"
                      onChange={(e) => setNewCollection(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); addCollection(); }
                        if (e.key === 'Escape') { setNewCollection(''); setAddingCollection(false); }
                      }} />
                    <button type="button" className="btn-chip" onClick={addCollection}>Add</button>
                    <button type="button" className="btn-chip ghost"
                      onClick={() => { setNewCollection(''); setAddingCollection(false); }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <select className="input" value={collection} disabled={!season}
                      onChange={(e) => setCollection(e.target.value)}>
                      <option value="">
                        {season ? `All collections in ${season}` : '—'}
                      </option>
                      {collections.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {/* Hidden rather than disabled before a season is chosen:
                        there is nothing to add it to yet, and a button that
                        refuses every click is worse than no button. */}
                    {season && (
                      <button type="button" className="mx-season-add"
                        title={`Add a collection to ${season}`}
                        aria-label={`Add a collection to ${season}`}
                        onClick={() => setAddingCollection(true)}>
                        <Plus size={15} strokeWidth={2.6} />
                      </button>
                    )}
                  </>
                )}
              </div>
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
        {/* Searching narrows what is already on screen, which is a different
            job from the season and collection above: those decide what gets
            loaded at all. Hence its own bar, and only once there is something
            to search. */}
        {tab === 'grid' && shown.length > 0 && (
          <section className="card card-pad mx-empty" style={{ marginTop: 18 }}>
            <AddStyle season={season} collections={collections}
              collection={collection} busy={creating}
              onAdd={(c, n) => addStyle(c, n)} />
          </section>
        )}
        
        {season && rows?.length > 0 && (
          <section className="card card-pad mx-search">
            <Field label="Find a style" hint="Matches the name or the style code">
              <input className="input" type="search" value={query}
                placeholder="e.g. CHRISTMAS, or K57C3W207"
                onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <span className="result-count">
              {query.trim()
                ? `${shown.length} of ${rows.length} styles`
                : `${rows.length} styles`}
            </span>
            {query.trim() && (
              <button type="button" className="btn-chip ghost"
                onClick={() => setQuery('')}>Clear</button>
            )}
          </section>
        )}
        {!season && (
          <p className="result-count mx-waiting">
            Choose a season to start. Collections belong to a season, so the
            sheet is built one season at a time.
          </p>
        )}

        {season && rows === null && <div className="spinner" aria-label="Loading" />}
        {/* A season with nothing in it still needs a way in — otherwise the
            first style of a new season has nowhere to be created. */}
        {rows?.length === 0 && (
          <section className="card card-pad mx-empty">
            <p className="card-sub">
              Nothing in {collection || season} yet. Add the first style —
              naming a collection that does not exist creates it.
            </p>
            <AddStyle season={season} collections={collections}
              collection={collection} busy={creating}
              onAdd={(c, n) => addStyle(c, n)} />
          </section>
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
                    <th>Weight S/M (kg)</th>
                    {fields.map((f) => <th key={f.key}>{f.label}</th>)}
                    <th className="mx-del-col" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="chk-style">
                        <Link to={`/edit/${r.id}`}>{r.name}</Link>
                        <span className="chk-code">{r.style_code}</span>
                      </th>
                      {/* The S/M weight. The server grades the other sizes
                          from it on save, as the style editor does. */}
                      <td>
                        <input
                          className="mx-cell"
                          defaultValue={commaDecimal(roundFixed(r.weight_sm, 3))}
                          inputMode="decimal"
                          aria-label={`Weight S/M (kg) — ${r.name}`}
                          title="S/M, in kg. The other sizes are graded from it."
                          onBlur={(e) => {
                            // Shown rounded, so an untouched cell is not
                            // saved back as its own rounding.
                            if (e.target.value === commaDecimal(roundFixed(r.weight_sm, 3))) return;
                            save(r, 'weight_sm', pointDecimal(e.target.value));
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        />
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

                      {/* Removing a style takes its colourways, sizes, sales
                          and checklist ticks with it, so it asks first. The
                          confirm replaces the button on the row that asked,
                          rather than a dialog that has to name the style
                          again. */}
                      <td className="mx-del-col">
                        {confirmDelete === r.id ? (
                          <span className="mx-del-gate">
                            <button type="button" className="sheet-colour-yes"
                              title={`Remove ${r.name} and everything filed under it`}
                              aria-label={`Confirm removing ${r.name}`}
                              onClick={() => deleteStyle(r)}>
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <button type="button" className="sheet-colour-no"
                              title="Keep it"
                              aria-label={`Keep ${r.name}`}
                              onClick={() => setConfirmDelete(null)}>
                              <X size={12} strokeWidth={3} />
                            </button>
                          </span>
                        ) : (
                          <button type="button" className="mx-del"
                            title={`Remove ${r.name}`}
                            aria-label={`Remove ${r.name}`}
                            onClick={() => setConfirmDelete(r.id)}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
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
                  index={g.numbers[r.id]}
                  view="matrix"
                  steps={steps}
                  options={{ yarn_codes: yarnCodes }}
                  onEdit={(style, key, value) => save(style, key, value)}
                  onChannel={(style, value) => save(style, 'whs_channel', value)}
                  onMarkColour={markColour}
                  onHighlightColour={highlightColour}
                  onRenameColour={renameColour}
                  onAddColour={addColour}
                  onDeleteColour={deleteColour}
                  onPhoto={addPhoto}
                  onOpen={(style) => navigate(`/edit/${style.id}`)}
                  focused={focused === r.id}
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
