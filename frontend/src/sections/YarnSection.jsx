import { Field, TextInput, NumberInput, Combo } from '../components/ui.jsx';
import { roundFixed } from '../format.js';

// Only S/M is measured. The sheet grades the rest off it and says so in the
// formulas: M/L is =S/M*1.1, and X/L is =M/L*1.1, so 1.21 of S/M. X/S is the
// one that varies — both 0.9 and 0.92 appear, per style, in every season — so
// the style carries its own factor.
const SIZE_ORDER = ['X/S', 'S/M', 'M/L', 'X/L'];
const GRADE = { 'S/M': 1, 'M/L': 1.1, 'X/L': 1.21 };


const gradeOf = (size, xsFactor) => (size === 'X/S' ? Number(xsFactor) : GRADE[size]);

/** Knit construction details and the finished weight of each size. */
export default function YarnSection({ form, update, meta }) {
  const field = (k) => (v) => update({ [k]: v });

  const xsFactor = Number(form.xs_weight_factor) || 0.9;
  const sm = form.sizes.find((x) => x.size === 'S/M');
  const smWeight = sm && sm.weight_kg !== '' && sm.weight_kg != null
    ? Number(sm.weight_kg) : null;

  // Tolerances and distribution weights come from the season's rates — the
  // same row the costing view reads. No defaults: a season with no rates
  // seeded shows nothing here, rather than numbers borrowed from S27 that
  // may not be that season's.
  const rates = meta?.rates?.[form.season] || null;

  /** Everything the sheet derives from one finished weight. */
  const derived = (wt) => {
    if (!rates) return null;
    if (wt === '' || wt == null || Number.isNaN(Number(wt))) return null;
    const w = Number(wt);
    const dist = w + rates.distribution_wt_add_kg;
    return {
      low: w * rates.wt_tolerance_low,
      high: w * rates.wt_tolerance_high,
      dist,
      pricing: dist * rates.pricing_wt_factor,
    };
  };

  const ordered = [...form.sizes].sort(
    (a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size),
  );

  /** Re-grade every size off S/M. Only ever called from an edit, never on
   *  load — some styles were adjusted by hand in the sheet and recomputing
   *  them on open would quietly change them. */
  const regrade = (smValue, factor) =>
    update({
      xs_weight_factor: factor,
      sizes: form.sizes.map((x) => {
        if (x.size === 'S/M') return { ...x, weight_kg: smValue };
        if (smValue === '' || smValue == null) return { ...x, weight_kg: '' };
        const k = gradeOf(x.size, factor);
        if (!k) return x;
        return { ...x, weight_kg: Number((Number(smValue) * k).toFixed(5)) };
      }),
    });

  // A stored weight that does not follow the ratios is real — a hand
  // adjustment — so it is flagged rather than overwritten.
  const offRatio = smWeight != null && ordered.some((x) => {
    const k = gradeOf(x.size, xsFactor);
    if (!k || x.size === 'S/M' || x.weight_kg === '' || x.weight_kg == null) return false;
    return Math.abs(Number(x.weight_kg) - smWeight * k) > 0.0005;
  });

  return (
    <div>
      <div className="form-grid">
        <Field label="Knit minutes / pc"
          hint="Drives the knitting cost">
          <NumberInput value={form.knit_minutes_dev} min="0"
            onChange={field('knit_minutes_dev')} placeholder="e.g. 72.25" />
        </Field>
        <Field label="Material (yarn price)"
          hint="Sets the raw-material cost, and with it landed cost and margin">
          <Combo value={form.material} onChange={field('material')}
            options={meta?.materials || []} placeholder="e.g. COTTON ACRYLIC 60/40" />
        </Field>
        <Field label="Construction">
          <Combo value={form.construction} onChange={field('construction')}
            options={meta?.options?.construction || []} placeholder="e.g. MACHINE KNIT" />
        </Field>
        <Field label="Gauge">
          <TextInput value={form.gauge} onChange={field('gauge')} placeholder="e.g. 3G + 3GP" />
        </Field>
        <Field label="Tension">
          <TextInput value={form.tension} onChange={field('tension')} placeholder="e.g. LIHAT POLA" />
        </Field>
        <Field label="Total ends">
          <TextInput value={form.total_ends} onChange={field('total_ends')} placeholder="e.g. 2" />
        </Field>
        <Field label="Composition & care label" hint="Text printed on the care label">
          <TextInput value={form.composition_care} onChange={field('composition_care')} />
        </Field>
        <Field label="Color sequence" hint="Which colour goes where, e.g. C1/BODY C2/STRIPE">
          <TextInput value={form.color_sequence} onChange={field('color_sequence')} />
        </Field>
        <Field label="Logo label">
          <TextInput value={form.logo_label} onChange={field('logo_label')} />
        </Field>
        <Field label="Details">
          <TextInput value={form.details} onChange={field('details')} />
        </Field>
      </div>

      <div className="group-label" style={{ marginTop: 26 }}>Finished weight per size (kg / item)</div>
      {form.sizes.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Tick the sizes this style comes in (top panel) to enter weights.
        </p>
      ) : (
        <>
          <div className="wt-grid">
            <div className="wt-head">
              <span>Size</span><span>Weight (kg)</span>
              <span>Low tol.</span><span>High tol.</span>
              <span>Distribution</span><span>For pricing</span>
              <span>From</span>
            </div>
            {ordered.map((x) => {
              const isSm = x.size === 'S/M';
              const k = gradeOf(x.size, xsFactor);
              const d = derived(x.weight_kg);
              return (
                <div className="wt-row" key={x.size}>
                  <span className="wt-size">{x.size}</span>
                  {isSm ? (
                    <NumberInput value={x.weight_kg} min="0" step="0.001"
                      onChange={(v) => regrade(v, xsFactor)} placeholder="e.g. 0.240" />
                  ) : (
                    <span className="wt-derived">
                      {x.weight_kg === '' || x.weight_kg == null
                        ? '\u2014' : roundFixed(x.weight_kg, 3)}
                    </span>
                  )}
                  <span className="wt-calc">{d ? roundFixed(d.low, 3) : '—'}</span>
                  <span className="wt-calc">{d ? roundFixed(d.high, 3) : '—'}</span>
                  <span className="wt-calc">{d ? roundFixed(d.dist, 3) : '—'}</span>
                  <span className="wt-calc">{d ? roundFixed(d.pricing, 3) : '—'}</span>
                  <span className="wt-from">
                    {isSm ? <em>measured</em> : x.size === 'X/S' ? (
                      <span className="wt-toggle" role="group" aria-label="X/S factor">
                        {[0.9, 0.92].map((f) => (
                          <button type="button" key={f}
                            className={xsFactor === f ? 'on' : ''}
                            aria-pressed={xsFactor === f}
                            onClick={() => regrade(sm ? sm.weight_kg : '', f)}>
                            ×{f}
                          </button>
                        ))}
                      </span>
                    ) : `\u00d7${k}`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="calc-note">
            Type S/M only. M/L and X/L follow it at ×1.1 and ×1.21, and X/S at
            whichever factor this style uses.
            {rates ? (
              <> Tolerances are ×{rates.wt_tolerance_low} and ×{rates.wt_tolerance_high},
                distribution adds {rates.distribution_wt_add_kg} kg, and the pricing
                weight is that ×{rates.pricing_wt_factor} — from {form.season}'s rates.</>
            ) : (
              <> <span className="wt-flag">
                {form.season || 'This season'} has no rates seeded, so the tolerance and
                distribution columns are blank.
              </span></>
            )}
            {offRatio && (
              <> <span className="wt-flag">
                A stored weight does not match these ratios — it was adjusted by hand.
                Editing S/M will replace it.
              </span></>
            )}
          </p>
        </>
      )}
    </div>
  );
}
