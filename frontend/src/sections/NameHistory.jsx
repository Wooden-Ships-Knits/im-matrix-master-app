import { History } from 'lucide-react';

/**
 * What this style and its colourways have been called before.
 *
 * A rename used to leave no trace: style_name was overwritten and the old
 * spelling was gone. That is the single biggest source of wrong sales figures
 * here, because Shopify and Salesforce go on selling under the name they were
 * given — F26's RIHANNA CARDI CHUNKY COTTON was S26's RIHANNA CHUNKY CARDI
 * COTTON, and 463 units landed on neither.
 *
 * So this is not only a log. Every line in it is a name the sales matcher now
 * looks under, which is why it is worth showing: a rename the team can see is
 * a rename they can question.
 */
const when = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined,
      { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
};

export default function NameHistory({ rows }) {
  // Nothing renamed yet is the normal case, and an empty panel saying so is
  // better than a box that appears only sometimes — the column keeps its
  // shape either way.
  const items = rows || [];

  return (
    <section className="name-history" aria-label="Previous names">
      <h3 className="nh-title">
        <History size={14} aria-hidden="true" /> Name history
      </h3>

      {items.length === 0 ? (
        <p className="nh-empty">
          No renames recorded. Anything renamed from here on is listed, and the
          old name keeps finding its sales.
        </p>
      ) : (
        <ul className="nh-list">
          {items.map((r, i) => (
            <li key={`${r.changed_at}-${i}`}>
              <span className={`nh-tag nh-${r.scope}`}>
                {r.scope === 'colorway' ? 'colour' : 'style'}
              </span>
              <span className="nh-names">
                <span className="nh-was">{r.old_value}</span>
                <span className="nh-arrow" aria-label="became">→</span>
                <span className="nh-now">{r.new_value}</span>
              </span>
              <time className="nh-when" dateTime={r.changed_at}>
                {when(r.changed_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
