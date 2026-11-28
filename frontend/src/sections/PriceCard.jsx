import { memo, useRef, useState } from 'react';
import { ImagePlus, Shirt } from 'lucide-react';

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
  // WHS, not "Line". It is whls_line_price_usd — the wholesale price — and
  // the style editor already calls it Wholesale. Two names for one figure
  // on two screens is how somebody ends up typing it into both.
  { key: 'whls_line_price_usd', label: 'WHS', money: true },
  { key: 'whls_retail_price_usd', label: 'Retail', money: true },
  // The column is already there and already editable in the style editor's
  // Pricing section as "Sale Price" — this puts it on the sheet beside the
  // retail price it is marked down from. Empty on all 1,467 styles so far.
  { key: 'final_sale_price_usd', label: 'Sale', money: true },
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

function PriceCard({
  style: s, index = null, onEdit = null, onOpen = null, onPhoto = null,
  rows = PRICING_ROWS,
}) {
  const open = onOpen ? () => onOpen(s) : undefined;

  // The same photo frame as the Matrix card: double-click opens the style,
  // hovering brings up the button, and a file dropped anywhere on the frame
  // is taken. It is the SAME photo — styles.photo_url — so a picture added
  // from here appears on the Matrix card and the printed sheet too.
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const takeFile = async (file) => {
    if (!file || !onPhoto || busy) return;
    setBusy(true);
    try { await onPhoto(s, file); } finally { setBusy(false); }
  };

  return (
    <div className={`pmx-card${onEdit ? ' is-editable' : ''}`}>
      {index != null && <div className="pmx-index">{index}</div>}

      <div className={`pmx-photo${open ? ' can-open' : ''}`} onDoubleClick={open}
        title={open ? `Double-click to open ${s.name}` : undefined}
        onDragOver={onPhoto ? (e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
        } : undefined}
        onDrop={onPhoto ? (e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          e.stopPropagation();
          takeFile(e.dataTransfer.files[0]);
        } : undefined}>
        {s.image_path
          ? <img src={s.image_path} alt={s.name} loading="lazy" decoding="async" />
          : <Shirt size={26} strokeWidth={1.2} aria-hidden="true" />}

        {onPhoto && (
          <>
            {/* `hidden`, not a class. A file input that is only hidden by
                the project stylesheet renders as "Choose File | No file
                chosen" in the middle of the photo the moment that
                stylesheet is late, missing or overridden. The attribute is
                the browser's own display:none and needs nothing loaded. */}
            <input ref={fileRef} hidden className="pmx-photo-file" type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                takeFile(e.target.files?.[0]);
                e.target.value = '';   // so the same file can be picked again
              }} />
            <button type="button" className="pmx-photo-add" disabled={busy}
              title={s.image_path ? `Replace the photo for ${s.name}`
                                  : `Add a photo for ${s.name}`}
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
              // The frame opens the style on double-click; two quick clicks
              // on this button must not do that as well.
              onDoubleClick={(e) => e.stopPropagation()}>
              <ImagePlus size={13} />
              {busy ? 'Uploading…' : s.image_path ? 'Replace' : 'Add photo'}
            </button>
          </>
        )}
      </div>

      <div className="pmx-name">{s.name}</div>

      <dl className="pmx-rows">
        {rows.map((row, i) => {
          const shown = valueOf(s, row);
          // A label-only row is the workbook's note line: it prints its own
          // text and has nothing to fill in.
          if (!row.key) {
            return (
              <div key={`note-${i}`} className="pmx-row note">
                <dd>{row.label}</dd>
              </div>
            );
          }
          return (
            <div key={row.key}
              className={`pmx-row${row.big ? ' big' : ''}${shown ? '' : ' empty'}`}>
              <dt>{row.label}</dt>
              <dd>
                {onEdit ? (
                  <input
                    className="pmx-input"
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

// Memoised for the same reason as SheetCard: one price blur used to
// re-render the whole season's sheet twice (optimistic patch + server echo).
export default memo(PriceCard);
