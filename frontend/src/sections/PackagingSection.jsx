import { Field, NumberInput, Combo } from '../components/ui.jsx';

/** How the item is bagged, packed and boxed. */
export default function PackagingSection({ form, update, meta }) {
  const field = (k) => (v) => update({ [k]: v });
  const opts = meta?.options || {};

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
        <Field label="Pieces per box">
          <NumberInput value={form.pcs_per_box} min="0" onChange={field('pcs_per_box')} />
        </Field>
      </div>
    </div>
  );
}
