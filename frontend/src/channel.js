/**
 * Which channel something sells through — one vocabulary, three readers.
 *
 * A style has it, and so does each of its colourways: a garment sold on both
 * channels can still have one colour that only ever goes to wholesale. The
 * column is the same on both (`whs_channel`), so the words have to be too,
 * or a style and its colours would disagree in a way no screen could show.
 *
 * Stored as the workbook writes it — "BOTH", "SY ONLY", "000 ONLY" — and
 * kept in step with WHS_CHANNELS in backend/app/repo.py, which is what
 * refuses anything else, and with the copy in SheetCard.jsx that the card
 * clicks through. frontend/test/sheet.test.mjs fails if the three drift.
 *
 * Empty is NOT the same as BOTH. It means nobody has said, which is the
 * state most of the imported rows are in; the two are drawn the same on a
 * card on purpose, but only one of them is an answer.
 */
export const channelOf = (sy, whs) => (
  sy && whs ? 'BOTH' : sy ? 'SY ONLY' : whs ? '000 ONLY' : '');

/** The two tick boxes behind a stored channel. The inverse of channelOf. */
export const channelParts = (channel) => ({
  sy: channel === 'BOTH' || channel === 'SY ONLY',
  whs: channel === 'BOTH' || channel === '000 ONLY',
});

/**
 * Whether a colourway may be sold on `which` channel, given what the STYLE
 * sells through.
 *
 * A style that goes to the web store only cannot have a colour that goes to
 * wholesale — the colour would have nowhere to be sold. So that box is shut
 * rather than merely wrong-looking.
 *
 * A style with no channel recorded restricts nothing. Most rows are in that
 * state, and shutting every box on all of them would make the control look
 * broken rather than make anyone fill the style in.
 */
export const styleAllows = (which, styleSy, styleWhs) => {
  if (!styleSy && !styleWhs) return true;        // nothing said, nothing barred
  return which === 'sy' ? !!styleSy : !!styleWhs;
};
