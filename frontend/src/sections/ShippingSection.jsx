import { Field, Combo } from '../components/ui.jsx';

/** How the style ships and clears customs. */
export default function ShippingSection({ form, update, meta }) {
  const field = (k) => (v) => update({ [k]: v });
  const opts = meta?.options || {};

  return (
    <div className="form-grid">
      <Field label="Ship via">
        <Combo value={form.ship_via} onChange={field('ship_via')}
          options={opts.ship_via || []} placeholder="e.g. SEA OR AIR OK" />
      </Field>
      <Field label="HS code" hint="Harmonised tariff code">
        <Combo value={form.hs_code} onChange={field('hs_code')}
          options={opts.hs_code || []} placeholder="e.g. 6110.20.2020" />
      </Field>
      <Field label="Duty category">
        <Combo value={form.duty_category} onChange={field('duty_category')}
          options={opts.duty_category || []} placeholder="e.g. 345" />
      </Field>
      <Field label="Hang tag">
        <Combo value={form.hang_tag} onChange={field('hang_tag')}
          options={opts.hang_tag || []} placeholder="e.g. #1 PALM + XSMALL WHITE TAG" />
      </Field>
      <Field label="Special customer order instructions">
        <textarea className="input" value={form.special_instructions}
          onChange={(e) => field('special_instructions')(e.target.value)}
          placeholder="e.g. AS USUAL. NOTHING SPECIAL" />
      </Field>
      <Field label="Notes">
        <textarea className="input" value={form.notes}
          onChange={(e) => field('notes')(e.target.value)}
          placeholder="Anything the team should know" />
      </Field>
    </div>
  );
}
