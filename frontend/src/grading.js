/**
 * Size grading. Only S/M is measured; the rest follow it.
 *
 * The sheet says so in its own formulas: M/L is =S/M*1.1 and X/L is =M/L*1.1,
 * so 1.21 of S/M. X/S is the one that varies — both 0.9 and 0.92 appear, per
 * style, in every season — so the style carries its own factor.
 *
 * Shared because S/M is entered on the Matrix screen and the graded sizes are
 * shown on the Yarn screen; both need the same arithmetic.
 */
export const SIZE_ORDER = ['X/S', 'S/M', 'M/L', 'X/L'];

const GRADE = { 'S/M': 1, 'M/L': 1.1, 'X/L': 1.21 };

export const gradeOf = (size, xsFactor) =>
  (size === 'X/S' ? Number(xsFactor) : GRADE[size]);

/** Sizes in the order the sizes table gives, falling back to SIZE_ORDER. */
export function orderSizes(sizes, order = SIZE_ORDER) {
  const seq = order && order.length ? order : SIZE_ORDER;
  return [...sizes].sort((a, b) => seq.indexOf(a.size) - seq.indexOf(b.size));
}

/**
 * Re-grade every size off S/M. Returns a new sizes array; it never mutates.
 *
 * Only ever called from an edit, never on load — some styles were adjusted by
 * hand in the sheet and recomputing them on open would quietly change them.
 */
export function regradeSizes(sizes, smValue, factor) {
  return sizes.map((x) => {
    if (x.size === 'S/M') return { ...x, weight_kg: smValue };
    if (smValue === '' || smValue == null) return { ...x, weight_kg: '' };
    const k = gradeOf(x.size, factor);
    if (!k) return x;
    return { ...x, weight_kg: Number((Number(smValue) * k).toFixed(5)) };
  });
}

/** True when a stored weight does not follow the ratios — a hand adjustment. */
export function offRatio(sizes, factor) {
  const sm = sizes.find((x) => x.size === 'S/M');
  const w = sm && sm.weight_kg !== '' && sm.weight_kg != null ? Number(sm.weight_kg) : null;
  if (w == null) return false;
  return sizes.some((x) => {
    const k = gradeOf(x.size, factor);
    if (!k || x.size === 'S/M' || x.weight_kg === '' || x.weight_kg == null) return false;
    return Math.abs(Number(x.weight_kg) - w * k) > 0.0005;
  });
}
