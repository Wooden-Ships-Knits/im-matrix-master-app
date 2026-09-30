import { Field, TextInput, NumberInput, Combo } from '../components/ui.jsx';
import { roundFixed } from '../format.js';
import { gradeOf, offRatio, orderSizes, regradeSizes } from '../grading.js';

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

  const ordered = orderSizes(form.sizes, meta?.sizes);

  // The S/M weight is entered on the Matrix screen; changing the factor here
  // re-grades off whatever it holds.
  const regrade = (smValue, factor) =>
    update({
      xs_weight_factor: factor,
      sizes: regradeSizes(form.sizes, smValue, factor),
    });

  const flagged = offRatio(form.sizes, xsFactor);

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
        <Field label="Construction" hint="How the garment is knitted">
          <Combo value={form.construction} onChange={field('construction')}
            options={['MACHINE KNIT', 'HAND KNIT', 'CROCHET']}
            placeholder="e.g. MACHINE KNIT" />
        </Field>
        <Field label="Gauge" hint="From Matrix">
          <input className="input" value={form.gauge || ''} readOnly tabIndex={-1} />
        </Field>
        <Field label="Tension">
          <Combo value={form.tension} onChange={field('tension')}
            options={meta?.options?.tension || []} placeholder="e.g. LIHAT POLA" />
        </Field>
        <Field label="Total ends">
          <Combo value={form.total_ends} onChange={field('total_ends')}
            options={meta?.options?.total_ends || []} placeholder="e.g. 2" />
        </Field>
        <Field label="Composition & care label" hint="Text printed on the care label">
          <Combo value={form.composition_care} onChange={field('composition_care')}
            options={meta?.options?.composition_care || []} />
        </Field>
        <Field label="Color sequence" hint="Which colour goes where, e.g. C1/BODY C2/STRIPE">
          <Combo value={form.color_sequence} onChange={field('color_sequence')}
            options={meta?.options?.color_sequence || []} />
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
                  <span className={`wt-derived${isSm ? ' measured' : ''}`}>
                    {x.weight_kg === '' || x.weight_kg == null
                      ? '\u2014' : roundFixed(x.weight_kg, 3)}
                  </span>
                  <span className="wt-calc">{d ? roundFixed(d.low, 3) : '—'}</span>
                  <span className="wt-calc">{d ? roundFixed(d.high, 3) : '—'}</span>
                  <span className="wt-calc">{d ? roundFixed(d.dist, 3) : '—'}</span>
                  <span className="wt-calc">{d ? roundFixed(d.pricing, 3) : '—'}</span>
                  <span className="wt-from">
                    {isSm ? <em>from Matrix</em> : x.size === 'X/S' ? (
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
            S/M is entered on the Matrix screen. M/L and X/L follow it at ×1.1 and ×1.21, and X/S at
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
            {flagged && (
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
