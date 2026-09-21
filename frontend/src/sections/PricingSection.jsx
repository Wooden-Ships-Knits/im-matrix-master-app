import { Field, PriceInput } from '../components/ui.jsx';

const money = (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);

/**
 * Selling prices, and the costing calculated from them.
 *
 * The prices above are typed. Everything in the Calculated block is worked out
 * from the style's inputs and the season's rates (schema.md §5) — change a rate
 * on the season and every style follows.
 */
export default function PricingSection({ form, update, costing = [] }) {
  const field = (k) => (v) => update({ [k]: v });

  return (
    <>
      <div className="form-grid">
        <Field label="Wholesale (WHLS)" hint="Everything below is costed against this">
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
        <Field label="Admin %" hint="Multiplies the season's admin base">
          <PriceInput value={form.admin_pct} onChange={field('admin_pct')} />
        </Field>
        <Field label="Sample price">
          <PriceInput value={form.sample_price} onChange={field('sample_price')} />
        </Field>
      </div>

      <div className="calc-block">
        <div className="calc-head">
          Calculated <span className="calc-tag">from season rates</span>
        </div>

        {costing.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Save the style to see its costing.
          </p>
        ) : (
          <div className="calc-scroll">
            <table className="calc-table">
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Colour</th>
                  <th className="n">Total cost</th>
                  <th className="n">Duty USA</th>
                  <th className="n">DHL vol.</th>
                  <th className="n">Landed</th>
                  <th className="n">Margin</th>
                </tr>
              </thead>
              <tbody>
                {costing.map((r, i) => {
                  const landed = r.landed_dhl_volumetric_usd;
                  const price = r.whls_line_price_usd;
                  const margin =
                    landed && price ? 1 - Number(landed) / Number(price) : null;
                  return (
                    <tr key={i}>
                      <td>{r.size || '—'}</td>
                      <td>{r.colorway || '—'}</td>
                      <td className="n">{money(r.total_all_costs_usd)}</td>
                      <td className="n">{money(r.duty_to_usa)}</td>
                      <td className="n">{money(r.dhl_volumetric_usd)}</td>
                      <td className="n">{money(landed)}</td>
                      <td className={`n${margin !== null && margin < 0.5 ? ' low' : ''}`}>
                        {margin === null ? '—' : `${(margin * 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="calc-note">
              A dash means an input is missing — most often the content code,
              which decides the duty category.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
