import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CirclePlus, ClipboardList, TextSearch, ListChecks, Printer, RotateCcw, Plus, Trash2, Check, X, Palette, SwatchBook, Filter } from 'lucide-react';
import { Field, useToast } from '../components/ui.jsx';
import { api } from '../api.js';
import { commaDecimal, pointDecimal, roundFixed } from '../format.js';
// The same card the printed sheet draws, so what is arranged here is
// what comes out of the printer.
import SheetCard, { numberCards, mainRowCount } from '../sections/SheetCard.jsx';
import AddStyle from '../sections/AddStyle.jsx';
import ImportStyle from '../sections/ImportStyle.jsx';
import PriceCard from '../sections/PriceCard.jsx';
import Wordmark from '../components/Wordmark.jsx';
import TbdTray from '../sections/TbdTray.jsx';
import LegendKey from '../sections/LegendKey.jsx';
import ColumnFilter from '../components/ColumnFilter.jsx';

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
/**
 * A cell's value on the Attributes grid, as the text the cell SHOWS.
 *
 * Not the column underneath it. Weight is the reason: stored as 0.2435 and
 * shown as "0,244", a filter built on the stored number would offer a list
 * of values that appear nowhere on the screen being filtered.
 */
export const cellText = (r, key) => {
  if (key === 'name') return r.name || '';
  if (key === 'weight_sm') return commaDecimal(roundFixed(r.weight_sm, 3));
  return String(r[key] ?? '');
};

/**
 * Order two cells, for the column-header sort.
 *
 * `numeric`, so "3GG" sorts before "12GG" rather than after it — these
 * columns are full of numbers written inside words.
 *
 * Blanks go last BOTH ways, as a spreadsheet does: an empty cell is the
 * absence of an answer, not the smallest one, so it belongs at the end
 * whichever direction the answers run in. That is why the direction is
 * applied inside the comparator rather than by negating its result —
 * negating it sent every blank to the TOP of a Z-A sort, which is how this
 * was first written and what frontend/test/sheet.test.mjs now holds shut.
 */
export const compare = (a, b, dir = 'asc') => {
  if (a === b) return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'desc' ? -cmp : cmp;
};

/**
 * One style's row on the Attributes grid, memoised.
 *
 * 313 rows x (fields + 2) cells is thousands of inputs; before this, every
 * search keystroke and every delete-gate toggle re-rendered all of them.
 * Every prop is primitive or identity-stable (the row object is replaced
 * only when patched; onSave/onDelete are the page's stable proxies;
 * `fields` is fetched-once state), so the shallow compare holds and a
 * keystroke re-renders nothing here at all.
 */
const AttrRow = memo(function AttrRow({ r, fields, confirming, onSave,
                                        onDelete, onAskDelete, onKeepIt }) {
  return (
    <tr>
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
            onSave(r, 'weight_sm', pointDecimal(e.target.value));
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
            onBlur={(e) => onSave(r, f.key, e.target.value)}
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
        {confirming ? (
          <span className="mx-del-gate">
            <button type="button" className="sheet-colour-yes"
              title={`Remove ${r.name} and everything filed under it`}
              aria-label={`Confirm removing ${r.name}`}
              onClick={() => onDelete(r)}>
              <Check size={12} strokeWidth={3} />
            </button>
            <button type="button" className="sheet-colour-no"
              title="Keep it"
              aria-label={`Keep ${r.name}`}
              onClick={() => onKeepIt(null)}>
              <X size={12} strokeWidth={3} />
            </button>
          </span>
        ) : (
          <button type="button" className="mx-del"
            title={`Remove ${r.name}`}
            aria-label={`Remove ${r.name}`}
            onClick={() => onAskDelete(r.id)}>
            <Trash2 size={15} />
          </button>
        )}
      </td>
    </tr>
  );
});

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
  const [colorwayTags, setColorwayTags] = useState([]);
  // The collection an import is being made into, or null. Held by name
  // rather than as a boolean: the dialog has to know which block it was
  // opened from, because that is the collection the copy lands in.
  const [importInto, setImportInto] = useState(null);
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState(params.get('season') || '');
  const [collection, setCollection] = useState(params.get('collection') || '');
  const [query, setQuery] = useState('');
  // The Attributes grid's column filters, the spreadsheet's own kind.
  //   colFilters  { [column key]: string[] } — the values kept. A key that
  //               is absent is a column with no filter, which is not the
  //               same as one keeping every value it can see today: a style
  //               added tomorrow has to appear without anyone clearing
  //               anything.
  //   colSort     { key, dir } or null. One column at a time, like the
  //               spreadsheet — two sorts at once is a thing people ask for
  //               and then cannot read.
  // Both are the grid's alone. The Layout tab shows the arrangement the team
  // saved, and a sort applied over here must not silently reorder it.
  const [colFilters, setColFilters] = useState({});
  const [colSort, setColSort] = useState(null);
  const [tab, setTab] = useState(params.get('tab') === 'layout' ? 'layout' : 'grid');
  // Which of the two sheets the page is showing. The season and collection
  // pickers are shared, so this is a mode rather than another tab —
  // Attributes and Layout are two views of the Matrix Master, and the
  // Pricing Matrix is not a third view of it.
  const [sheet, setSheet] = useState(
    params.get('sheet') === 'pricing' ? 'pricing' : 'master');
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  useEffect(() => {
    // Not swallowed: with meta missing the Season select renders only
    // "Choose a season…" with zero options and the page is a dead end that
    // looks like an empty database. Say what actually happened.
    api.meta().then(setMeta)
      .catch((e) => toast?.(e.message || 'Could not load the season lists — reload the page', 'error'));
  }, []); // eslint-disable-line
  useEffect(() => { api.matrixFields().then(setFields).catch(() => setFields([])); }, []);
  useEffect(() => { api.checklistSteps().then(setSteps).catch(() => setSteps([])); }, []);
  useEffect(() => { api.yarnCodes().then(setYarnCodes).catch(() => setYarnCodes([])); }, []);
  useEffect(() => {
    api.colorwayTags().then(setColorwayTags).catch(() => setColorwayTags([]));
  }, []);

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
                                ['tab', tab === 'layout' ? 'layout' : ''],
                                ['sheet', sheet === 'pricing' ? 'pricing' : '']]) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [season, collection, tab, sheet]);

  // Which load is the current one. A slow response for the season you just
  // left must not paint over the one you are looking at — out-of-order
  // responses are routine when flicking between seasons on a slow link.
  const loadSeq = useRef(0);

  const load = (quiet = false) => {
    const seq = ++loadSeq.current;
    if (!season) { setRows(null); return; }
    // Blanking unmounts every card. The page then collapses to the height of
    // a spinner, the browser clamps the scroll to the new maximum, and when
    // the rows come back you are at the top — so adding a style to a long
    // sheet threw you back to the start of it.
    //
    // Only a change of season or collection blanks, because that genuinely is
    // different content and the top is where you want to be. Everything else
    // refreshes in place.
    if (!quiet) setRows(null);
    // include_parked: this is the only screen with somewhere to show them.
    api.matrix({ season, collection, include_parked: true })
      .then((r) => { if (seq === loadSeq.current) setRows(r); })
      .catch((e) => {
        if (seq !== loadSeq.current) return;
        setRows([]);
        // An empty sheet and a failed fetch are different facts; the old
        // catch showed the first for the second.
        toast?.(e.message || 'Could not load the sheet', 'error');
      });
  };

  // Refetch without taking the page away. The scroll position is kept by
  // simply never removing what holds it up.
  const refresh = () => load(true);

  useEffect(() => { load(); }, [season, collection]); // eslint-disable-line

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

  const matches = (r, q) => `${r.name} ${r.style_code || ''}`.toLowerCase().includes(q);

  // The grid is the running order, so a parked style is not in it. It is in
  // the tray instead, until someone drops it onto a card.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const placed = (rows || []).filter((r) => !r.matrix_parked);
    return q ? placed.filter((r) => matches(r, q)) : placed;
  }, [rows, query]);

  const parked = useMemo(() => {
    const q = query.trim().toLowerCase();
    const waiting = (rows || []).filter((r) => r.matrix_parked);
    return q ? waiting.filter((r) => matches(r, q)) : waiting;
  }, [rows, query]);

  const columns = useMemo(
    () => [
      { key: 'name', label: 'Style' },
      { key: 'weight_sm', label: 'Weight S/M (kg)' },
      ...fields.map((f) => ({ key: f.key, label: f.label })),
    ],
    [fields],
  );

  const byText = (a, b) => compare(a, b);

  const passes = (r, except = null) => Object.entries(colFilters).every(
    ([key, kept]) => key === except || !kept || kept.includes(cellText(r, key)));

  const gridRows = useMemo(() => {
    const out = shown.filter((r) => passes(r));
    if (!colSort) return out;
    // A copy: `shown` is memoised and feeds the Layout tab, which must keep
    // the saved arrangement whatever this grid is sorted by.
    return [...out].sort(
      (a, b) => compare(cellText(a, colSort.key), cellText(b, colSort.key), colSort.dir));
  }, [shown, colFilters, colSort]);

  // What each column offers to tick. Counted over the rows the OTHER columns
  // allow, the way a spreadsheet does, so narrowing one column narrows the
  // choices in the next — plus whatever this column already keeps, or a
  // value could be ticked off and then be impossible to tick back on.
  const colOptions = useMemo(() => {
    const out = {};
    for (const c of columns) {
      const seen = new Set(colFilters[c.key] || []);
      for (const r of shown) if (passes(r, c.key)) seen.add(cellText(r, c.key));
      out[c.key] = [...seen].sort(byText);
    }
    return out;
  }, [shown, colFilters, columns]);

  const filterCount = Object.values(colFilters).filter(Boolean).length;
  const clearColumns = () => { setColFilters({}); setColSort(null); };

  const setColumnFilter = (key, kept) => setColFilters((was) => {
    const next = { ...was };
    // Deleted rather than set to null, so `filterCount` and `passes` both
    // read "no filter" off the same fact.
    if (kept === null) delete next[key]; else next[key] = kept;
    return next;
  });

  const headFilter = (c) => (
    <ColumnFilter
      label={c.label}
      values={colOptions[c.key] || []}
      selected={colFilters[c.key] ?? null}
      onChange={(kept) => setColumnFilter(c.key, kept)}
      sort={colSort?.key === c.key ? colSort.dir : null}
      onSort={(dir) => setColSort(dir ? { key: c.key, dir } : null)}
    />
  );

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
    //
    // mainRows is the tallest main colourway band in the block. Every card is
    // given it, so the red rule under that band sits at one height all the way
    // across — a card cannot work this out alone, because it is a fact about
    // its neighbours. Measured over the whole block rather than a visual row:
    // the grid rewraps with the window, and a rule that realigned itself on
    // resize would be worse than one that is simply straight.
    return out.map((g) => ({
      ...g,
      numbers: numberCards(g.items),
      mainRows: g.items.reduce((most, r) => Math.max(most, mainRowCount(r)), 0),
    }));
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

  // The last save STARTED per row, so the echo of an earlier save cannot
  // overwrite a later one's optimistic value: the grid is built for rapid
  // tab-blur edits, and two quick cells on one row race their responses.
  const saveSeq = useRef(new Map());

  const save = async (row, key, value) => {
    const before = row[key] ?? '';
    if (String(value) === String(before)) return;
    const seq = (saveSeq.current.get(row.id) || 0) + 1;
    saveSeq.current.set(row.id, seq);
    const patch = (fields) => setRows((prev) => prev.map(
      (r) => (r.id === row.id ? { ...r, ...fields } : r)));

    patch({ [key]: asStored(value) });          // shown straight away
    try {
      // The server answers with the stored values, in their real types. That
      // is the authority — the guess above only has to be close enough to
      // avoid a flicker.
      const saved = await api.updateMatrix(row.id, { [key]: value });
      // The write itself landed either way; only the ECHO is stale when a
      // newer save on this row has started since.
      if (saved && typeof saved === 'object'
          && saveSeq.current.get(row.id) === seq) patch(saved);
      // A tag nobody had used before joins the list the moment it is saved,
      // rather than at the next page load. The server will offer it to
      // everyone else from their next load — this is only so the person who
      // invented it sees it on the card they are about to fill in next.
      if (key === 'colorway_tag') {
        const added = saved?.colorway_tag;
        if (added) {
          setColorwayTags((prev) => (prev.includes(added) ? prev : [...prev, added]));
        }
      }
    } catch (err) {
      // Reverting is also an echo: skip it if a newer save owns the row.
      if (saveSeq.current.get(row.id) === seq) {
        patch({ [key]: before === '' ? null : before });
      }
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
    if (to < 0) return;
    if (from < 0) {
      // Dragged out of the tray: it has no position to move from, so it is
      // inserted rather than shuffled. setMatrixOrder clears matrix_parked
      // for everything it numbers, which is what takes it out of the tray.
      const incoming = (rows || []).find((r) => r.id === fromId);
      if (!incoming) return;
      ids.splice(to, 0, fromId);
    } else {
      ids.splice(to, 0, ids.splice(from, 1)[0]);
    }

    // Shown straight away, then confirmed. The whole block is sent, so the
    // server never has to work out what the screen meant by "third".
    // From every row, not just this block's: a style coming out of the tray
    // is not in group.items yet, and byId.get would hand back undefined.
    const byId = new Map((rows || []).map((r) => [r.id, r]));
    // matrix_parked is cleared here as well as on the server: leaving it set
    // would draw the style in the grid and in the tray at the same time.
    const reordered = ids.map((id) => ({ ...byId.get(id), matrix_parked: false }));
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
      refresh();
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
      // save_style numbers the collection so this lands last, which is
      // where the slot that created it sits. It used to be left unordered
      // and fell wherever its name happened to sort.
      refresh();
    } catch (err) {
      toast?.(err.message || 'Could not add that style', 'error');
    } finally {
      setCreating(false);
    }
  };

  // A style with no position yet. Created into the collection on screen, so
  // it knows where it belongs even though it does not know where it sits.
  const addParked = async (typed) => {
    const name = (typed || '').trim();
    if (!name || !collection || creating) return;
    setCreating(true);
    try {
      await api.createStyle({
        name,
        season,
        collection,
        status: 'active',
        matrix_parked: true,
      });
      refresh();
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

  // Moving a colourway between the bands, or within one. Shown straight away
  // and confirmed after — the row is rebuilt from what was dropped, so the
  // card does not blink while the server agrees.
  const arrangeColours = async (style, items) => {
    const before = {
      colorways: style.colorways,
      colorway_zones: style.colorway_zones,
    };
    patchRow(style.id, (r) => ({
      ...r,
      colorways: items.map((x) => x.color),
      colorway_zones: Object.fromEntries(items.map((x) => [x.color, x.zone])),
    }));
    try {
      await api.arrangeColorways(style.id, items);
    } catch (err) {
      patchRow(style.id, (r) => ({ ...r, ...before }));
      toast?.(err.message || 'Could not move that colourway', 'error');
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
  // Rewrite one row in place rather than refetching the season at all. Even a
  // quiet refresh replaces every row object and re-renders forty cards that
  // did not change; this touches the one that did.
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
      refresh();          // the typed name is wrong; take the row back as stored
    }
  };

  // The name comes from the field on the card now, not a dialog.
  const addColour = async (style, name, zone = 'main') => {
    try {
      const saved = await api.addColorway(style.id, name, zone);
      const added = saved?.color || name.toUpperCase();
      // Appended, which is where the server puts it: sort_order is max + 1.
      // The band has to be recorded here too, or the new colour renders in
      // the middle band until the next load whichever button was pressed.
      patchRow(style.id, (r) => ({
        ...r,
        colorways: [...r.colorways, added],
        colorway_zones: { ...(r.colorway_zones || {}), [added]: saved?.zone || zone },
      }));
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
      refresh();
    }
  };

  const resetOrder = async (group) => {
    try {
      await api.setMatrixOrder(group.items.map((r) => r.id), true);
      refresh();
    } catch (err) {
      toast?.(err.message || 'Could not reset the order', 'error');
    }
  };

  /**
   * Stable proxies for everything a memoised card calls.
   *
   * The real handlers above stay plain functions, recreated every render,
   * which is what keeps their closures over season / collection / groups /
   * refresh permanently fresh — the audit's verifier caught that wrapping
   * them in useCallback would freeze refresh() over the first render's
   * season. The cards instead receive these proxies: identity-stable for
   * the life of the page, delegating to whatever the CURRENT render's
   * handler is. memo() gets stability, the handlers keep their closures,
   * and there is no dependency list to get wrong.
   */
  const live = useRef({});
  live.current = {
    save, markColour, highlightColour, arrangeColours, renameColour,
    addColour, deleteColour, addPhoto, move, deleteStyle, navigate,
    dragging, over,
  };
  const proxyRef = useRef(null);
  if (!proxyRef.current) {
    const h = live;
    proxyRef.current = {
      onEdit: (...a) => h.current.save(...a),
      onChannel: (s, v) => h.current.save(s, 'whs_channel', v),
      onMarkColour: (...a) => h.current.markColour(...a),
      onHighlightColour: (...a) => h.current.highlightColour(...a),
      onArrange: (...a) => h.current.arrangeColours(...a),
      onRenameColour: (...a) => h.current.renameColour(...a),
      onAddColour: (...a) => h.current.addColour(...a),
      onDeleteColour: (...a) => h.current.deleteColour(...a),
      onPhoto: (...a) => h.current.addPhoto(...a),
      onOpen: (s) => h.current.navigate(`/edit/${s.id}`),
      onDelete: (...a) => h.current.deleteStyle(...a),
    };
  }
  const proxies = proxyRef.current;

  // One datalist payload for every card, rebuilt only when a list changes.
  const cardOptions = useMemo(
    () => ({ yarn_codes: yarnCodes, colorway_tags: colorwayTags }),
    [yarnCodes, colorwayTags]);

  /**
   * One drag-prop object per card, cached by row id and rebuilt only when
   * the row's name or collection changes (the title embeds both). The
   * handlers read the LIVE drag state through the ref, so a cached handler
   * can never act on a stale `dragging`. The isDragging/isOver flags travel
   * as separate primitive props, so a drag re-renders two cards, not 313.
   */
  const dragCache = useRef(new Map());
  const dragFor = (groupName, r) => {
    const title = `Drag to move ${r.name} within ${groupName}`;
    const hit = dragCache.current.get(r.id);
    if (hit && hit.title === title) return hit.obj;
    const id = r.id;
    const obj = {
      title,
      handlers: {
        draggable: true,
        onDragStart: (e) => {
          setDragging(id);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(id));
        },
        onDragEnd: () => { setDragging(null); setOver(null); },
        onDragOver: (e) => {
          if (!live.current.dragging) return;
          e.preventDefault();
          if (live.current.over !== id) setOver(id);
        },
        onDragLeave: () => { if (live.current.over === id) setOver(null); },
        onDrop: (e) => {
          e.preventDefault();
          const group = dragCache.current.get(id)?.group;
          live.current.move(group, live.current.dragging, id);
          setDragging(null); setOver(null);
        },
      },
    };
    dragCache.current.set(id, { title, obj, group: groupName });
    return obj;
  };


  const printHref = `/print?${new URLSearchParams(
    Object.entries({ season, collection }).filter(([, v]) => v))}`;

  return (
    <>
      <header className="band">
        <div className="band-row">
          <Wordmark />
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
          {/* Hidden while the rebuild is shown one screen at a time, same as
              the home page's cards (Home.jsx, 26 Nov 2026). Matrix is one of
              the two screens reachable from the front door, so leaving these
              here would have put the whole app back in front of her one
              click in. The routes still work — type /colors and it opens.
          <Link to="/browse" className="band-link"><TextSearch size={18} /> Browse</Link>
          <Link to="/checklist" className="band-link"><ListChecks size={18} /> Checklist</Link>
          <Link to="/report" className="band-link"><ClipboardList size={18} /> Report</Link>
          <Link to="/colors" className="band-link"><SwatchBook size={18} /> Color Table</Link>
          <Link to="/design" className="band-link"><Palette size={18} /> Design</Link> */}
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          {/* Two sheets over one season and collection. A switch rather
              than two pages, because picking the season again to see what the
              same styles cost is the kind of step that stops people looking. */}
          <div className="mx-sheets" role="tablist" aria-label="Which sheet">
            <button type="button" role="tab" aria-selected={sheet === 'master'}
              className={`card-title tab${sheet === 'master' ? ' on' : ''}`}
              onClick={() => setSheet('master')}>Matrix Master</button>
            {/* Hidden with the rest (Home.jsx, 26 Nov 2026). Only the tab is
                gone: `sheet` still reads the URL, so /matrix?sheet=pricing
                opens the pricing sheet exactly as before.
            <button type="button" role="tab" aria-selected={sheet === 'pricing'}
              className={`card-title tab${sheet === 'pricing' ? ' on' : ''}`}
              onClick={() => setSheet('pricing')}>Pricing Matrix</button> */}
          </div>
          {/* <p className="card-sub">
            {sheet === 'pricing'
              ? `What each garment costs, in the order the sheet shows them in.
                 Saves as you go, and is what gets printed.`
              : `What each garment is, and the order the sheet shows them in. Both
                 save as you go, and both are what gets printed.`}
          </p> */}

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

          {season && sheet === 'master' && (
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
        {sheet === 'master' && tab === 'grid' && shown.length > 0 && (
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



        {sheet === 'master' && tab === 'grid' && shown.length > 0 && (
          <section className="card chk-card">
            {filterCount > 0 && (
              <div className="colf-applied">
                <Filter size={13} aria-hidden="true" />
                <span>
                  {gridRows.length} of {shown.length} styles
                  {' · '}{filterCount} column{filterCount === 1 ? '' : 's'} filtered
                </span>
                <button type="button" className="btn-chip ghost" onClick={clearColumns}>
                  <X size={14} /> Clear filters
                </button>
              </div>
            )}
            {gridRows.length === 0 && (
              <p className="result-count colf-empty">
                No style gets past the column filters.
              </p>
            )}
            <div className="chk-scroll">
              <table className="chk-grid mx-grid">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} className={c.key === 'name' ? 'chk-style' : undefined}>
                        <span className="colf-head">
                          <span>{c.label}</span>
                          {headFilter(c)}
                        </span>
                      </th>
                    ))}
                    <th className="mx-del-col" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map((r) => (
                    <AttrRow
                      key={r.id}
                      r={r}
                      fields={fields}
                      confirming={confirmDelete === r.id}
                      onSave={proxies.onEdit}
                      onDelete={proxies.onDelete}
                      onAskDelete={setConfirmDelete}
                      onKeepIt={setConfirmDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* The sheet itself, editable. The cards are the ones that print,
            so the arrangement and the attributes are judged in the shape they
            will be read in rather than in a table that looks nothing like it. */}
        {/* The datalists every card's inputs name. Once, here, instead of
            a copy inside each of 300+ cards — identical ids collapsed in
            the browser but the duplicate option nodes were real. */}
        {sheet === 'master' && tab === 'layout' && (
          Object.entries(cardOptions).map(([name, values]) => (
            <datalist key={name} id={`${name}-list`}>
              {values.map((v) => <option key={v} value={v} />)}
            </datalist>
          ))
        )}

        {sheet === 'master' && tab === 'layout' && groups.map((g) => (
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
                  options={cardOptions}
                  onEdit={proxies.onEdit}
                  onChannel={proxies.onChannel}
                  onMarkColour={proxies.onMarkColour}
                  onHighlightColour={proxies.onHighlightColour}
                  onArrange={proxies.onArrange}
                  minMainRows={g.mainRows}
                  onRenameColour={proxies.onRenameColour}
                  onAddColour={proxies.onAddColour}
                  onDeleteColour={proxies.onDeleteColour}
                  onPhoto={proxies.onPhoto}
                  onOpen={proxies.onOpen}
                  focused={focused === r.id}
                  drag={dragFor(g.name, r)}
                  isDragging={dragging === r.id}
                  isOver={!!(over === r.id && dragging && dragging !== r.id)}
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
                    {/* The other way to fill this slot. Most of a new
                        season's sheet is last season's, and typing a repeat
                        out again loses the link to the season it repeats
                        from — which is what the sales report reads. */}
                    <button type="button" className="mx-add-import"
                      onClick={() => { setAdding(null); setNewName('');
                                       setImportInto(g.name); }}>
                      Import an existing style
                    </button>
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

        {/* The Pricing Matrix. The same styles in the same order as the
            layout sheet — same blocks, same two running sequences for the
            numbers — because a price is looked up by where the garment sits
            on the sheet, and two sheets numbered differently would mean
            counting columns twice.

            Parked styles are left out, as they are on the layout sheet: a
            style with no position has no column to be priced in. */}
        {sheet === 'pricing' && groups.map((g) => (
          <section className="card mx-sheet" key={g.name}>
            <div className="mx-layout-head">
              <h3 className="card-title">{g.name}</h3>
              <span className="result-count">{g.items.length} styles</span>
            </div>
            <div className="pmx-grid">
              {g.items.map((r) => (
                <PriceCard
                  key={r.id}
                  style={r}
                  index={g.numbers[r.id]}
                  onEdit={proxies.onEdit}
                  onOpen={proxies.onOpen}
                />
              ))}
            </div>
          </section>
        ))}

        {sheet === 'pricing' && season && groups.length === 0 && (
          <section className="card card-pad">
            <p className="card-sub">
              Nothing to price here yet — no styles in {season}
              {collection ? ` · ${collection}` : ''}.
            </p>
          </section>
        )}

        {/* Only on the Layout tab, and only once a collection is chosen —
            a parked style has to know which block it belongs to, and the
            tray is for arranging, which is what that tab is for. The Legend
            rides along under it: it explains the marks on the cards, which
            is the same tab and the same moment.

            One stack, not two fixed widgets. The tray's height changes as
            styles are parked, so anything pinned under it by its own top
            would end up overlapping. */}
        {sheet === 'master' && tab === 'layout' && season && (
          <div className="float-stack">
            <TbdTray
              items={parked}
              collection={collection}
              season={season}
              busy={creating || !collection}
              onAdd={addParked}
              // Deletes for real — the tray asks first, in the tray. Routing
              // this through confirmDelete pointed it at a confirm that only
              // the Attributes table can draw.
              onDelete={deleteStyle}
              onDragStart={setDragging}
              onDragEnd={() => { setDragging(null); setOver(null); }}
            />
            {/* What goes in it is the LEGEND array in LegendKey.jsx — the
                rows are written by hand, not read from the database. */}
            <LegendKey />
          </div>
        )}

        {/* Rendered once for the page, not once per block: it is a modal, and
            one per collection would be fifty identical dialogs in the tree
            waiting for a flag that only one of them can have. */}
        {importInto && season && (
          <ImportStyle
            season={season}
            collection={importInto}
            onClose={() => setImportInto(null)}
            onImported={(made, from) => {
              setImportInto(null);
              toast?.(`${made.name} imported from ${from.season}`
                      + ` and linked as the same garment`, 'success');
              refresh();
            }}
          />
        )}

      </main>
    </>
  );
}
