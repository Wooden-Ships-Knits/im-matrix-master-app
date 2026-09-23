import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, CirclePlus, Download, Printer, Send, Check, Undo2, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { Field, TextInput, Combo, ConfirmDialog, useToast } from '../components/ui.jsx';

const STATUSES = ['draft', 'submitted', 'approved', 'rejected'];
const KINDS = ['style list', 'pricing', 'costing', 'packaging', 'salesforce upload'];

const when = (t) => (t ? new Date(t).toLocaleDateString(undefined,
  { day: 'numeric', month: 'short', year: 'numeric' }) : '');

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
  const [form, setForm] = useState({
    title: '', kind: 'style list', season: '', collection: '', prepared_by: '', note: '',
  });
  const showToast = useToast();

  const load = (status = filter) =>
    api.listReports(status || undefined).then(setRows).catch((e) => {
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
          <Link to="/browse" className="band-link"><Search size={18} /> Browse / Edit</Link>
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
        </div>
      </header>

      <main className="page">
        <section className="card card-pad">
          <h2 className="card-title">New report</h2>
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
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-save">Create</button>
            </div>
          </form>
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
