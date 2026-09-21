import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { NumberInput } from '../components/ui.jsx';

const POM_SUGGESTIONS = [
  'Chest width', 'Body length', 'Sleeve length', 'Shoulder width',
  'Armhole depth', 'Cuff width', 'Bottom width', 'Neck width', 'Neck depth',
];

/**
 * Point-of-measure grid: one row per POM, one column per active size (cm).
 * Stored flat as { pom, size, value_cm } rows.
 */
export default function MeasurementsSection({ form, update }) {
  const [newPom, setNewPom] = useState('');
  const sizes = form.sizes.map((x) => x.size);

  // Group flat rows into POM rows, keeping first-seen order.
  const rows = useMemo(() => {
    const order = [];
    const map = {};
    for (const m of form.measurements) {
      if (!map[m.pom]) { map[m.pom] = {}; order.push(m.pom); }
      if (m.size) map[m.pom][m.size] = m.value_cm;
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

  if (sizes.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Tick the sizes this style comes in (top panel) first — measurement
        columns follow the sizes.
      </p>
    );
  }

  return (
    <div>
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
                  <NumberInput value={r.values[s] ?? ''} min="0"
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
          {rows.length === 0 && (
            <tr><td colSpan={sizes.length + 2} className="muted">
              No measurements yet — add the first point of measure below.
            </td></tr>
          )}
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
    </div>
  );
}
