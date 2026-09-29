import { GripVertical, Shirt } from 'lucide-react';
import { commaDecimal, pointDecimal, roundFixed } from '../format.js';

/**
 * One style, as the Matrix Master and Sales History sheets draw it.
 *
 * Shared by the printed sheet and the Matrix screen so the thing the team
 * arranges is the thing that comes out of the printer. Two layouts of the
 * same card would drift within a week.
 *
 * Editing is the only difference between the two: pass onEdit and the
 * attribute rows become inputs. Everything else — the photo, the name, the
 * colourways, the step chips, the sales table, the repeat colouring — is the
 * same code in both places.
 */

// Sold quantity for one colourway on one channel.
export const qty = (style, colour, channel) => style.sales?.[colour]?.[channel] ?? null;

export const sum = (style, channel) => {
  const values = style.colorways
    .map((c) => qty(style, c, channel))
    .filter((v) => v != null);
  return values.length ? values.reduce((a, b) => a + Number(b), 0) : null;
};

export const cell = (v) => (v == null ? '' : Number(v).toLocaleString('en-US'));

/**
 * Let a multi-colour name wrap at its separators.
 *
 * "DARKEST INDIGO/RED/TWILIGHT SKY" breaks fine at the spaces, but
 * "WHITE/CASHEW/KHAKI" is one unbreakable word to the browser and runs
 * straight out of a 20mm card into the next one. A zero-width space after
 * each "/" gives it somewhere to break — at the separator, which is where a
 * person would break it too, rather than mid-word.
 *
 * The character is invisible and copies as nothing, so the name still reads
 * and still pastes cleanly. Written as an escape because this is a JS string;
 * in JSX text it would print literally.
 */
export const breakable = (text) => String(text ?? '').replace(/\//g, '/​');

// The workbook marks a style that sells through one channel only, and BOTH
// where it sells through either. A blank is the one case left unbadged: the
// workbook never filled it in, and that is not the same as "both".
export const CHANNEL_MARK = { '000 ONLY': 'whs', 'SY ONLY': 'sy', BOTH: 'both' };

/**
 * The attribute block under the photo, in the order the workbook lists it.
 *
 * All ten rows print whether or not the style has a value, blank where it
 * does not. That is what the workbook does, and it is what keeps the block a
 * constant height — so the step chips above it line up across the page
 * however much of this is filled in.
 *
 * Weight is the S/M figure with three other sizes graded from it. It is
 * edited here all the same: the server grades the others when it is saved,
 * with the same ratios as the style editor, so the two cannot disagree.
 */
export const ATTRIBUTES = [
  // Written with a decimal comma. `shown` is what the field holds while it is
  // edited and `parse` turns it back into the point the server stores.
  { key: 'weight_sm', label: 'Weight S/M',
    fmt: (v) => `${commaDecimal(roundFixed(v, 3))} kg`,
    shown: (v) => commaDecimal(roundFixed(v, 3)), parse: pointDecimal,
    suffix: 'kg', field: true, inputMode: 'decimal' },
  // gauge_detail, not gauge: gauge is the character inside the style code.
  // The values already read "3GG", "3B + 3GG", "3GP", so nothing is
  // appended to them.
  { key: 'gauge_detail', label: 'GG (machine)', fmt: String, field: true },
  { key: 'construction', label: 'Construction', fmt: String, field: true },
  { key: 'print_placement', label: 'Printed', fmt: String, field: true },
  { key: 'based_body', label: 'Base body', fmt: String, field: true },
  { key: 'sleeve_category', label: 'Sleeve category', fmt: String, field: true },
  { key: 'sleeve_length', label: 'Sleeve length', fmt: String, field: true },
  // Four values, each with a colour of its own on the sheet. A closed list,
  // so this is a select rather than a suggestion — and the colour shows when
  // printed too, not only while it is being chosen.
  { key: 'length_category', label: 'Length category', fmt: String, field: true,
    choices: ['Cropped', 'Super Cropped', 'Biasa', 'Long'], swatch: true },
  // Seeded from the ends count and changeable. `from` is the fallback: left
  // empty the sheet shows total_ends, and clearing the field puts it back to
  // that rather than to nothing — so the two cannot quietly disagree while
  // still allowing a style whose ply is not simply its ends.
  //
  // total_ends is text and carries things like "1+2" on 45 styles, which the
  // smallint ply column cannot hold. Those show as they stand until someone
  // overrides them with a number.
  { key: 'ply', label: 'Ply', from: 'total_ends', fmt: (v) => `${v} Ply`,
    // The word stays put while the number is edited: it is part of the row's
    // meaning, not something anyone should have to retype or be able to lose.
    suffix: 'Ply', field: true, numeric: true },
  { key: 'yarn_type', label: 'Yarn', fmt: String, field: true, options: 'yarn_codes' },
];

const blank = (v) => v === null || v === undefined || v === '';

export const slug = (value) => String(value ?? '')
  .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const attributesOf = (s) => ATTRIBUTES.map((a) => {
  // The field's own value wins; `from` names where to look when it is empty.
  const own = s[a.key];
  const raw = blank(own) && a.from ? s[a.from] : own;
  return {
    ...a,
    raw: blank(raw) ? '' : raw,
    value: blank(raw) ? '' : a.fmt(raw),
    // True when nothing is stored on the field itself, so the editor can say
    // where the number on screen came from.
    inherited: blank(own) && !blank(raw),
    // The colour a value carries, for the fields that have one.
    swatchClass: a.swatch && !blank(raw) ? `swatch-${slug(raw)}` : '',
  };
});

export default function SheetCard({
  style: s,
  view = 'matrix',
  steps = [],
  wide = false,
  // { yarn_codes: [...] } — suggestions for the fields that have a known
  // vocabulary. Offered, never enforced: a new yarn is used before its
  // colours are entered, and a list that refuses it would send the operator
  // back to the spreadsheet.
  options = {},
  // Repeat colouring, worked out by the caller: the frame is SY, the name
  // highlight is WHS 000.
  frameMark = null,
  nameMark = null,
  // Drag state and handlers, or nothing at all for a card that cannot move.
  drag = null,
  // Present on the Matrix screen: makes the attribute rows editable.
  onEdit = null,
  // Called on double-click, to open the style in its editor.
  onOpen = null,
  // Briefly marked when a link has brought the page to this style.
  focused = false,
}) {
  const classes = ['sheet-card'];
  if (focused) classes.push('is-focused');
  if (wide) classes.push('is-wide');
  if (drag?.isDragging) classes.push('dragging');
  if (drag?.isOver) classes.push('drop-here');
  if (onEdit) classes.push('is-editable');

  return (
    <div className={classes.join(' ')} data-style-id={s.id} {...(drag?.handlers || {})}
      // A double-click inside a field is someone selecting a word, not asking
      // to leave — and leaving would drop the edit before its blur saved it.
      onDoubleClick={onOpen ? (e) => {
        if (e.target.closest('input, select, textarea')) return;
        onOpen(s);
      } : undefined}>
      {drag && (
        <span className="sheet-drag" aria-hidden="true" title={drag.title}>
          <GripVertical size={13} />
        </span>
      )}

      <div className={`sheet-photo${frameMark ? ` mark-${frameMark}` : ''}`}>
        {s.image_path
          ? <img src={s.image_path} alt={s.name} />
          : <Shirt size={38} strokeWidth={1.3} />}
      </div>

      {/* Which channels the style sells through. Kept even when the style
          carries no badge, so the table below starts at the same height on
          every card. */}
      {view === 'sales' && (
        <div className="sheet-badges">
          {CHANNEL_MARK[s.whs_channel] && (
            <span className={`sheet-chan ${CHANNEL_MARK[s.whs_channel]}`}>
              {s.whs_channel}
            </span>
          )}
        </div>
      )}

      <div className={`sheet-name${nameMark ? ` mark-${nameMark}` : ''}`}>
        {s.name}
      </div>

      {view === 'sales' ? (
        <table className="sheet-sales">
          <thead>
            <tr><th /><th>WHS 000</th><th>SY</th></tr>
          </thead>
          <tbody>
            {s.colorways.map((c) => (
              <tr key={c}>
                <th scope="row">{breakable(c)}</th>
                <td>{cell(qty(s, c, 'whs_000'))}</td>
                <td>{cell(qty(s, c, 'sy'))}</td>
              </tr>
            ))}
            {s.colorways.length === 0 && (
              <tr><th scope="row" className="none">no colourways</th><td /><td /></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">TOTAL</th>
              <td>{cell(sum(s, 'whs_000'))}</td>
              <td>{cell(sum(s, 'sy'))}</td>
            </tr>
          </tfoot>
        </table>
      ) : (<>
        <ul className="sheet-colours">
          {s.colorways.map((c) => <li key={c}>{breakable(c)}</li>)}
          {s.colorways.length === 0 && <li className="none">no colourways</li>}
        </ul>

        {/* What has been prepared. Filled means done, the way the workbook
            greys a row in. */}
        {steps.length > 0 && (
          <div className="sheet-steps">
            {steps.map((st) => (
              <span key={st.code}
                className={`sheet-step${s.steps?.[st.code] ? ' done' : ''}`}
                title={st.label}>
                {st.code}
              </span>
            ))}
          </div>
        )}

        <dl className="sheet-attrs">
          {attributesOf(s).map((a) => {
            if (!onEdit || !a.field) {
              return (
                <dd key={a.key}
                  className={[a.value ? '' : 'empty', a.swatchClass]
                    .filter(Boolean).join(' ') || undefined}
                  title={a.label}>
                  {a.value}
                </dd>
              );
            }
            if (a.choices) {
              return (
                <dd key={a.key}
                  className={`editing ${a.swatchClass}`.trim()}
                  title={a.label}>
                  <select
                    className="sheet-attr-input"
                    value={a.raw || ''}
                    aria-label={`${a.label} — ${s.name}`}
                    onChange={(e) => onEdit(s, a.key, e.target.value)}
                  >
                    <option value="">—</option>
                    {/* Anything already stored that is not on the list is
                        offered too, so opening the field cannot silently
                        drop a value somebody meant. */}
                    {(a.choices.includes(a.raw)
                      ? a.choices
                      : [...a.choices, a.raw].filter(Boolean)
                    ).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </dd>
              );
            }
            const shown = a.shown ? a.shown(a.raw) : a.raw;
            return (
              <dd key={a.key}
                className={`editing${a.suffix ? ' has-suffix' : ''}`}
                title={a.label}>
                <input
                  className={`sheet-attr-input${a.inherited ? ' inherited' : ''}`}
                  defaultValue={shown}
                  inputMode={a.inputMode || (a.numeric ? 'numeric' : undefined)}
                  list={a.options ? `${a.options}-list` : undefined}
                  aria-label={`${a.label} — ${s.name}`}
                  placeholder={a.suffix ? '' : a.label}
                  title={a.inherited
                    ? `${a.label} — from the ends count. Type here to override it.`
                    : a.label}
                  // Saved on blur rather than per keystroke: a cell is a
                  // thought, not a stream, and a request per character would
                  // race itself. An untouched inherited value is not saved,
                  // which would turn a fallback into a stored override just
                  // by tabbing past it.
                  onBlur={(e) => {
                    if (e.target.value === String(shown)) return;
                    onEdit(s, a.key, a.parse ? a.parse(e.target.value) : e.target.value);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                />
                {a.suffix && (
                  <span className="sheet-attr-suffix" aria-hidden="true">
                    {a.suffix}
                  </span>
                )}
              </dd>
            );
          })}
        </dl>
      </>)}

      {/* Rendered per card rather than once per page so the card stays
          self-contained; identical ids collapse to one list in the browser. */}
      {onEdit && Object.entries(options).map(([name, values]) => (
        <datalist key={name} id={`${name}-list`}>
          {values.map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}
    </div>
  );
}
