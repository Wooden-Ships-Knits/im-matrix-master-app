import { useMemo } from 'react';
import { Field, NumberInput, Combo } from '../components/ui.jsx';
import { regradeSizes } from '../grading.js';

// Every style is measured across and down, and only those two. The grid is
// fixed rather than a list anyone extends.
const POMS = ['Lebar / Width', 'Tinggi / Length'];

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
 * The two points of measure are fixed. Measurements are stored flat as
 * { pom, size, value_cm }. The attributes below them live on the style. Three are shown but not editable here —
 * they belong to the Yarn screen and are repeated so the Matrix reads as one
 * description without giving the same field two homes.
 */
export default function MeasurementsSection({ form, update, meta }) {
  const sizes = form.sizes.map((x) => x.size);
  const field = (k) => (v) => update({ [k]: v });
  const opts = meta?.options || {};

  const sm = form.sizes.find((x) => x.size === 'S/M');
  const smWeight = sm?.weight_kg;

  // S/M drives every other size, so typing it here re-grades the rest.
  const setSmWeight = (v) =>
    update({ sizes: regradeSizes(form.sizes, v, Number(form.xs_weight_factor) || 0.9) });

  // One row per point of measure, carrying whatever is stored for it.
  const rows = useMemo(() => {
    const map = {};
    for (const m of form.measurements) {
      if (!map[m.pom]) map[m.pom] = {};
      if (m.size) map[m.pom][m.size] = m.value_cm;
    }
    return POMS.map((pom) => ({ pom, values: map[pom] || {} }));
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
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="group-label" style={{ marginTop: 30 }}>What this style is</div>
      <div className="form-grid">
        <Field label="GG (machine)" hint="Shown on the Yarn screen too">
          <Combo value={form.gauge} onChange={field('gauge')}
            options={opts.gauge_detail || []} placeholder="e.g. 3G + 3GP" />
        </Field>
        <Field label="Construction" hint="Shown on the Yarn screen too">
          <Combo value={form.construction} onChange={field('construction')}
            options={opts.construction || []} placeholder="e.g. MACHINE KNIT" />
        </Field>
        <Field label="Weight S/M (kg)" hint="The other sizes are graded from this">
          <NumberInput value={smWeight ?? ''} min="0" step="0.001" decimals={3}
            disabled={!sm} onChange={setSmWeight} placeholder="e.g. 0.240" />
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
