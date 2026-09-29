/**
 * Decimal comma, the way the team writes numbers ("0,240", not "0.240").
 *
 * Only for what is shown and typed. What is stored and sent to the server
 * stays a point, so pointDecimal turns typing back before it is saved — and
 * accepts a point too, so either key works.
 */
export const commaDecimal = (v) =>
  (v === '' || v == null ? '' : String(v).replace('.', ','));

export const pointDecimal = (v) => String(v ?? '').trim().replace(',', '.');

/**
 * Round half up at `dp` decimals and format with exactly that many.
 *
 * toFixed alone gets this wrong. 0.315 * 1.1 is held as 0.34649999999999997,
 * so (0.315 * 1.1).toFixed(3) gives 0.346 where the sheet gives 0.347 — it
 * rounds the binary approximation, which sits just under the halfway point.
 *
 * Shifting the decimal point through exponential notation rounds on the
 * number as written instead, so a trailing 5 goes up the way anyone reading
 * a weight expects.
 */
export function roundFixed(value, dp) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';

  const shifted = Number(`${n}e${dp}`);
  // Numbers already in exponential form (1e-7) make that string unparseable;
  // they are far outside the range this is used for, so fall back.
  if (!Number.isFinite(shifted)) return n.toFixed(dp);

  // Math.round is half-up, but towards +Infinity — mirror it for negatives so
  // -0.5 and 0.5 round the same distance from zero.
  const rounded = (n < 0 ? -1 : 1) * Math.round(Math.abs(shifted));
  const back = Number(`${rounded}e-${dp}`);
  return Number.isFinite(back) ? back.toFixed(dp) : n.toFixed(dp);
}
