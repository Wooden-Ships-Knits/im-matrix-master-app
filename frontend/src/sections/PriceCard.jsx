import { Shirt } from 'lucide-react';

/**
 * One style's column on the Pricing Matrix, laid out as F27 MATRIX PRICING.
 *
 * The workbook is the same shape as the layout sheet — one column per style,
 * twelve to a block, numbered 1, 2, 3, S1, 4 in the same two running
 * sequences — but under the name it carries what the garment costs rather
 * than what it is made of.
 *
 * The rows under the name come from PRICING_ROWS below rather than being
 * written out here, because what they are is the one thing the workbook could
 * not tell us: the F27 file is a blank template. Every one of its five sheets
 * has the rows ruled and styled and not one price in them — 159 numeric cells
 * across the workbook, all of them card index numbers. So the stack is data,
 * and settling what the rows are is editing the list, not the card.
 */

/**
 * The stack under the name, top to bottom.
 *
 *   key    the column on the style, or null for a row that is only a label
 *   label  what the workbook prints at the left of the row
 *   money  shown as an amount, right-aligned
 *   big    the 16pt rows — the two the workbook actually fills in
 *
 * Taken from the template's own shape: eight rows of 30pt under a 57.75pt
 * name, the first and fourth at 16pt carrying "FAF / FAH", one at 14pt
 * carrying the note "NO X/L". Which price belongs on which row is still
 * open — see docs/caveats.md §13.
 */
export const PRICING_ROWS = [
  { key: 'finishing_location', label: 'FAF / FAH', big: true },
  { key: 'whls_line_price_usd', label: 'Line', money: true },
  { key: 'whls_retail_price_usd', label: 'Retail', money: true },
  { key: 'price_000', label: 'FAF / FAH', big: true, money: true },
  { key: null, label: 'NO X/L', note: true },
];

export const money = (v) => (
  v == null || v === ''
    ? ''
    : Number(v).toLocaleString('en-US', {
      minimumFractionDigits: 0, maximumFractionDigits: 2,
    }));

/** What a row shows for this style, as text. */
export const valueOf = (style, row) => {
  if (!row.key) return '';
  const raw = style?.[row.key];
  if (raw == null || raw === '') return '';
  return row.money ? money(raw) : String(raw);
};

export default function PriceCard({
  style: s, index = null, onEdit = null, onOpen = null, rows = PRICING_ROWS,
}) {
  const open = onOpen ? () => onOpen(s) : undefined;
  return (
    <div className={`price-card${onEdit ? ' is-editable' : ''}`}>
      {index != null && <div className="price-index">{index}</div>}

      <div className="price-photo" onDoubleClick={open}
        title={onOpen ? `Open ${s.name}` : undefined}>
        {s.image_path
          ? <img src={s.image_path} alt={s.name} />
          : <Shirt size={26} strokeWidth={1.2} aria-hidden="true" />}
      </div>

      <div className="price-name">{s.name}</div>

      <dl className="price-rows">
        {rows.map((row, i) => {
          const shown = valueOf(s, row);
          // A label-only row is the workbook's note line: it prints its own
          // text and has nothing to fill in.
          if (!row.key) {
            return (
              <div key={`note-${i}`} className="price-row note">
                <dd>{row.label}</dd>
              </div>
            );
          }
          return (
            <div key={row.key}
              className={`price-row${row.big ? ' big' : ''}${shown ? '' : ' empty'}`}>
              <dt>{row.label}</dt>
              <dd>
                {onEdit ? (
                  <input
                    className="price-input"
                    // Keyed on the stored value so a save made elsewhere
                    // reaches an uncontrolled field.
                    key={shown}
                    defaultValue={shown}
                    inputMode={row.money ? 'decimal' : undefined}
                    aria-label={`${row.label} — ${s.name}`}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next === shown) return;
                      onEdit(s, row.key, next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.target.blur();
                      if (e.key === 'Escape') { e.target.value = shown; e.target.blur(); }
                    }}
                  />
                ) : shown}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
