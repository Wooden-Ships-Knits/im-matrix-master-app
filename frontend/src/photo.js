/**
 * Which picture belongs to which colour.
 *
 * A garment has one photo of its own — `styles.photo_url` — and each
 * colourway may have one too (`style_colorways.photo_url`, added in 0033
 * for the SY-AV sheet). The two are not interchangeable: a picture of the
 * garment in BREAKER WHITE says nothing about what it looks like in KHAKI.
 *
 * Except for the first colourway. The main photo IS the first colour's
 * photo — that is what the team shoots and what the main picture is of —
 * so for that one colour the style's photo is not a stand-in, it is the
 * answer. Every other colour shows its own or shows none.
 *
 * FIRST means first in the style's own list (`sort_order`), not first on
 * whatever sheet is drawing it. The SY-AV sheet filters to the colours sold
 * on SY, and if the first colourway is 000-only the colour at the top of
 * that sheet is the SECOND one — which the main photo is not of.
 */
export const colorwayPhoto = (own, isFirst, mainPhoto) => (
  own || (isFirst ? mainPhoto : '') || '');
