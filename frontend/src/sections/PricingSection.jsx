import { Field, PriceInput } from '../components/ui.jsx';

/** All selling prices in one place (USD). WHLS and Retail appear in Browse. */
export default function PricingSection({ form, update }) {
  const field = (k) => (v) => update({ [k]: v });

  return (
    <div className="form-grid">
      <Field label="Wholesale (WHLS)" hint="Shown in the Browse table">
        <PriceInput value={form.wholesale_price} onChange={field('wholesale_price')} />
      </Field>
      <Field label="Retail" hint="Shown in the Browse table">
        <PriceInput value={form.retail_price} onChange={field('retail_price')} />
      </Field>
      <Field label="SY Price">
        <PriceInput value={form.sy_price} onChange={field('sy_price')} />
      </Field>
      <Field label="SY Sale">
        <PriceInput value={form.sy_sale_price} onChange={field('sy_sale_price')} />
      </Field>
      <Field label="000 Price">
        <PriceInput value={form.price_000} onChange={field('price_000')} />
      </Field>
      <Field label="Sample price">
        <PriceInput value={form.sample_price} onChange={field('sample_price')} />
      </Field>
    </div>
  );
}
