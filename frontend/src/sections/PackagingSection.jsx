import { Field, NumberInput, Combo } from '../components/ui.jsx';

/** How the item is bagged, packed and boxed. */
export default function PackagingSection({ form, update, meta }) {
  const field = (k) => (v) => update({ [k]: v });
  const opts = meta?.options || {};

  // Pieces per box differs by size — a bigger garment means fewer in the same
  // carton — and it feeds the volumetric freight cost, so it belongs with the
  // box rather than with the knit details. Ordered by the sizes table.
  const order = meta?.sizes || [];
  const sizes = [...form.sizes].sort(
    (a, b) => order.indexOf(a.size) - order.indexOf(b.size),
  );
  const setPcs = (size) => (v) =>
    update({
      sizes: form.sizes.map((x) => (x.size === size ? { ...x, pcs_per_box: v } : x)),
    });

  return (
    <div>
      <div className="form-grid">
        <Field label="Bagging method">
          <Combo value={form.bagging_method} onChange={field('bagging_method')}
            options={opts.bagging_method || []} placeholder="e.g. MIX BULK PACKING" />
        </Field>
        <Field label="Polybag sticker">
          <Combo value={form.polybag_sticker} onChange={field('polybag_sticker')}
            options={opts.polybag_sticker || []} placeholder="e.g. PCS PER BAG STICKER ONLY" />
        </Field>
        <Field label="Packing method">
          <Combo value={form.packing_method} onChange={field('packing_method')}
            options={opts.packing_method || []} placeholder="e.g. LGHT VAC PACK" />
        </Field>
        <Field label="Packing in box">
          <Combo value={form.packing_in_box} onChange={field('packing_in_box')}
            options={opts.packing_in_box || []} placeholder="e.g. FLAT" />
        </Field>
        <Field label="Box labeling">
          <Combo value={form.box_labeling} onChange={field('box_labeling')}
            options={opts.box_labeling || []} placeholder="e.g. BARCODED SHIPPING LABEL" />
        </Field>
      </div>

      <div className="group-label" style={{ marginTop: 26 }}>Box</div>
      <div className="form-grid">
        <Field label="Length (cm)">
          <NumberInput value={form.box_length_cm} min="0" onChange={field('box_length_cm')} />
        </Field>
        <Field label="Depth (cm)">
          <NumberInput value={form.box_depth_cm} min="0" onChange={field('box_depth_cm')} />
        </Field>
        <Field label="Height (cm)">
          <NumberInput value={form.box_height_cm} min="0" onChange={field('box_height_cm')} />
        </Field>
      </div>

      <div className="group-label" style={{ marginTop: 26 }}>Pieces per box</div>
      {sizes.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Tick the sizes this style comes in to enter pieces per box.
        </p>
      ) : (
        <div className="pcs-row">
          {sizes.map((x) => (
            <label className="pcs-cell" key={x.size}>
              <span className="pcs-size">{x.size}</span>
              <NumberInput value={x.pcs_per_box} min="0"
                aria-label={`Pieces per box, ${x.size}`}
                onChange={setPcs(x.size)} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
