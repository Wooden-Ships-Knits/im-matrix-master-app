import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Field, NumberInput, Combo } from '../components/ui.jsx';
import { roundFixed } from '../format.js';

// Every style is measured across and down; anything else is style-specific.
// These two are offered from the start so the common case needs no typing.
const DEFAULT_POMS = ['Lebar / Width', 'Tinggi / Length'];

const POM_SUGGESTIONS = [
  'Lebar / Width', 'Tinggi / Length', 'Chest width', 'Body length',
  'Sleeve length', 'Shoulder width', 'Armhole depth', 'Cuff width',
  'Bottom width', 'Neck width', 'Neck depth',
];

// Collected here, stored on the style. Free text with suggestions rather than
// fixed lists — the workbooks never state the vocabulary, so it learns it.
const ATTRIBUTES = [
  ['print_placement', 'Printed'],
  ['based_body', 'Base body'],
  ['bottom_type', 'Bottom type'],
  ['bottom_rib', 'Bottom rib'],
  ['similar_style_past', 'Similar style from past season'],
  ['distressed', 'Distressed'],
  ['sleeve_category', 'Sleeve category'],
  ['sleeve_length', 'Sleeve length'],
  ['length_category', 'Length category'],
];

/**
 * The Matrix: point-of-measure grid per size, and what the garment is.
 *
 * Measurements are stored flat as { pom, size, value_cm }. The attributes
 * below them live on the style. Three are shown but not editable here —
 * they belong to the Yarn screen and are repeated so the Matrix reads as one
 * description without giving the same field two homes.
 */
export default function MeasurementsSection({ form, update, meta }) {
  const [newPom, setNewPom] = useState('');
  const sizes = form.sizes.map((x) => x.size);
  const field = (k) => (v) => update({ [k]: v });
  const opts = meta?.options || {};

  const smWeight = form.sizes.find((x) => x.size === 'S/M')?.weight_kg;

  // Group the flat rows into one row per point of measure, first seen first.
  const rows = useMemo(() => {
    const order = [];
    const map = {};
    for (const m of form.measurements) {
      if (!map[m.pom]) { map[m.pom] = {}; order.push(m.pom); }
      if (m.size) map[m.pom][m.size] = m.value_cm;
    }
    if (order.length === 0) {
      return DEFAULT_POMS.map((pom) => ({ pom, values: {} }));
    }
    return order.map((pom) => ({ pom, values: map[pom] }));
  }, [form.measurements]);

  const rebuild = (rowList) => {
    const flat = [];
    for (const r of rowList) {
      for (const size of sizes) {
        flat.push({ pom: r.pom, size, value_cm: r.values[size] ?? '' });
      }
      if (sizes.length === 0) flat.push({ pom: r.pom, size: '', value_cm: '' });
    }
    update({ measurements: flat });
  };

  const setValue = (pom, size, v) =>
    rebuild(rows.map((r) => (r.pom === pom ? { ...r, values: { ...r.values, [size]: v } } : r)));

  const addPom = () => {
    const name = newPom.trim();
    if (!name || rows.some((r) => r.pom.toLowerCase() === name.toLowerCase())) return;
    rebuild([...rows, { pom: name, values: {} }]);
    setNewPom('');
  };

  const removePom = (pom) => rebuild(rows.filter((r) => r.pom !== pom));

  return (
    <div>
      {sizes.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Tick the sizes this style comes in (top panel) first — the
          measurement columns follow the sizes.
        </p>
      ) : (
        <>
          <table className="meas-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>Point of measure</th>
                {sizes.map((s) => <th key={s}>{s} (cm)</th>)}
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pom}>
                  <td style={{ fontWeight: 600 }}>{r.pom}</td>
                  {sizes.map((s) => (
                    <td key={s}>
                      <NumberInput value={r.values[s] ?? ''} min="0" step="0.01"
                        decimals={2} aria-label={`${r.pom}, ${s}`}
                        onChange={(v) => setValue(r.pom, s, v)} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="icon-btn danger" title={`Remove ${r.pom}`}
                      aria-label={`Remove ${r.pom}`} onClick={() => removePom(r.pom)}>
                      <X size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, maxWidth: 480 }}>
            <input className="input" list="pom-suggestions" value={newPom}
              placeholder="e.g. Chest width"
              onChange={(e) => setNewPom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPom())} />
            <datalist id="pom-suggestions">
              {POM_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
            </datalist>
            <button type="button" className="btn-chip" onClick={addPom}
              style={{ flexShrink: 0 }}>
              + Add measurement
            </button>
          </div>
        </>
      )}

      <div className="group-label" style={{ marginTop: 30 }}>What this style is</div>
      <div className="form-grid">
        {/* Kept on the Yarn screen, shown here so the description is whole. */}
        <Field label="GG (machine)" hint="From Yarn">
          <input className="input" value={form.gauge || ''} readOnly tabIndex={-1} />
        </Field>
        <Field label="Construction" hint="From Yarn">
          <input className="input" value={form.construction || ''} readOnly tabIndex={-1} />
        </Field>
        <Field label="Weight S/M (kg)" hint="From Yarn">
          <input className="input" readOnly tabIndex={-1}
            value={smWeight === '' || smWeight == null ? '' : roundFixed(smWeight, 3)} />
        </Field>

        {ATTRIBUTES.map(([key, label]) => (
          <Field key={key} label={label}>
            <Combo value={form[key]} onChange={field(key)}
              options={opts[key] || []} />
          </Field>
        ))}

        <Field label="Ply" hint="Whole number">
          <NumberInput value={form.ply} min="0" step="1" onChange={field('ply')} />
        </Field>
        <Field label="Yarn" hint="YCA, YST, YAC…">
          <Combo value={form.yarn_type} onChange={field('yarn_type')}
            options={meta?.yarnTypes || []} placeholder="e.g. YCA" />
        </Field>
      </div>
    </div>
  );
}
