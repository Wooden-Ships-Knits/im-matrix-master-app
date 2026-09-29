import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, CirclePlus, Download, Printer, Send, Check, Undo2, Trash2,Ruler, ListChecks } from 'lucide-react';
import { api } from '../api.js';
import {
  Field, TextInput, Combo, DateRange, ConfirmDialog, useToast,
} from '../components/ui.jsx';
import MatrixSalesHistory from '../sections/MatrixSalesHistory.jsx';

const STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
const KINDS = ['style list', 'pricing', 'costing', 'packaging', 'salesforce upload'];

const when = (t) => (t ? new Date(t).toLocaleDateString(undefined,
  { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const day = (t, withYear = true) => (t
  ? new Date(`${t}T00:00:00`).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
  : '');

/** "1 Aug – 31 Aug 2026", or what is known of it. */
const period = (f = {}) => {
  const { start_date: from, end_date: to } = f;
  if (!from && !to) return '';
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${day(from, !sameYear)} \u2013 ${day(to)}`;
  }
  return from ? `from ${day(from)}` : `up to ${day(to)}`;
};

/**
 * Reports an operator prepares and someone signs off.
 *
 * A report names a slice of the data — a season's pricing, a costing check —
 * and carries it through draft, submitted, and approved or sent back. It holds
 * the filters rather than a copy of the rows, so opening it shows the data as
 * it is now; what is being approved is the view, not a frozen sheet.
 */
export default function Report() {
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [tab, setTab] = useState('matrix');
  const [fetching, setFetching] = useState(false);
  const [form, setForm] = useState({
    title: '', kind: 'style list', season: '', collection: ''
    , prepared_by: '', note: '',
  });
  // Sales history asks for different things: one collection, and a period per
  // channel, because the two are not always pulled over the same dates.
  // One period, not one per channel: the Sales Report service takes a single
  // start_date/end_date and returns both sides of it. Salesforce becomes the
  // WHS 000 column, Shopify the SY column. Keys match that service's own
  // parameters so nothing has to be translated later.
  const [sales, setSales] = useState({
    collection: '', season: '', range: { from: '', to: '' },
    threshold: '', whsThreshold: '',
  });
  // Seeded once from the last sales history report, so the dates come back
  // the way they were left. Stored on the report rather than in this browser,
  // so it follows whoever runs it next.
  const seeded = useRef(false);
  const showToast = useToast();

  const load = (status = filter) =>
    api.listReports(status || undefined).then((r) => {
      setRows(r);
      if (!seeded.current) {
        const last = r.find((x) => x.kind === 'sales history');
        if (last?.filters) {
          const f = last.filters;
          setSales({
            collection: f.collection || '',
            season: f.season || '',
            range: { from: f.start_date || '', to: f.end_date || '' },
            threshold: f.sy_threshold || '',
            whsThreshold: f.whs_000_threshold || '',
          });
        }
        seeded.current = true;
      }
    }).catch((e) => {
      showToast(e.message, 'error'); setRows([]);
    });

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { load(); /* eslint-disable-line */ }, [filter]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function create(e) {
    e.preventDefault();
    if (!form.title.trim()) { showToast('Give the report a title', 'error'); return; }
    try {
      await api.createReport({
        ...form,
        filters: { season: form.season, collection: form.collection },
      });
      setForm({ ...form, title: '', note: '' });
      showToast('Report created');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function createSales(e) {
    e.preventDefault();
    if (!sales.collection.trim()) {
      showToast('Pick a collection', 'error'); return;
    }
    try {
      await api.createReport({
        title: `Sales history — ${sales.collection}`,
        kind: 'sales history',
        season: sales.season,
        prepared_by: form.prepared_by,
        filters: {
          collection: sales.collection,
          season: sales.season,
          start_date: sales.range.from,
          end_date: sales.range.to,
          sy_threshold: sales.threshold,
          whs_000_threshold: sales.whsThreshold,
          view: 'sales',
        },
      });
      showToast('Report created — fetching sales…');
      load();

      // The figures are the point of the report, so Create gets them. Both
      // sources are live calls; the report is already saved if this fails,
      // and the fetch can be repeated without creating another.
      setFetching(true);
      try {
        const done = await api.fetchSales(
          sales.season, sales.range.from, sales.range.to);
        const summary = done
          .map((d) => `${d.channel === 'SY' ? 'SY' : '000'} ${d.matched}`)
          .join(', ');
        const missed = done.reduce((n, d) => n + d.unmatched, 0);
        showToast(`Sales loaded — ${summary}`
          + (missed ? `, ${missed} unmatched` : ''));
      } catch (err) {
        showToast(`Report saved, but the fetch failed: ${err.message}`, 'error');
      } finally {
        setFetching(false);
      }
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function move(r, status) {
    const extra = {};
    if (status === 'approved' || status === 'rejected') {
      const by = window.prompt(
        status === 'approved' ? 'Approved by?' : 'Sent back by?', '');
      if (by === null) return;
      extra.by = by;
      extra.note = window.prompt('Anything to add?', '') || '';
    }
    try {
      await api.setReportStatus(r.id, status, extra);
      showToast(
        status === 'submitted' ? 'Sent for approval'
          : status === 'approved' ? 'Approved'
            : status === 'rejected' ? 'Sent back' : 'Reopened');
      load();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function confirmDelete() {
    const r = toDelete;
    setToDelete(null);
    try { await api.deleteReport(r.id); showToast(`“${r.title}” deleted`); load(); }
    catch (err) { showToast(err.message, 'error'); }
  }

  const exportHref = (r) => {
    const qs = new URLSearchParams(
      Object.entries(r.filters || {}).filter(([, v]) => v));
    return `/api/styles/export.csv?${qs}`;
  };

  return (
    <>
      <header className="band">
        <div className="band-row">
          <Link to="/" className="logo">IM Master</Link>
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
          <Link to="/matrix" className="band-link"><Ruler size={18} /> Matrix</Link>
          <Link to="/browse" className="band-link"><Search size={18} /> Browse / Edit</Link>
          <Link to="/checklist" className="band-link"><ListChecks size={18} /> Checklist</Link>
          
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          <div className="rep-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'matrix'}
              className={`card-title tab${tab === 'matrix' ? ' on' : ''}`}
              onClick={() => setTab('matrix')}>Matrix Master</button>
            <button type="button" role="tab" aria-selected={tab === 'lookup'}
              className={`card-title tab${tab === 'lookup' ? ' on' : ''}`}
              onClick={() => setTab('lookup')}>Sales History</button>
          </div>

          {tab === 'lookup' && (
            <>
              <form className="form-grid" onSubmit={createSales} style={{ marginTop: 14 }}>
                <Field label="Season" hint="Which season's styles">
                  <Combo value={sales.season}
                    onChange={(v) => setSales((s) => ({ ...s, season: v }))}
                    options={meta?.seasons.map((x) => x.code) || []}
                    placeholder="e.g. S27" />
                </Field>
                <Field label="Collection" hint="Which collection the sheet covers">
                  <Combo value={sales.collection}
                    onChange={(v) => setSales((s) => ({ ...s, collection: v }))}
                    options={meta?.collections || []} placeholder="e.g. ESSENTIALS" />
                </Field>
                <Field label="Sales period" className="span-2"
                  hint="Both channels over the same dates — Salesforce fills WHS 000, Shopify fills SY">
                  <DateRange value={sales.range}
                    onChange={(v) => setSales((s) => ({ ...s, range: v }))} />
                </Field>
                <Field label="SY Threshold" hint="The Shopify minimum sales quantity for the highlight">
                  <TextInput value={sales.threshold} onChange={(v) => setSales((s) => ({ ...s, threshold: v }))}
                    placeholder="e.g. 10" />
                </Field>
                <Field label="000 Wholesale Threshold" hint="The WHS 000 minimum sales quantity for the highlight">
                  <TextInput value={sales.whsThreshold} onChange={(v) => setSales((s) => ({ ...s, whsThreshold: v }))}
                    placeholder="e.g. 10" />
                </Field>
                <div className="rep-submit">
                  <button type="submit" className="btn btn-save" disabled={fetching}>
                    {fetching ? 'Fetching sales…' : 'Create'}
                  </button>
                  <Link className="btn-chip"
                    to={`/print?${new URLSearchParams(
                      Object.entries({
                        view: 'sales', collection: sales.collection,
                        season: sales.season,
                        start_date: sales.range.from, end_date: sales.range.to,
                        // The sheet colours against these; without them the
                        // preview prints plain while the saved report does not.
                        sy_threshold: sales.threshold,
                        whs_000_threshold: sales.whsThreshold,
                      }).filter(([, v]) => v))}`}>
                    <Printer size={15} /> Preview the sheet
                  </Link>
                </div>
              </form>

              <MatrixSalesHistory />
            </>
          )}

          {tab === 'matrix' && (
          <form className="form-grid" onSubmit={create} style={{ marginTop: 14 }}>
            <Field label="Title">
              <TextInput value={form.title} onChange={set('title')}
                placeholder="e.g. S27 pricing review" />
            </Field>
            <Field label="Kind">
              <Combo value={form.kind} onChange={set('kind')} options={KINDS} />
            </Field>
            <Field label="Season" hint="What the report covers">
              <Combo value={form.season} onChange={set('season')}
                options={meta?.seasons.map((s) => s.code) || []} placeholder="e.g. S27" />
            </Field>
            <Field label="Collection" hint="Blank means every collection">
              <Combo value={form.collection} onChange={set('collection')}
                options={meta?.collections || []} placeholder="e.g. ESSENTIALS" />
            </Field>
            <Field label="Prepared by">
              <TextInput value={form.prepared_by} onChange={set('prepared_by')}
                placeholder="Your name" />
            </Field>
            <Field label="Note" hint="What should be looked at">
              <TextInput value={form.note} onChange={set('note')} />
            </Field>
            <div className="rep-submit">
              <button type="submit" className="btn btn-save">Create</button>
            </div>
          </form>
          )}
          
        </section>

        <div className="rep-filters">
          <button type="button" className={`btn-chip${filter === '' ? ' on' : ''}`}
            onClick={() => setFilter('')}>All</button>
          {STATUSES.map((s) => (
            <button type="button" key={s}
              className={`btn-chip${filter === s ? ' on' : ''}`}
              onClick={() => setFilter(s)}>{s}</button>
          ))}
        </div>

        {rows === null && <div className="spinner" aria-label="Loading" />}
        {rows?.length === 0 && (
          <p className="result-count">
            No reports {filter && `with status “${filter}”`} yet.
          </p>
        )}

        {rows?.map((r) => (
          <section key={r.id} className="card rep">
            <div className="rep-head">
              <span className={`rep-status ${r.status}`}>{r.status}</span>
              <span className="rep-title">{r.title}</span>
              {r.season && <span className="acc-season">{r.season}</span>}
              <span className="rep-kind">{r.kind}</span>
              {period(r.filters) && (
                <span className="rep-period" title="The period this report covers">
                  {period(r.filters)}
                </span>
              )}
              {r.filters?.whs_000_threshold && (
                <span className="rep-threshold" title="WHS 000 highlight threshold">
                  000 ≥ {r.filters.whs_000_threshold}
                </span>
              )}
              {r.filters?.sy_threshold && (
                <span className="rep-threshold" title="SY highlight threshold">
                  SY ≥ {r.filters.sy_threshold}
                </span>
              )}
              <span className="rep-actions">
                <Link className="icon-btn" title="Printable review sheet"
                  aria-label={`Print ${r.title}`}
                  to={`/print?${new URLSearchParams(
                    Object.entries({ ...(r.filters || {}), title: r.title })
                      .filter(([, v]) => v))}`}>
                  <Printer size={18} />
                </Link>
                <a className="icon-btn" href={exportHref(r)} title="Export this report as CSV"
                  aria-label={`Export ${r.title}`}><Download size={18} /></a>
                {r.status === 'draft' && (
                  <button type="button" className="btn-chip" onClick={() => move(r, 'submitted')}>
                    <Send size={15} /> Submit
                  </button>
                )}
                {r.status === 'submitted' && (
                  <>
                    <button type="button" className="btn-chip ok"
                      onClick={() => move(r, 'approved')}><Check size={15} /> Approve</button>
                    <button type="button" className="btn-chip ghost"
                      onClick={() => move(r, 'rejected')}><Undo2 size={15} /> Send back</button>
                  </>
                )}
                {(r.status === 'approved' || r.status === 'rejected') && (
                  <button type="button" className="btn-chip ghost" onClick={() => move(r, 'draft')}>
                    <Undo2 size={15} /> Reopen
                  </button>
                )}
                <button type="button" className="icon-btn danger" title="Delete report"
                  aria-label={`Delete ${r.title}`} onClick={() => setToDelete(r)}>
                  <Trash2 size={18} />
                </button>
              </span>
            </div>

            {r.note && <p className="rep-note">{r.note}</p>}

            <p className="rep-trail">
              {r.prepared_by ? `Prepared by ${r.prepared_by}` : 'Prepared'} · {when(r.created_at)}
              {r.submitted_at && <> · submitted {when(r.submitted_at)}</>}
              {r.decided_at && (
                <> · {r.status === 'approved' ? 'approved' : 'sent back'} by{' '}
                  {r.decided_by || 'someone'} {when(r.decided_at)}
                  {r.decision_note && <> — “{r.decision_note}”</>}
                </>
              )}
            </p>
          </section>
        ))}
      </main>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Delete this report?"
        message={toDelete
          ? `\u201c${toDelete.title}\u201d will be removed. The styles it covers are not affected.`
          : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
