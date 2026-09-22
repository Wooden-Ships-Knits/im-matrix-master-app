import { NumberInput } from '../components/ui.jsx';

/**
 * Minutes per operation, which is what the labour cost is built from.
 *
 * The season carries a standard for each operation, but the minutes really do
 * differ per style — Rihanna takes 30 minutes to link where the standard is 26,
 * and 26 to finish where the standard is 22. Leaving a box empty uses the
 * standard; 0 means the operation is not used on this style.
 */
export default function OperationsSection({ form, update }) {
  const rows = form.operations || [];

  const setMinutes = (code) => (v) =>
    update({
      operations: rows.map((o) => (o.code === code ? { ...o, minutes: v } : o)),
    });

  const total = rows.reduce(
    (sum, o) => sum + (o.minutes === '' || o.minutes == null ? 0 : Number(o.minutes)),
    0,
  );
  const knit = Number(form.knit_minutes_dev || 0);

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Save the style to set its operation minutes.
      </p>
    );
  }

  return (
    <div>
      <div className="ops-grid">
        {rows.map((o) => {
          const changed =
            o.minutes !== '' &&
            o.minutes != null &&
            o.default_minutes != null &&
            Number(o.minutes) !== Number(o.default_minutes);
          return (
            <div className="ops-row" key={o.code}>
              <div className="ops-name">
                {o.name}
                {changed && <span className="ops-flag">changed</span>}
              </div>
              <NumberInput
                value={o.minutes ?? ''}
                min="0"
                onChange={setMinutes(o.code)}
                placeholder={
                  o.default_minutes != null ? `${o.default_minutes} standard` : 'not used'
                }
              />
            </div>
          );
        })}
      </div>

      <div className="ops-total">
        <span>
          {total.toFixed(2)} min of operations
          {knit > 0 && <> + {knit} min knitting</>}
        </span>
        <b>{(total + knit).toFixed(2)} min total</b>
      </div>

      <p className="calc-note">
        Empty uses the season standard shown in grey. 0 means the operation is
        not used on this style. The labour cost on the Pricing screen follows
        these minutes.
      </p>
    </div>
  );
}
