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

/**
 * The channel a colourway actually sells on, stored value or not.
 *
 * A colour of a one-channel garment sells on that channel. There is nowhere
 * else for it to go — which is why the other box is already shut — so a
 * blank here is not "nobody has said", it is "the style already said it".
 *
 * This is a READING, not a write. Nothing fills the column in behind the
 * scenes: narrowing the style by hand does that (cascadeChannel), and this
 * is what makes the 3,582 colourways nobody has touched read correctly in
 * the meantime, on the editor's boxes and on the SY-AV sheet alike.
 *
 * A style on BOTH, or with no channel recorded, inherits nothing: both of
 * those leave the question genuinely open.
 */
export const effectiveChannel = (stored, styleChannel) => {
  if (stored) return stored;
  return styleChannel === 'SY ONLY' || styleChannel === '000 ONLY'
    ? styleChannel : '';
};

/** Whether a stored channel puts the thing on SY at all. */
export const sellsOnSy = (channel) => channel === 'SY ONLY' || channel === 'BOTH';

/**
 * The colours of one Matrix row that belong on the SY-AV sheet.
 *
 * SY-AV is what is available to sell on SY, so it is the colour's OWN
 * channel that decides — not the style's. A garment sold both ways can have
 * one colour that only goes to wholesale, and that colour is not on SY.
 *
 * `withUnset` is the honest escape hatch rather than a guess. A colour with
 * no channel recorded has not been said to be on SY, so it is left off by
 * default — but every one of the 3,582 imported colourways is in that state
 * until somebody fills them in, which would make the sheet empty and look
 * broken. The toggle shows them, and the sheet marks them as unrecorded
 * rather than passing them off as SY.
 *
 * Takes a Matrix row, where the channels arrive as a colour -> word map
 * with the unset colours simply absent (repo.matrix_rows).
 */
export const syColorways = (row, withUnset = false) => (
  (row?.colorways || []).filter((c) => {
    // A colour of a one-channel style inherits it — see effectiveChannel.
    // So the 702 colours of the 301 SY-only styles are on this sheet
    // already, without anybody having filled the column in.
    const channel = effectiveChannel(
      row?.colorway_channels?.[c], row?.whs_channel);
    return channel ? sellsOnSy(channel) : withUnset;
  }));

/**
 * A style narrowed to one channel takes its colours with it — and widening
 * back puts them as they were.
 *
 * Every colour of an SY-only garment sells on SY. Making somebody tick that
 * out fourteen times is how a column stays empty, so narrowing the style to
 * SY ONLY or 000 ONLY sets every colour to the same thing.
 *
 * Widening to BOTH does NOT blanket them with BOTH. BOTH is not a fact
 * about a colour just because it is a fact about the garment — one colour
 * of a two-channel style may well go to wholesale only. So widening
 * restores what each colour was before the narrowing, and a misclick costs
 * nothing. Clearing both boxes restores too: "nobody has said" is as
 * un-single-channel as BOTH is.
 *
 * `memo` is what to put back, or null when nothing is outstanding. Pass the
 * one this returned last time. Three things it deliberately does not do:
 *
 *   * A colour edited by hand AFTER the narrowing keeps that edit — only
 *     colours still holding exactly what the cascade gave them are put
 *     back. A typed answer outranks a remembered one.
 *   * Narrowing twice without widening keeps the FIRST memory: SY ONLY,
 *     then 000 ONLY, then BOTH restores what was there before any of it.
 *   * It is keyed by colourway name, like every other per-colourway call,
 *     so a colour renamed in between is left alone rather than guessed at.
 *
 * Returns the colourways and the new memo. Pure: it decides nothing about
 * when it is called, and it never writes.
 */
export const cascadeChannel = (colorways, channel, memo = null) => {
  const list = colorways || [];
  if (channel === 'SY ONLY' || channel === '000 ONLY') {
    return {
      colorways: list.map((cw) => (
        cw.whs_channel === channel ? cw : { ...cw, whs_channel: channel })),
      // Remembered once, on the way IN. A second narrowing must not
      // overwrite `before` with what the first one set.
      memo: {
        before: memo ? memo.before : Object.fromEntries(
          list.map((cw) => [cw.name, cw.whs_channel || ''])),
        set: channel,
      },
    };
  }
  if (!memo) return { colorways: list, memo: null };
  return {
    colorways: list.map((cw) => (
      cw.whs_channel === memo.set
        ? { ...cw, whs_channel: memo.before[cw.name] ?? '' }
        : cw)),
    memo: null,
  };
};
