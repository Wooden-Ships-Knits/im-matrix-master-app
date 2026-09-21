import { Field, TextInput, NumberInput, Combo } from '../components/ui.jsx';

/** Knit construction details and the finished weight of each size. */
export default function YarnSection({ form, update, meta }) {
  const field = (k) => (v) => update({ [k]: v });

  const setWeight = (size) => (v) =>
    update({
      sizes: form.sizes.map((x) => (x.size === size ? { ...x, weight_kg: v } : x)),
    });

  const setPcs = (size) => (v) =>
    update({
      sizes: form.sizes.map((x) => (x.size === size ? { ...x, pcs_per_box: v } : x)),
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
        <div className="form-grid">
          {form.sizes.map((x) => (
            <Field key={x.size} label={x.size}>
              <div className="size-row">
                <NumberInput value={x.weight_kg} min="0" onChange={setWeight(x.size)}
                  placeholder="kg" />
                {/* Pcs per box differs by size — 19 / 17 / 15 / 13 is typical */}
                <NumberInput value={x.pcs_per_box} min="0" onChange={setPcs(x.size)}
                  placeholder="pcs/box" />
              </div>
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}
