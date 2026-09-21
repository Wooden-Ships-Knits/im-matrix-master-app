import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CirclePlus, Play, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { Field, Combo, ConfirmDialog, useToast } from '../components/ui.jsx';

const fmt$ = (v) => (v == null ? '—' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const fmtKg = (v) => (v == null ? '—' : Number(v).toFixed(3));

export default function Browse() {
  const navigate = useNavigate();
  const showToast = useToast();

  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ season: '', q: '', color: '', size: '' });
  const [results, setResults] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});   // id -> full style
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => { api.meta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { search(); /* initial load shows everything */ }, []); // eslint-disable-line

  async function search(f = filters) {
    setResults(null);
    try {
      setResults(await api.listStyles(f));
      setOpenId(null);
    } catch (err) {
      showToast(err.message, 'error');
      setResults([]);
    }
  }

  async function toggle(id) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!details[id]) {
      try {
        const full = await api.getStyle(id);
        setDetails((d) => ({ ...d, [id]: full }));
      } catch (err) { showToast(err.message, 'error'); }
    }
  }

  async function confirmDelete() {
    const s = toDelete;
    setToDelete(null);
    try {
      await api.deleteStyle(s.id);
      setResults((r) => r.filter((x) => x.id !== s.id));
      showToast(`“${s.name}” deleted`);
    } catch (err) { showToast(err.message, 'error'); }
  }

  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <>
      <header className="band">
        <div className="band-row">
          <Link to="/" className="logo">IM Master</Link>
          <Link to="/new" className="band-link"><CirclePlus size={19} /> Add new</Link>
        </div>
      </header>

      <main className="page">
        {/* -------- Query panel -------- */}
        <section className="card query-card">
          <h2 className="query-title">Query</h2>
          <form className="query-grid" onSubmit={(e) => { e.preventDefault(); search(); }}>
            <Field label="Season">
              <select className="input" value={filters.season}
                onChange={(e) => set('season')(e.target.value)}>
                <option value="">All seasons</option>
                {meta?.seasons.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </Field>
            <Field label="Style">
              <Combo value={filters.q} onChange={set('q')} placeholder="Any style name"
                options={(results || []).map((r) => r.name)} allowNew />
            </Field>
            <Field label="Color">
              <Combo value={filters.color} onChange={set('color')} placeholder="Any colorway"
                options={meta?.colorNames || []} allowNew />
            </Field>
            <Field label="Size">
              <select className="input" value={filters.size}
                onChange={(e) => set('size')(e.target.value)}>
                <option value="">All sizes</option>
                {meta?.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <button type="submit" className="btn btn-search">Search</button>
          </form>
        </section>

        {/* -------- Results -------- */}
        {results === null && <div className="spinner" aria-label="Loading" />}
        {results?.length === 0 && (
          <p className="result-count">No styles match — try clearing a filter, or add a new style.</p>
        )}
        {results?.length > 0 && (
          <p className="result-count">{results.length} style{results.length === 1 ? '' : 's'} found</p>
        )}

        {results?.map((s) => (
          <section key={s.id} className="card acc">
            <button type="button" className="acc-head" onClick={() => toggle(s.id)}
              aria-expanded={openId === s.id}>
              <Play size={16} fill="currentColor"
                className={`caret ${openId === s.id ? 'open' : ''}`} />
              <span className="acc-name">{s.name}</span>
              <span className="acc-count">({s.colorway_count} colorway{s.colorway_count === 1 ? '' : 's'})</span>
              <span className="acc-actions" onClick={(e) => e.stopPropagation()}>
                {s.status === 'draft' && <span className="badge-draft">DRAFT</span>}
                <button type="button" className="icon-btn" title="Edit style"
                  aria-label={`Edit ${s.name}`}
                  onClick={() => navigate(`/edit/${s.id}`)}>
                  <Pencil size={19} />
                </button>
                <button type="button" className="icon-btn danger" title="Delete style"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => setToDelete(s)}>
                  <Trash2 size={19} />
                </button>
              </span>
            </button>

            {openId === s.id && (
              <div className="acc-body">
                {!details[s.id] && <div className="spinner" />}
                {details[s.id]?.colorways.map((cw) => (
                  <div key={cw.id}>
                    <div className="cw-title">{cw.name}</div>
                    <div className="data-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Size</th><th>SKU</th><th>WT KG</th>
                            <th>WHLS</th><th>Retail</th><th>BOM</th><th>Misc.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(details[s.id].sizes.length ? details[s.id].sizes : [{ size: '—' }]).map((sz) => (
                            <tr key={sz.size}>
                              <td><strong>{sz.size}</strong></td>
                              <td>{details[s.id].sku_code || '—'}</td>
                              <td>{fmtKg(sz.weight_kg)}</td>
                              <td>{fmt$(details[s.id].wholesale_price)}</td>
                              <td>{fmt$(details[s.id].retail_price)}</td>
                              <td className="bom-cell">
                                {cw.bom.length === 0 && <span className="muted">—</span>}
                                {cw.bom.map((b, i) => (
                                  <div key={i}>
                                    {b.percent != null && <>{b.percent}% </>}
                                    {b.yarn || b.note || ''}
                                    {b.ends != null && <span className="muted"> · {b.ends} end{b.ends === 1 ? '' : 's'}</span>}
                                  </div>
                                ))}
                              </td>
                              <td className="muted">
                                {[details[s.id].construction, details[s.id].ship_via]
                                  .filter(Boolean).join(' · ') || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {details[s.id]?.colorways.length === 0 && (
                  <p className="muted">No colorways yet — open Edit to add them.</p>
                )}
              </div>
            )}
          </section>
        ))}
      </main>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Delete this style?"
        message={toDelete ? `“${toDelete.name}” and all of its colorways, BOM lines and measurements will be removed. This cannot be undone.` : ''}
        confirmLabel="Yes, delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
