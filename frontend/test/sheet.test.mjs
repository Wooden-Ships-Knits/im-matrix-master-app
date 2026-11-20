/**
 * The pure rules the printed sheet depends on.
 *
 *   node frontend/test/sheet.test.mjs        (from the project root)
 *
 * They are read out of PrintSheet.jsx rather than imported, because the file
 * is JSX and this needs no build step to run. The trade is that the test
 * fails loudly if a rule is renamed or moved — which is the point: these are
 * the three places where the sheet can be quietly wrong rather than broken.
 */
import fs from 'fs';

const src = fs.readFileSync('frontend/src/pages/PrintSheet.jsx', 'utf8');
const card = fs.readFileSync('frontend/src/sections/SheetCard.jsx', 'utf8');

const cut = (text, from, to) => {
  const a = text.indexOf(from);
  const b = text.indexOf(to);
  if (a < 0 || b <= a) {
    throw new Error(`"${from}" is no longer where this test looks for it`);
  }
  return text.slice(a, b);
};
const slice = (from, to) => cut(src, from, to);

// In file order, so each slice stops where the next one starts — overlapping
// them declares the same const twice and the import fails with a syntax error
// rather than a useful message. breakable moved to SheetCard.jsx when the
// card became shared, so it is read from there.
const { verdict, byManualOrder, cutPages, breakable, numberCards,
        nextHighlight, HIGHLIGHTS,
        nextColorwayMark, COLORWAY_MARKS,
        RING_MARKS,
        nextColorwayHighlight, COLORWAY_HIGHLIGHTS, litOf } = await import(
  'data:text/javascript,' + encodeURIComponent(
    slice('const verdict =', 'const legendFor')
    + slice('const byManualOrder =', 'const cutPages')
    + slice('const cutPages =', 'const SEASON_NAMES')
    + cut(card, 'export const breakable =', 'export const CHANNEL_MARK')
      .replace('export const', 'const')
    + cut(card, 'export const CHANNEL_MARK', 'export const HIGHLIGHTS')
      .replaceAll('export const', 'const')
    + cut(card, 'export const HIGHLIGHTS', 'export const RING_MARKS')
      .replaceAll('export const', 'const')
    + cut(card, 'export const RING_MARKS', 'export const COLORWAY_HIGHLIGHTS')
      .replaceAll('export const', 'const')
    + cut(card, 'export const COLORWAY_HIGHLIGHTS', 'export const ATTRIBUTES')
      .replaceAll('export const', 'const')
    + '\nexport { verdict, byManualOrder, cutPages, breakable, numberCards,'
    + '          nextHighlight, HIGHLIGHTS,'
    + '          nextColorwayMark, COLORWAY_MARKS,'
    + '          RING_MARKS,'
    + '          nextColorwayHighlight, COLORWAY_HIGHLIGHTS, litOf };'));

let fails = 0;
const is = (got, want, what) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    fails += 1;
    console.log(`FAIL  ${what}\n        got  ${JSON.stringify(got)}`
                + `\n        want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok    ${what}`);
  }
};

console.log('-- the repeat verdict, one channel, threshold 60 --');
is(verdict(true, 60, 60), 'good', 'repeating, sold exactly the threshold');
is(verdict(true, 99, 60), 'good', 'repeating, sold over');
is(verdict(false, 99, 60), 'add', 'not repeating, sold over');
is(verdict(true, 12, 60), 'drop', 'repeating, sold under');
is(verdict(false, 12, 60), null, 'not repeating, sold under leaves no mark');
is(verdict(true, 99, ''), null, 'no threshold set');
is(verdict(true, null, 60), null, 'no sales fetched');
is(verdict(true, 0, 60), 'drop', 'sold zero is an answer, not a blank');
is(verdict(false, 100, '60'), 'add', 'a threshold from the URL is a string');
is(verdict(false, 9, '60'), null, 'string threshold compares as a number');

console.log('\n-- the hand-made card order --');
const ids = (xs) => xs.map((x) => x.id);
const three = [{ id: 1 }, { id: 2 }, { id: 3 }];
is(ids(byManualOrder(three, undefined)), [1, 2, 3], 'no saved order keeps server order');
is(ids(byManualOrder(three, [])), [1, 2, 3], 'empty order keeps server order');
is(ids(byManualOrder(three, [3, 1, 2])), [3, 1, 2], 'a saved order is applied');
is(ids(byManualOrder(three, ['3', '1', '2'])), [3, 1, 2], 'ids compare as strings');
is(ids(byManualOrder(three, [3])), [3, 1, 2], 'unlisted styles follow, in server order');
is(ids(byManualOrder([{ id: 1 }, { id: 4 }], [4, 9, 1])), [4, 1],
   'an id for a style that is gone is ignored');
byManualOrder(three, [3, 1, 2]);
is(ids(three), [1, 2, 3], 'the source array is not mutated');

console.log('\n-- cutting pages by places, not by card count --');
const n = (k) => Array.from({ length: k }, (_, i) => ({ id: i + 1 }));
const shape = (pages) => pages.map((p) => p.map((x) => x.id));
const none = () => false;
is(shape(cutPages(n(4), 10, none)), [[1, 2, 3, 4]], 'fewer than one page');
is(shape(cutPages(n(10), 10, none)).length, 1, 'exactly one page');
is(shape(cutPages(n(11), 10, none)).length, 2, 'one over spills to a second');
is(shape(cutPages(n(4), 4, (x) => x.id === 2)), [[1, 2, 3], [4]],
   'a wide card takes two places');
is(shape(cutPages(n(3), 2, (x) => x.id === 1)), [[1], [2, 3]],
   'a wide card that will not fit starts the next page');
is(shape(cutPages(n(2), 1, () => true)), [[1], [2]],
   'a card wider than a whole page gets its own page rather than looping');
is(shape(cutPages([], 10, none)), [[]], 'an empty collection still prints one page');
is(shape(cutPages(n(3), 0, none)), [[1], [2], [3]], 'a nonsense page size clamps to 1');

console.log('\n-- colour names break at their separators --');
const ZWSP = '\u200B';
is(breakable('WHITE/CASHEW/KHAKI'), `WHITE/${ZWSP}CASHEW/${ZWSP}KHAKI`,
   'a break opportunity after every slash');
is(breakable('BREAKER WHITE'), 'BREAKER WHITE', 'a plain name is untouched');
is(breakable(''), '', 'empty stays empty');
is(breakable(null), '', 'null does not print "null"');
is(breakable(undefined), '', 'undefined does not print "undefined"');
is(breakable('A/B').replace(new RegExp(ZWSP, 'g'), ''), 'A/B',
   'the name reads the same once the invisible characters are dropped');

console.log('\n-- two numbering sequences, side by side --');
const s = (id, channel) => ({ id, whs_channel: channel });
const labels = (xs) => Object.values(numberCards(xs));
is(labels([s(1, 'BOTH'), s(2, '000 ONLY'), s(3, null)]),
   ['1', '2', '3'], 'everything but SY ONLY shares the plain run');
is(labels([s(1, 'SY ONLY'), s(2, 'SY ONLY')]),
   ['S1', 'S2'], 'web-store-only styles get their own run');
is(labels([s(1, 'BOTH'), s(2, 'BOTH'), s(3, '000 ONLY'),
           s(4, 'SY ONLY'), s(5, 'BOTH'), s(6, 'BOTH'),
           s(7, 'SY ONLY'), s(8, 'SY ONLY')]),
   ['1', '2', '3', 'S1', '4', '5', 'S2', 'S3'],
   'the two interleave: 1 2 3 S1 4 5 S2 S3');
is(numberCards([s(9, 'SY ONLY'), s(4, 'BOTH')]), { 9: 'S1', 4: '1' },
   'keyed by style id, so a page can look its own cards up');
is(labels([]), [], 'an empty collection numbers nothing');
is(labels(undefined), [], 'no collection at all does not throw');

console.log('\n-- the highlighter cycles back to none --');
is(HIGHLIGHTS, ['green', 'amber', 'blue'], 'three colours, in order');
is(nextHighlight(''), 'green', 'unmarked goes to the first colour');
is(nextHighlight('green'), 'amber', 'and on to the second');
is(nextHighlight('amber'), 'blue', 'and the third');
is(nextHighlight('blue'), '', 'the last clears it, so a click can undo');
is(nextHighlight(undefined), 'green', 'never set behaves as unmarked');
is(nextHighlight('purple'), 'green', 'a colour that is no longer in the palette restarts');
const walk = [];
let at = '';
for (let i = 0; i < 4; i += 1) { walk.push(at || 'none'); at = nextHighlight(at); }
is(walk, ['none', 'green', 'amber', 'blue'], 'four clicks return to where it started');

console.log('\n-- the colourway pen --');
is(COLORWAY_MARKS, ['red', 'purple', 'magenta', 'blue'], 'four pens, in order');
// The palette depends on the band, because the two lower bands are the two
// channels: a pen should mean the same thing wherever it appears rather than
// depending on which half of the card you are looking at.
is(nextColorwayMark('', 'main'), 'magenta', 'between the lines, the first pen is pink');
is(nextColorwayMark('magenta', 'main'), 'purple', 'then purple');
is(nextColorwayMark('purple', 'main'), '', 'then back to the automatic colour');
is(nextColorwayMark('', 'extra'), 'red', 'below the red line, the first pen is red');
is(nextColorwayMark('red', 'extra'), 'blue', 'then blue');
is(nextColorwayMark('blue', 'extra'), '', 'then back to the automatic colour');
is(nextColorwayMark('red', 'main'), 'magenta',
   'a pen the band does not offer restarts rather than cycling from nowhere');
is(nextColorwayMark(undefined, 'extra'), 'red', 'never set behaves as unpenned');
// Green left the palette: it is now read off the data, not chosen.
is(COLORWAY_MARKS.includes('green'), false, 'green cannot be applied by hand');
is(/new_colorways/.test(card), true, 'the card reads which colours are new');
is(/new_colorways \|\| \[\]\)\.includes\(colour\) \? 'green' : ''/.test(card),
   true, 'and falls back to green only for those');
// A hand pen has to win, or a deliberate mark would be overwritten by a rule —
// but only where its band offers it, or a red name would appear in a band
// whose palette cannot produce one.
is(/const hand = style\?\.colorway_marks\?\.\[colour\]/.test(card), true,
   'a hand-applied pen is read first');
is(/if \(hand && pensFor\(band\)\.includes\(hand\)\) return hand;/.test(card), true,
   'and drawn only where its band offers it');
const repoPens = fs.readFileSync('backend/app/repo.py', 'utf8');
is(/COLORWAY_MARKS = \["red", "purple", "magenta", "blue"\]/.test(repoPens), true,
   'the server stopped accepting green too');
is(/\) AS new_colorways/.test(repoPens), true, 'and computes which colours are new');
// One click per pen the BAND offers, then back to the automatic colour.
for (const [band, offered] of [['main', ['magenta', 'purple']],
                               ['extra', ['red', 'blue']]]) {
  const pens = [];
  let pen = '';
  for (let i = 0; i < offered.length + 1; i += 1) {
    pens.push(pen || 'none'); pen = nextColorwayMark(pen, band);
  }
  is(pens, ['none', ...offered], `${band}: one click per pen, then back to none`);
}

// The card decides the next pen; the server decides which it will accept. If
// those lists drift, a click is refused with no way for the operator to tell
// why — so the lists are compared rather than trusted.
const backend = fs.readFileSync('backend/app/repo.py', 'utf8')
  .match(/COLORWAY_MARKS = \[([^\]]*)\]/)[1]
  .split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
is(backend, COLORWAY_MARKS, 'the backend accepts exactly the pens the card offers');

// A CSS rule per pen, or a colour silently renders as ordinary text.
const css = fs.readFileSync('frontend/src/styles.css', 'utf8');
is(COLORWAY_MARKS.filter((m) => !css.includes(`.pen-${m}`)), [],
   'every pen has a colour to render in');

console.log('\n-- the ring round a past-season circle --');
is(RING_MARKS, ['yellow', 'orange'], 'two rings');
// The ring stopped being something you click. Orange is read off the season
// links; a circle that could also be clicked would let a hand-set ring sit
// under a derived one with nothing to say which was showing.
is(/repeats_two_past \? ' ring-orange' : ''/.test(card), true,
   'orange is derived from the links');
is(/nextRingMark/.test(card), false, 'nothing cycles a ring any more');
is(/sheet-next-dot[\s\S]{0,400}?<button/.test(card), false,
   'the circles are not buttons');
// Yellow has no rule to fire on yet, and must not be drawn by guesswork.
is(/ring-yellow/.test(card), false,
   'yellow is reserved, not drawn — its rule is still open');
// The backend must not accept one either.
const repoRings = fs.readFileSync('backend/app/repo.py', 'utf8');
is(/RING_KEYS/.test(repoRings.replace(/#[^\n]*/g, '')), false,
   'the API no longer takes a written ring');
is(/\) AS repeats_two_past/.test(repoRings), true,
   'and computes the two-season repeat instead');

const ringBackend = fs.readFileSync('backend/app/repo.py', 'utf8')
  .match(/RING_MARKS = \[([^\]]*)\]/)[1]
  .split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
is(ringBackend, RING_MARKS, 'the backend accepts exactly the rings the card offers');
is(RING_MARKS.filter((m) => !css.includes(`.sheet-next-dot.ring-${m}`)), [],
   'every ring has a rule to render in');
// The ring must not be a border: a filled circle sets border-color from a
// three-class selector, which beats the ring's two and silently repaints it.
is(RING_MARKS.filter((m) => {
  const rule = css.slice(css.indexOf(`.sheet-next-dot.ring-${m}`));
  return /^[^}]*border\s*:/.test(rule.slice(0, rule.indexOf('}')));
}), [], 'no ring is drawn as a border, where the channel edge would win');

console.log('\n-- the background behind a colourway name --');
is(COLORWAY_HIGHLIGHTS, ['yellow', 'grey'], 'two backgrounds, no third');
is(litOf(null), 'yellow', 'a row never touched reads as yellow');
is(litOf(undefined), 'yellow', 'so does one with nothing stored');
is(litOf('grey'), 'grey', 'a stored value is used as it stands');
is(litOf('teal'), 'yellow', 'a value no longer in the palette falls back');
is(nextColorwayHighlight(''), 'grey', 'the first click switches to grey');
is(nextColorwayHighlight('yellow'), 'grey', 'yellow switches to grey');
is(nextColorwayHighlight('grey'), 'yellow', 'and grey back to yellow');
is([nextColorwayHighlight(''), nextColorwayHighlight('grey')].includes(''), false,
   'it never switches to nothing — every row keeps a background');

const litBackend = fs.readFileSync('backend/app/repo.py', 'utf8')
  .match(/COLORWAY_HIGHLIGHTS = \[([^\]]*)\]/)[1]
  .split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
is(litBackend, COLORWAY_HIGHLIGHTS,
   'the backend accepts exactly the backgrounds the card offers');
is(COLORWAY_HIGHLIGHTS.filter((m) => !css.includes(`.sheet-colours li.lit-${m}`)), [],
   'every background has a rule to render in');
// The pen writes colour and the background writes background; if either took
// the other's property the two marks could not be seen at once.
is(COLORWAY_MARKS.filter((m) => {
  const rule = css.slice(css.indexOf(`.pen-${m}`));
  return /background/.test(rule.slice(0, rule.indexOf('}')));
}), [], 'no pen paints a background, which would hide the highlight');
// pen- and mark- must stay apart: mark- is the repeat verdict.
is(COLORWAY_MARKS.filter((m) => css.includes(`.sheet-colours li.mark-${m}`)), [],
   'no pen still answers to the verdict prefix');

// A pen rule is a single class, so any rule that also sets `color` on a
// colourway name with more than one selector will out-rank it and the pen
// silently does nothing. This is how it broke on the sales table.
const holders = ['.sheet-sales tbody th', '.sheet-colours li'];
is(holders.filter((selector) => {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return false;
  const body = css.slice(at, css.indexOf('}', at));
  return /(^|[;{\s])color\s*:/.test(body);
}), [], 'nothing pins the colour of a colourway name over its pen');

// ---------------------------------------------------------------------------
// The typeahead's limit has to survive the trip.
//
// StyleJump asked for eight and sliced to eight, but GET /api/styles took no
// `limit` at all — so a two-letter query downloaded 803 styles (109kB) to draw
// eight lines. The client was right and nothing told it otherwise, which is
// the failure worth pinning: a query parameter FastAPI does not declare is
// dropped in silence.
const jump = fs.readFileSync('frontend/src/sections/StyleJump.jsx', 'utf8');
const route = fs.readFileSync('backend/app/routers/styles.py', 'utf8');
const repoSrc = fs.readFileSync('backend/app/repo.py', 'utf8');

const asksFor = [...jump.matchAll(/api\.listStyles\(\s*\{([^}]*)\}/g)]
  // `{ q, limit: 8 }` — shorthand and `key:` both count as asking for it.
  .flatMap((m) => m[1].split(',').map((part) => part.split(':')[0].trim()))
  .filter(Boolean)
  .filter((k, i, all) => all.indexOf(k) === i)
  .sort();
is(asksFor, ['limit', 'q'], 'the typeahead asks for a query and a limit');

const listRoute = route.slice(route.indexOf('def list_styles('));
const declared = listRoute.slice(0, listRoute.indexOf('):'));
is(asksFor.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(declared)), [],
   'the route declares every parameter the typeahead sends');

// Declaring it is not enough — it has to be handed on, and then used.
is(/repo\.list_styles\([^)]*limit=limit/.test(listRoute), true,
   'the route passes the limit to the repo');
const listRepo = repoSrc.slice(repoSrc.indexOf('def list_styles('));
is(/\bif limit:\s*\n\s*sql \+= " LIMIT %s"/.test(listRepo), true,
   'the repo turns the limit into a LIMIT clause');

// Browse shares this endpoint and wants the whole list, so the limit must
// stay optional: a default would truncate that page without saying so.
is(/def list_styles\([^)]*\blimit=None\b/.test(listRepo), true,
   'the limit is optional, so Browse still gets every row');
is(/limit: int \| None = Query\(None/.test(declared), true,
   'the route defaults the limit to none as well');

// ---------------------------------------------------------------------------
// The channel and the two tick boxes are one fact written twice.
//
// Clicking the card's number set whs_channel and left sell_sy/sell_000 alone,
// so the card said "000 ONLY" while the editor showed both boxes ticked. The
// backend now derives the pair; what must not drift is the set of channels
// the card offers and the set the mapping covers.
const repoChan = fs.readFileSync('backend/app/repo.py', 'utf8');
const mapped = [...repoChan.matchAll(/^\s*"([^"]+)":\s*\((True|False),\s*(True|False)\),/gm)]
  .map((m) => m[1]);
is(mapped, ['BOTH', '000 ONLY', 'SY ONLY'],
   'every channel has a tick-box pair, in the cycle order');

const offered = /WHS_CHANNELS = \[([^\]]*)\]/.exec(repoChan)[1]
  .split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
is(offered.filter((c) => !mapped.includes(c)), [],
   'no channel can be set that the tick boxes do not know about');
is(mapped.filter((c) => !offered.includes(c)), [],
   'and nothing is mapped that cannot be set');

// The pairs themselves, as 1,207 imported styles have them.
const pairs = Object.fromEntries(
  [...repoChan.matchAll(/^\s*"([^"]+)":\s*\((True|False),\s*(True|False)\),/gm)]
    .map((m) => [m[1], [m[2] === 'True', m[3] === 'True']]));
is(pairs['BOTH'], [true, true], 'BOTH sells through both');
is(pairs['000 ONLY'], [false, true], '000 ONLY sells through 000 alone');
is(pairs['SY ONLY'], [true, false], 'SY ONLY sells through SY alone');

// Writing the channel has to write the flags in the same statement.
is(/if key == "whs_channel" and text:[\s\S]{0,400}?sell_sy = %s[\s\S]{0,200}?sell_000 = %s/
   .test(repoChan), true,
   'setting the channel sets both flags');

// The Channel is a readout now, not a second way to set the same fact.
const editor = fs.readFileSync('frontend/src/pages/StyleEditor.jsx', 'utf8');
is(/whs_channel: v,/.test(editor), false,
   'nothing in the editor sets the channel directly any more');
is(/<Field label="Channel"[\s\S]{0,400}?chan-readout/.test(editor), true,
   'the Channel field renders a readout');
is(/channelOf\(form\.sell_sy, form\.sell_000\)/.test(editor), true,
   'and derives it from the tick boxes on screen');
// The server has the same rule, so a row written another way still agrees.
is(/WHEN sell_sy AND sell_000 THEN 'BOTH'[\s\S]{0,200}?WHEN sell_000\s+THEN '000 ONLY'[\s\S]{0,200}?WHEN sell_sy\s+THEN 'SY ONLY'/
   .test(repoChan), true,
   'the server derives the channel from the flags the same way');

// Every call goes through request(), which is what attaches the token.
//
// deleteReport did not — it called fetch directly, sent no Authorization
// header, and so was refused by the write guard every time, for everyone. It
// read as a broken button. One bare fetch is all it takes.
const apiSrc = fs.readFileSync('frontend/src/api.js', 'utf8');
const bare = [...apiSrc.matchAll(/^.*\bfetch\(/gm)]
  .map((m) => m[0].trim())
  // The one inside request() is the real one; everything else is a bypass.
  .filter((line) => !line.startsWith('const res = await fetch('));
is(bare, [], 'nothing calls fetch directly — they would send no token');

is(/if \(res\.status === 204\) return null;/.test(apiSrc), true,
   'a 204 is handled, so a no-body route needs no bare fetch of its own');
is(/res\.status === 401 && !url\.startsWith\('\/api\/auth\/'\)/.test(apiSrc), true,
   'a 401 signs you out, except on the sign-in call itself');

// A rename has to be written down in both places or they drift.
//
// The panel is what people read; product_identifiers and name_history are what
// _sales_index reads. Recording one without the other is how a rename looks
// handled and still loses its sales.
const repoSrc2 = fs.readFileSync('backend/app/repo.py', 'utf8');
is(/_record_rename\(cur, style_id, "style"/.test(repoSrc2), true,
   'renaming a style is recorded');
is(/_record_rename\(cur, style_id, "colorway"/.test(repoSrc2), true,
   'renaming a colourway is recorded');
is(/INSERT INTO product_identifiers[\s\S]{0,300}?'style_name'/.test(
     repoSrc2.slice(repoSrc2.indexOf('def _record_rename'))), true,
   'a style rename also files the old name as an identifier');
is(/scope = 'colorway'/.test(repoSrc2.slice(repoSrc2.indexOf('def _sales_index'))), true,
   'the matcher reads old colour names too');
// Read the old name before the UPDATE, or there is nothing left to record.
const saveBody = repoSrc2.slice(repoSrc2.indexOf('def save_style'));
is(saveBody.indexOf('SELECT style_name FROM styles WHERE id') <
   saveBody.indexOf('UPDATE styles SET'), true,
   'the old name is read before it is overwritten');

// Cards sit side by side in a row, so the colourway list has to cost the same
// height for the same content — otherwise the attribute table, the steps and
// the weight below it stop lining up across the row.
//
// An add bar and a colour row are the same height, and the sample band shows
// its colour OR its add bar and never both, so a sample colour is free.
is(/\.mx-sheet \.sheet-colours li \{[^}]*min-height/.test(css), true,
   'every row in the list has the same minimum height');
// Three things can fill a row and all three must be the same height, or the
// rules sit at different heights from card to card. The name field is the one
// that was deciding it: font: inherit at 0.72rem x 1.35 is taller than either
// button.
is(['sheet-colour-name', 'sheet-colour-add button', 'sheet-colour-pad']
   .filter((sel) => !new RegExp(
     `\\.mx-sheet \\.${sel.replace(' ', ' .?')} \\{[^}]*height: 1[46]px`).test(css)),
   [], 'the field, the add button and a spacer are all pinned to one height');
// The rule that used to reserve height for an empty band is gone, because a
// band is never empty while editing — it has its add bar.
is(/sheet-colours\.band-[a-z]+:empty/.test(css), false,
   'nothing reserves height for a band that cannot be empty');
is(/export const ZONE_LIMIT = \{ sample: 1 \}/.test(card), true,
   'the sample band holds one colour, which is what makes it free');


// ---- TAG: the colourway naming scheme ----
// A field the card writes has to be a field the server accepts, a column the
// database has, and a column the row query returns. Those are four files, and
// three of the four failing silently is what a free-text cell does: the save
// 400s into a toast, or saves and comes back blank on the next load.
console.log('\n-- the colourway tag --');
const tagRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const tagMig = fs.readFileSync(
  'backend/migrations/versions/0025_colorway_tag.py', 'utf8');

is(/ADD COLUMN colorway_tag text/.test(tagMig), true,
   'the column is added by a migration');
is(/s\.colorway_tag,/.test(tagRepo), true,
   'and the Matrix row query returns it');
is(/_MATRIX_KEYS = [\s\S]{0,300}?"colorway_tag"/.test(tagRepo), true,
   'and the patch route accepts it, so the card can save it');
is(/onEdit\(s, 'colorway_tag', next\)/.test(card), true,
   'which is the key the card sends');

// Upper case is settled by the server, not by whoever types: "c1" and "C1"
// are the same scheme, and two spellings of it would read as two.
const tagUpper = cut(tagRepo, 'def update_matrix_fields', 'def set_matrix_order');
is(/if key == "colorway_tag":[\s\S]{0,400}?text = text\.upper\(\)/.test(tagUpper),
   true, 'the server upper-cases the tag');
is(tagUpper.indexOf('text = text.upper()') < tagUpper.indexOf('if text == "":'),
   true, 'before the empty check, so clearing a tag still clears it');

// Where it sits decides what it means: the names it labels are the ones
// below it, so it belongs under the repeat line and above the first band.
is(card.indexOf("'EXACT REPEAT' : 'NEW'") < card.indexOf('className={`sheet-tag')
   && card.indexOf('className={`sheet-tag') < card.indexOf('COLORWAY_ZONES.map'),
   true, 'and it is drawn between the repeat line and the colour bands');

// Most styles have no tag yet. If the row only existed on the ones that do,
// every rule below it would sit at a different height from card to card —
// which is the alignment that took three goes to get right above.
is(/\.sheet-tag \{[^}]*height:/.test(css), true,
   'the row has a height of its own, held whether or not there is a tag');
is(/\.mx-sheet \.sheet-tag \{[^}]*height: \d+px/.test(css), true,
   'including on the Matrix screen, which sets its own');
// The field fills that height rather than setting a second one: two owners
// for the same height is how the colourway rows drifted.
is(/\.sheet-tag-input \{[^}]*height: 100%/.test(css), true,
   'and the input fills it instead of deciding it');
is(/\.sheet-tag-input \{[^}]*height: \d+px/.test(css), false,
   'the input never sets its own');


// The TAG field offers a list but is not limited to it. Four files have to
// agree on the list's name, and one of them must NOT validate against it.
console.log('\n-- the tag list --');
const tagRoutes = fs.readFileSync('backend/app/routers/matrix.py', 'utf8');
const tagApi = fs.readFileSync('frontend/src/api.js', 'utf8');
const tagPage = fs.readFileSync('frontend/src/pages/Matrix.jsx', 'utf8');

is(/COLORWAY_TAGS = \["C1", "C1\/C2", "C1\/C2\/C3", "C1 MARL", "C1 STRIPE"\]/
   .test(tagRepo), true, 'the five known schemes are the seed list');
is(/@router\.get\("\/colorway-tags"\)/.test(tagRoutes), true,
   'and a route serves them');
is(/colorwayTags: \(\) => request\('\/api\/matrix\/colorway-tags'\)/.test(tagApi),
   true, 'at the path the client asks for');
is(/prefix="\/api\/matrix"/.test(tagRoutes), true,
   'which is the prefix that route actually sits under');
is(/colorway_tags: colorwayTags/.test(tagPage), true,
   'the Matrix page passes the list to the card');
is(/list="colorway_tags-list"/.test(card), true,
   'and the field reads the datalist of that name');

// Open, not closed. matrix_band and matrix_highlight are checked against
// their lists and the tag deliberately is not: the scheme somebody needs is
// the one that is not on the list yet, and a refusal sends it to the notes.
is(/if key == "colorway_tag"[\s\S]{0,400}?not a (tag|colourway scheme)/.test(tagUpper),
   false, 'nothing refuses a tag that is not on the list');
is(/COLORWAY_TAGS/.test(tagUpper), false,
   'the save path does not even look at the list');
// Which is only safe if the list grows by itself — otherwise the five would
// be the vocabulary forever.
is(/def colorway_tags[\s\S]{0,900}?FROM styles[\s\S]{0,400}?COLORWAY_TAGS \+ \[/
   .test(tagRepo), true, 'the list is the seed plus whatever is in use');


// ---- Importing a style into a new season ----
// The whole point of the feature is that the copy and the LINK are one
// action, because the link is the step people forget and it is the step the
// sales report reads. Everything here guards that, or guards what the copy
// is allowed to bring with it.
console.log('\n-- importing an existing style --');
const impRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const impRoute = fs.readFileSync('backend/app/routers/styles.py', 'utf8');
const impApi = fs.readFileSync('frontend/src/api.js', 'utf8');
const impPage = fs.readFileSync('frontend/src/pages/Matrix.jsx', 'utf8');
const impUi = fs.readFileSync('frontend/src/sections/ImportStyle.jsx', 'utf8');
const impBody = cut(impRepo, 'def import_style(', 'def _append_to_matrix_order');

// The link. The copy takes the source's product at insert, which IS being
// linked — related_styles joins on product_id. If this ever became
// "create, then call link_styles", link_styles' merge would move
// product_identifiers between products but not product_colorways, orphaning
// the colour identities the sales matcher reads.
is(/_ensure_product\(cur, source_id\)/.test(impBody), true,
   'the source is given a product if it has none');
is(/values\["product_id"\] = product_id/.test(impBody), true,
   'and the copy shares it, which is what being linked means');
// A CALL, not the word: the docstring explains why link_styles is avoided,
// and a test that forbade naming it would forbid saying why.
is(/link_styles\(/.test(impBody), false,
   'nothing re-links afterwards, which would merge two products into one');

// The number. 239 of 267 linked products carry one number across every
// season; the copy is the same garment, so it carries the source's.
is(/"style_number"/.test(cut(impRepo, '_IMPORT_SKIP = {', 'def _import_columns')),
   false, 'the style number is NOT skipped — the copy keeps it');

// What must not come across. Prices are renegotiated, the checklist records
// work nobody has done for the new season, and the marks are this season's.
const skipped = cut(impRepo, '_IMPORT_SKIP = {', 'def _import_columns');
is(['whls_line_price_usd', 'whls_retail_price_usd', 'sy_retail_price_usd',
    'final_sale_price_usd', 'price_000', 'notes', 'matrix_order',
    'matrix_highlight', 'matrix_band', 'past_sy_mark', 'past_000_mark']
   .filter((c) => !skipped.includes(`"${c}"`)),
   [], 'prices, notes, position and the pen marks are all left behind');
// style_steps is the checklist. It is not copied because nothing copies it —
// there is no INSERT INTO style_steps in the import at all.
is(/INSERT INTO style_steps/.test(impBody), false,
   'and the checklist is not copied, so nothing claims work that was not done');
// The sheet hides drafts, so a copy left as one would vanish from the page
// that made it — the same trap addStyle documents.
is(/values\["status"\] = "active"/.test(impBody), true,
   'the copy is active, not a draft that the sheet would filter out');

// The bill of materials hangs off style_colorways.id, so the old-to-new map
// has to be exact. INSERT ... SELECT ... RETURNING does not promise to hand
// ids back in the SELECT's order, which would hang each colour's yarns off
// the wrong colour — with every count still matching.
is(/INSERT INTO style_colorways[\s\S]{0,400}?VALUES \(%s, %s/.test(impBody), true,
   'colourways are inserted one at a time, so each new id is known');
is(/INSERT INTO style_colorways[\s\S]{0,400}?SELECT/.test(impBody), false,
   'never as one INSERT ... SELECT, whose RETURNING order is not promised');
is(/INSERT INTO colorway_yarns/.test(impBody), true, 'the BOM comes across');
is(/product_colorway_id/.test(impBody), true,
   'and each colour keeps its identity on the shared product');

// The name has to be filed for the new season or no sales line can find it.
is(/INSERT INTO product_identifiers[\s\S]{0,200}?'style_name'/.test(impBody), true,
   'the new season\u2019s name is filed against the product');
is(/_append_to_matrix_order\(cur, new_id\)/.test(impBody), true,
   'and the copy lands last in its collection, where the slot that made it sits');

// The deny-list copies every new styles column automatically — including
// types the dynamic INSERT cannot bind. design_marks (jsonb, 0026) came
// back from psycopg as a dict and 500'd EVERY import for a day, because a
// bare dict cannot be a %s parameter. The values are re-wrapped as Jsonb,
// so the next jsonb column is carried instead of crashing.
is(/Jsonb\(values\[c\]\) if isinstance\(values\[c\], \(dict, list\)\)/.test(impBody),
   true, 'a jsonb column survives the copy instead of 500ing it');
is(/from psycopg\.types\.json import Jsonb/.test(impRepo), true,
   'with the real adapter, not a json.dumps that would double-encode');

// Wiring, four files.
is(/@router\.post\("\/\{style_id\}\/import"/.test(impRoute), true, 'a route serves it');
is(/request\(`\/api\/styles\/\$\{id\}\/import`/.test(impApi), true,
   'at the path the client posts to');
is(/api\.importStyle\(chosen\.id,/.test(impUi), true,
   'the dialog imports FROM the style that was picked');
is(/import \{ api \} from '\.\.\/api\.js'/.test(impUi), true,
   'and imports api the way api.js exports it — a default import is undefined');
is(/<ImportStyle/.test(impPage) && /setImportInto\(g\.name\)/.test(impPage), true,
   'the add slot opens it, passing the collection it sits in');


// ---- The Pricing Matrix ----
console.log('\n-- the pricing matrix --');
const pxRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const pxPage = fs.readFileSync('frontend/src/pages/Matrix.jsx', 'utf8');
const pxCard = fs.readFileSync('frontend/src/sections/PriceCard.jsx', 'utf8');

// A price is a decimal. _MATRIX_NUMERIC parses with int(float(text)), which
// would turn $115.50 into $115 and hand it back as if that was what was
// typed — so the money columns need their own branch, before that one.
const pxSave = cut(pxRepo, 'def update_matrix_fields', 'def set_matrix_order');
is(/if key in _MATRIX_MONEY:[\s\S]{0,200}?_num\(text\)/.test(pxSave), true,
   'prices are parsed as decimals, not rounded to whole dollars');
is(pxSave.indexOf('_MATRIX_MONEY') < pxSave.indexOf('_MATRIX_NUMERIC'), true,
   'and that branch is reached before the whole-number one');
is(/_MATRIX_MONEY \| \{"finishing_location", "style_number"\}/.test(pxRepo), true,
   'the pricing block is writable, so the sheet can be filled in');
// Reading it back matters as much: a column the card shows but the row query
// does not return is a card that is blank for everyone.
// Scoped to matrix_rows: the same columns are selected by the costing query
// too, so an unscoped search would pass with the sheet's own SELECT gutted.
const pxRows = cut(pxRepo, 'def matrix_rows(', 'def _sales_index(');
is(['whls_line_price_usd', 'whls_retail_price_usd', 'finishing_location',
    'price_000', 'style_number', 'admin_pct']
   .filter((c) => !new RegExp(`s\\.${c},`).test(pxRows)),
   [], 'and every one of those columns comes back on the row');

// The switch, not a third tab: Attributes and Layout are two views of the
// Matrix Master, and the Pricing Matrix is not a third view of it.
is(/sheet === 'pricing'/.test(pxPage), true, 'the page knows which sheet it is on');
is(/\{season && sheet === 'master' && \(\s*\n\s*<div className="rep-tabs"/.test(pxPage),
   true, 'Attributes and Layout belong to the Matrix Master only');
// Left where it was, rather than reset: coming back to the Matrix Master
// should land on the tab it was left on.
is(/setSheet\('pricing'\)[\s\S]{0,80}?setTab\(/.test(pxPage), false,
   'switching sheets does not reset which tab the master is on');
is(/\['sheet', sheet === 'pricing'/.test(pxPage), true,
   'and the sheet is in the URL, so a link opens the right one');

// Same blocks and same numbers as the layout sheet, because a price is
// looked up by where the garment sits.
is(/\{sheet === 'pricing' && groups\.map/.test(pxPage), true,
   'the pricing sheet draws the same groups as the layout sheet');
is(/index=\{g\.numbers\[r\.id\]\}/.test(pxPage), true,
   'with the same card numbering');

// The rows are data because the workbook could not say what they are: the
// F27 template is ruled, styled, and empty of prices.
is(/export const PRICING_ROWS = \[/.test(pxCard), true,
   'the row stack is a list, so settling it is editing data not the card');
is(/rows = PRICING_ROWS/.test(pxCard), true, 'and the card renders from it');


// ---- The Design sheets ----
console.log('\n-- the design sheets --');
const dsRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const dsRoute = fs.readFileSync('backend/app/routers/matrix.py', 'utf8');
const dsApi = fs.readFileSync('frontend/src/api.js', 'utf8');
const dsPage = fs.readFileSync('frontend/src/pages/Design.jsx', 'utf8');
const dsHome = fs.readFileSync('frontend/src/pages/Home.jsx', 'utf8');
const dsApp = fs.readFileSync('frontend/src/App.jsx', 'utf8');
const dsBody = cut(dsRepo, 'def design_rows(', 'def _sales_index(');

// PLY on the sheet is ENDS in the workbook is `ends` in the table. Three
// names for one number, and reading the wrong column would print a
// percentage where a strand count belongs.
is(/"ply": None if r\["ends"\] is None else float\(r\["ends"\]\)/.test(dsBody), true,
   'PLY is read off colorway_yarns.ends, not percent');
is(/cy\.slot/.test(dsBody) && /yc\.name AS yarn/.test(dsBody), true,
   'and the slot and the yarn come from the bill of materials');
// A colourway with no BOM still gets a column: an empty column says nobody
// filled it in, a missing one says nothing at all.
is(/if cw and cw not in st\["colorways"\]/.test(dsBody), true,
   'a colourway with no yarns still gets a column');
is(dsBody.indexOf('st["colorways"].append(cw)')
   < dsBody.indexOf('if r["slot"] is None'), true,
   'which means the column is added before the no-slot row is skipped');
// The sheets print in sheet order, same as every other view of a collection.
is(/ORDER BY s\.matrix_order NULLS LAST, s\.style_name/.test(dsBody), true,
   'sheets come back in the order the layout sheet has them');

// A trim in a yarn slot is marked. Without it the PLY above a button reads
// as a strand count — and 25 of the 251 cells in F26/COTTON are trims.
is(/"trim": _is_trim\(r\["yarn"\]\)/.test(dsBody), true,
   'each cell says whether it is a trim rather than a yarn');
is(/_TRIM_PREFIX = \("XZIP", "XB", "XSNAP"/.test(dsRepo), true,
   'by name prefix, which is the only signal that separates them');
is(/v\.trim && <span className="design-trim">/.test(dsPage), true,
   'and the sheet says so on the cell');

is(/@router\.get\("\/design"\)/.test(dsRoute), true, 'a route serves them');
is(/request\(`\/api\/matrix\/design\?\$\{qs\}`\)/.test(dsApi), true,
   'at the path the client asks for');
is(/<Route path="\/design" element=\{<Design \/>\} \/>/.test(dsApp), true,
   'the route is mounted');
is(/to="\/design"/.test(dsHome) && /Design<\/span>/.test(dsHome), true,
   'and the home page has a Design tile pointing at it');

// The sheet writes exactly one thing: where the markers sit. The yarns and
// their ply stay editable only in the style editor, because a second place to
// edit the same thing is a second place to get it wrong.
const dsSheet = cut(dsPage, 'export function DesignSheet',
                    'export default function Design');
is(['whls', 'ply:', 'yarn:', 'updateMatrix', 'saveStyle']
   .filter((w) => dsSheet.includes(`api.${w}`) || dsSheet.includes(`onEdit(`)),
   [], 'the sheet never writes a yarn or a ply');
is(/fn\?\.\(style, next\)/.test(dsSheet), true,
   'and the one thing it does write is the marker arrangement');

// ---- the slot markers ----
const mkMig = fs.readFileSync(
  'backend/migrations/versions/0026_design_marks.py', 'utf8');
const mkBody = cut(dsRepo, 'def set_design_marks(', '# Names that are not yarn');
is(/ADD COLUMN design_marks jsonb/.test(mkMig), true, 'a migration adds the store');
is(/"design_marks": r\["design_marks"\] or \{\}/.test(dsBody), true,
   'the sheet is given them with the rest of the row');
is(/@router\.put\("\/design\/\{style_id\}\/marks"\)/.test(dsRoute), true,
   'a route writes them');
is(/request\(`\/api\/matrix\/design\/\$\{styleId\}\/marks`/.test(dsApi), true,
   'at the path the client puts to');
// Fractions, not pixels. The sheet is read on a screen and printed on paper
// at different sizes, and a pixel offset that was on the yoke in the browser
// would be somewhere else on the page.
is(/min\(max\(x, 0\.0\), 1\.0\)/.test(mkBody), true,
   'positions are clamped into 0..1, so they are fractions of the photo');
is(/x - box\.left\) \/ box\.width/.test(dsSheet), true,
   'and the sheet measures them against the photo, not the page');

// The drag itself. A pointermove fires dozens of times a second and this
// sheet can be a 17-row table four colourways wide, so the live position is
// written to the DOM rather than put through state — the first version put
// it in state and the drag waded.
is(/const drag = useRef\(null\)/.test(dsSheet), true,
   'the live drag is a ref, so a move does not re-render the table');
// The guard is part of the assertion: `if (g)` reaching the DOM is the
// behaviour, and a test that only looked for the assignment passed happily
// with it sitting behind `if (false)`.
is(/if \(g\) g\.style\.transform = `translate\(\$\{d\.x\}px, \$\{d\.y\}px\)/
   .test(dsSheet), true,
   'and the label being dragged is positioned straight on the element');
is(/setAt\(/.test(dsSheet), false, 'nothing sets pointer position into state');
// Only the press is on the label. Everything after it is on the window,
// because a label moves between the photo and the tray mid-drag, and a
// handler that travels with it does not survive the move.
is(/onPointerDown=\{begin\(slot\)\}/.test(dsSheet), true,
   'the label starts the drag');
is(/onPointerMove=|onPointerUp=|onPointerCancel=/.test(dsSheet), false,
   'and holds none of the rest of it');
is(/trackPointer\(window, \{\s*onMove, onUp: finish, onBail: end,/.test(dsSheet), true,
   'which the window owns instead');
// setPointerCapture looked like it did this job and did not: capture is
// released without warning when the element re-renders elsewhere in the
// tree, the pointerup never arrived, and the label froze mid-air.
// A CALL, not the word: trackPointer's comment explains why capture is not
// used, and a test that forbade naming it would forbid saying why.
is(/setPointerCapture\(/.test(dsPage), false,
   'nothing relies on pointer capture, which is what froze the drag');
// A press that does not travel is a click. Without this, clicking a placed
// label to read it would unplace it.
is(/const SLOP = 4/.test(dsSheet) && /if \(!d \|\| !d\.moved\) return;/.test(dsSheet),
   true, 'a click is not a drag, so it changes nothing');
is(/offX: e\.clientX - \(box\.left \+ box\.width \/ 2\)/.test(dsSheet), true,
   'the label keeps the point it was grabbed by instead of jumping to centre');
// Every way a drag can end has to take the listeners off, or the next one
// runs on top of it. The render tests exercise all five for real.
const dsTrack = cut(dsPage, 'export const trackPointer', '/** PLY prints');
is(['pointermove', 'pointerup', 'pointercancel', 'blur', 'keydown']
   .filter((k) => !(dsTrack.includes(`addEventListener('${k}'`)
                    && dsTrack.includes(`removeEventListener('${k}'`))),
   [], 'every listener the drag adds is one it also removes');
is(/e\.key === 'Escape'/.test(dsTrack), true, 'and Escape abandons it');
is(/let off = false;[\s\S]{0,80}?if \(off\) return;/.test(dsTrack), true,
   'detaching twice is safe, because several of those paths can race');
is(/useEffect\(\(\) => \(\) => \{ detach\.current\?\.\(\); \}, \[\]\)/.test(dsSheet),
   true, 'and leaving the page mid-drag leaves nothing behind');
// Dragging out of the tray and dropping nowhere is not a change.
is(/if \(!on && !\(key in now\)\) return;/.test(dsSheet), true,
   'a drag that lands nowhere saves nothing');
// The window listeners outlive several renders, so reading marks from their
// closure would read whatever it was when the drag began.
is(/latest\.current = \{ marks, onMarks, style: s \}/.test(dsSheet), true,
   'and the drop reads the marks as they are now, not as the drag began');
// A drag that ends a pixel past the edge is a drag to the edge. Failing it
// would lose the whole arrangement over something nobody can see.
is(/raise ValueError/.test(mkBody) && !/x > 1|y > 1/.test(mkBody), true,
   'an out-of-range position is clamped, not refused');
// Only the slots the style actually uses get a marker — the count the user
// asked for is "the max rows of this style's BOM sequence".
is(/const placed = slots\.filter/.test(dsSheet)
   && /const waiting = slots\.filter/.test(dsSheet), true,
   'markers come from the style\u2019s own slots, so a stale one draws nothing');


// Zoom. The markers are fractions of the photo, so they follow it up — but
// only while the element they are measured against is the one that scales.
is(/width: `\$\{Math\.round\(PHOTO_WIDTH \* zoom\)\}px`/.test(dsSheet), true,
   'zoom scales the element the markers are positioned inside');
is(/export const PHOTO_WIDTH = 320;/.test(dsPage)
   && /\.design-photo \{ position: relative; width: 320px; \}/.test(css), true,
   'and the width it scales from is the width the stylesheet starts at');
// Two rectangles, not one: zoomed in, the photo is bigger than its box, and
// a point inside the photo can be visually over the tray beside it.
is(/return inside\(photo\) && \(!box \|\| inside\(box\)\)/.test(dsSheet), true,
   'a drop must be on the VISIBLE photo, not merely inside its rectangle');
// A bare wheel is left alone. This box sits in the middle of a long page and
// stealing the scroll would trap it.
is(/if \(!e\.ctrlKey && !e\.metaKey\) return;/.test(dsSheet), true,
   'the wheel only zooms with ctrl or cmd held');
is(/@media print[\s\S]{0,400}?\.design-photo \{ width: 320px !important; \}/.test(css),
   true, 'and print goes back to rest, since paper does not scroll');

// The zoom is remembered in the browser, like the tray's open state and the
// checklist's name — not on the style, because it is how somebody is reading
// the sheet today and two people should be able to read it differently.
is(/const ZOOM_KEY = 'im-master:design-zoom'/.test(dsPage), true,
   'the zoom is remembered under the same prefix as the other two');
is(/readViews\(\)\[String\(s\.id\)\]/.test(dsSheet), true,
   'and a sheet opens at what it was last left at');
// Every path through the control has to write, or one of them silently
// forgets. There is exactly one setter, inside zoomTo, which does.
is((dsSheet.match(/setZoom\(/g) || []).length === 1, true,
   'there is one place zoom changes, so there is one place it is written');
is(/if \(z === 1 && x === 0 && y === 0\) delete all\[String\(id\)\]/.test(dsPage), true,
   'fully back to rest forgets the style rather than storing the default');

// The scroll position is saved too, so a sheet left zoomed in on the yoke
// comes back on the yoke rather than at the top-left corner.
is(/view\.current\.x = Math\.round\(box\.scrollLeft\)/.test(dsSheet), true,
   'scrolling records where the box got to');
// Scroll fires continuously and localStorage is synchronous.
is(/saving\.current = setTimeout\(persist, 200\)/.test(dsSheet), true,
   'written once the box is still, not once per scroll event');
is(/useEffect\(\(\) => \(\) => clearTimeout\(saving\.current\), \[\]\)/.test(dsSheet),
   true, 'and the pending write is dropped if the page goes first');
// On a reload the photo has no height yet, so the first attempt scrolls
// nothing. The target is held until it actually takes.
is(/onLoad=\{restore\}/.test(dsSheet), true,
   'the scroll is put back once the photo has loaded, not only on mount');
is(/pending\.current = null;/.test(dsSheet)
   && /Math\.abs\(box\.scrollLeft - want\.x\) <= 1/.test(dsSheet), true,
   'and only given up on once the box really moved there');
is(/if \(pending\.current\) return;/.test(dsSheet), true,
   'putting it back does not count as a scroll and overwrite the target');
// One ref holds both, so a scroll write cannot undo a zoom write.
is(/const view = useRef\(\{ \.\.\.AT_REST/.test(dsSheet), true,
   'zoom and scroll are written as one thing, not two that race');

// ---- NEED NEW PHOTO reaches the editor ----
// Raised on the Matrix layout and read in the editor, so somebody opening a
// style knows a new picture is wanted before they look at the old one.
console.log('\n-- need new photo --');
const npRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const npEd = fs.readFileSync('frontend/src/pages/StyleEditor.jsx', 'utf8');
const npLoad = cut(npRepo, 'def load_style(', 'def save_style(');

is(/"needs_photo": bool\(s\["needs_photo"\]\)/.test(npLoad), true,
   'the style endpoint returns the flag');
// The hazard this avoids: save_style writes every FLAT column the payload
// carries, and the editor's form would send a blank for it on every save —
// clearing the flag whenever a style was edited for any other reason.
is(/"needs_photo"/.test(cut(npRepo, 'FLAT = [', '# client name -> column name')),
   false, 'and it is NOT in FLAT, so an editor save cannot clear it');
is(/setNeedsPhoto\(!!s\.needs_photo\)/.test(npEd), true, 'the editor reads it on load');
is(/setNeedsPhoto\(!!saved\.needs_photo\)/.test(npEd), true,
   'and again after a save, so a flag raised meanwhile shows up');
// Not in `form`: everything in form counts towards the unsaved-changes
// prompt, and a readout must not make a page look edited.
is(/needs_photo/.test(cut(npEd, 'function toForm(', 'export default function')),
   false, 'it is not part of the form, so it cannot look like unsaved work');
is(/className="ed-needs-photo"/.test(npEd), true, 'the banner is drawn');
is(npEd.indexOf('ed-needs-photo') < npEd.indexOf('<div className="style-photo">'),
   true, 'above the photo it is about');
is(/\.ed-needs-photo \{[^}]*background: var\(--chan-sy\)/.test(css), true,
   'in the same red the Matrix uses for it');

// ---- the SKU tail on a linked season ----
console.log('\n-- linked seasons show the style number --');
const skRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const skPanel = fs.readFileSync('frontend/src/sections/PastSeasons.jsx', 'utf8');
const skRel = cut(skRepo, 'def related_styles(', 'def link_styles(');

// sku_code is a real column and it is empty on all 1,467 styles, so reading
// it would print a dash against every row. The number people read off the
// sheet is the numeric tail of the style code: K59Y2IW092 ends in 092.
is(/lpad\(s\.style_number::text, 3, '0'\) AS sku_tail/.test(skRel), true,
   'the tail comes from style_number, padded to three');
is(/s\.sku_code/.test(skRel), false,
   'and not from sku_code, which is empty on every style');
// Padded in SQL, not in the client, so the style code and this panel cannot
// disagree about what the number is.
is(/lpad/.test(skPanel) || /padStart/.test(skPanel), false,
   'the client does no padding of its own');
is(/\{r\.sku_tail \|\| '\u2014'\}/.test(skPanel), true,
   'a style with no number shows a dash rather than an empty column');
is(/past-sku\$\{r\.sku_tail \? '' : ' none'\}/.test(skPanel), true,
   'and is drawn as absent rather than as a value');
is(/font-variant-numeric: tabular-nums/.test(cut(css, '.past-sku {', '.past-sku.none')),
   true, 'the numbers line up down the column');

// ---- unlinking one season, not the lot ----
// "Unlink this one" detached the style being EDITED, so from F27 the whole
// list emptied and it read as having unlinked everything. A row now has its
// own control, and the footer button says whose link it breaks.
console.log('\n-- unlinking --');
is(/const unlinkOne = async \(row\)/.test(skPanel), true,
   'a single linked season can be detached');
is(/api\.unlinkStyle\(row\.id\)/.test(skPanel), true,
   'by that row\u2019s id, not the one on screen');
// The route answers with the related list of the style it detached, which is
// not the style being looked at — filling the panel from that reply would
// show somebody else's links.
is(/await api\.unlinkStyle\(row\.id\);\s*\n\s*await reload\(\);/.test(skPanel), true,
   'and the panel is reloaded rather than filled from the reply');
is(/setRows\(await api\.unlinkStyle\(row\.id\)\)/.test(skPanel), false,
   'never from the reply, which belongs to the detached style');
is(/className="past-unlink"/.test(skPanel), true, 'the row carries the control');
// A button inside a button is not valid markup, and the row is a button.
is(/<div className="past-row-wrap"/.test(skPanel), true,
   'beside the row rather than inside it');
is(/Unlink this one/.test(skPanel), false,
   'the ambiguous label is gone');
is(/Unlink this style/.test(skPanel) && /const unlinkSelf/.test(skPanel), true,
   'and the footer one says it detaches the style being edited');

// ---- the blueprint: a yarn line belongs to a part ----
console.log('\n-- the blueprint --');
const bpRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const bpDraw = fs.readFileSync('frontend/src/sections/Blueprint.jsx', 'utf8');
const bpSec = fs.readFileSync('frontend/src/sections/BomSection.jsx', 'utf8');
const bpMig = fs.readFileSync(
  'backend/migrations/versions/0027_bom_component.py', 'utf8');

// Two lists of parts, one on the drawing and one the server will accept. A
// part with no shape could not be pointed at; a part the server does not
// know could not be saved.
const drawn = [...bpDraw.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
const known = (bpRepo.match(/GARMENT_PARTS = \[([^\]]*)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
is(drawn.length > 0 && known.length > 0, true, 'both lists were found');
is(drawn.filter((d) => !known.includes(d)), [],
   'every part on the drawing is one the server will store');
is(known.filter((k) => !drawn.includes(k)), [],
   'and every part the server knows has a shape to point at');

// The geometry is the design panel's winner, generated so that adjacent
// parts share their seam curves TO THE DIGIT. These assertions hold the
// seams shut: if a hand edit changes one side of a shared curve, the count
// drops and this fails before a gap ships.
// Counted inside the SHAPES literal only, and exactly: the file's own
// comment quotes these coordinates, and a count over the whole file stayed
// at 2 while a real seam copy drifted — the comment was passing the test.
const bpShapes = cut(bpDraw, 'const SHAPES = {', 'const DECO');
is((bpShapes.match(/C 186 92 196 104 210 104/g) || []).length, 2,
   'the front collar band\u2019s outer edge IS the body\u2019s neck curve');
is((bpShapes.match(/46\.6 206\.9/g) || []).length, 2,
   'the cuff sits on the sleeve\u2019s own end, same corner in both');
is((bpShapes.match(/136 236/g) || []).length, 2,
   'and the hem band starts on the body\u2019s bottom edge');
// The rib texture must stay deaf to the pointer, or it eats part clicks.
is(/\.bp-rib \{[^}]*pointer-events: none/s.test(css), true,
   'the rib texture cannot steal a click from the part under it');
// The collar is two bands with the page between them. The old hole-punch
// needed a pointer-deaf shape over the neck; nothing may bring that back.
is(/bp-hole/.test(bpDraw), false,
   'no hole shape — the gap in the collar is just the page');
is(/neck: \[/.test(bpDraw)
   && (cut(bpDraw, 'neck: [', '};').match(/'M /g) || []).length === 2, true,
   'the collar is exactly two bands, back stand and front band');

is(/ADD COLUMN component text/.test(bpMig), true, 'a migration carries the part');
// NULL is "the whole garment", which is what all 8,465 imported lines mean.
// A default would claim a decision nobody made.
is(/DEFAULT/.test(bpMig), false, 'with no default, so an old line stays unplaced');
is(/cy\.ends, cy\.component/.test(bpRepo), true, 'it comes back with the line');
is(/ends, component\)\s*VALUES \(%s,%s,%s,%s,%s,%s\)/.test(bpRepo), true,
   'and is written with it');
is(/if part not in GARMENT_PARTS:/.test(bpRepo), true,
   'a part that is not on the drawing is refused');
// An imported style keeps where each yarn went, or the copy quietly loses
// the one thing the blueprint records.
is(/SELECT %s, slot, yarn_color_id, percent, ends, component/.test(bpRepo), true,
   'and an imported style carries it across');

// The two tabs are two readings of ONE list. Nothing is held twice.
is(/const rows = \(cw\?\.bom \|\| \[\]\)/.test(bpSec)
   && /\.filter\(\(\{ ln \}\) => ln\.component === part\)/.test(bpSec), true,
   'the blueprint filters the colourway\u2019s own lines');
is(/setLine\(cwIndex, j,/.test(bpSec), true,
   'and edits them in place, so both tabs show one truth');
is(/<select className="input bom-part"/.test(bpSec), true,
   'the BOM tab shows the part each line is for');
// Removing a colourway on one tab must not leave the other pointing at it.
is(/Math\.min\(which, Math\.max\(colorways\.length - 1, 0\)\)/.test(bpSec), true,
   'the chosen colourway is clamped, not trusted');

// ---- the nav band ----
// Every page's band lists the others, so a new page has to be added to five
// files. Design was added to the home tiles and missed here, which left it
// reachable only by going home first.
console.log('\n-- the nav band --');
const PAGE_ROUTE = {
  'Matrix.jsx': '/matrix', 'Browse.jsx': '/browse', 'Checklist.jsx': '/checklist',
  'Report.jsx': '/report', 'Design.jsx': '/design', 'StyleEditor.jsx': null,
};
const banded = fs.readdirSync('frontend/src/pages')
  .filter((f) => fs.readFileSync(`frontend/src/pages/${f}`, 'utf8')
                   .includes('className="band-row"'));
is(banded.filter((f) => !(f in PAGE_ROUTE)), [],
   'every page with a band is one this test knows about');
for (const [page, own] of Object.entries(PAGE_ROUTE)) {
  const src = fs.readFileSync(`frontend/src/pages/${page}`, 'utf8');
  const band = cut(src, '<div className="band-row">', '</header>');
  const links = [...band.matchAll(/to="(\/[a-z]*)"\s+className="band-link"/g)]
    .map((m) => m[1]);
  // Its own page is not a link on it, and everything else is.
  const want = ['/new', '/matrix', '/browse', '/design', '/checklist', '/report']
    .filter((r) => r !== own && !(page === 'StyleEditor.jsx' && r === '/new'));
  is(want.filter((r) => !links.includes(r)), [],
     `${page} links to every other page`);
  // Design goes last wherever it appears — asked for, and the bands are
  // edited one file at a time, so the order drifts without a check.
  is(links.includes('/design') ? links[links.length - 1] : '/design', '/design',
     `${page} puts Design at the end`);
  is(own && links.includes(own) ? own : null, null,
     `${page} does not link to itself`);
}


// ---- the load: compression, caching, photo size ----
// Measured before any of this: the season Matrix was 455KB raw (26KB
// gzipped), photos were served at original size (698KB into a 160px slot),
// and none of the three photo grids lazy-loaded.
console.log('\n-- the load --');
const pfMain = fs.readFileSync('backend/app/main.py', 'utf8');
const pfNginx = fs.readFileSync('frontend/nginx.conf', 'utf8');
const pfUp = fs.readFileSync('backend/app/routers/uploads.py', 'utf8');
const pfReq = fs.readFileSync('backend/requirements.txt', 'utf8');

is(/GZipMiddleware, minimum_size=1024, compresslevel=6/.test(pfMain), true,
   'the API compresses its JSON, at the measured sweet spot');
is(/gzip on;/.test(pfNginx) && /application\/json/.test(pfNginx), true,
   'and nginx compresses what it serves itself');
// Photos never change under a URL — every upload gets a fresh token — so
// both servers may say immutable.
is(/location \/uploads\/ \{[^}]*immutable/s.test(pfNginx), true,
   'nginx lets the browser keep photos for ever');
is(/_photo_cache/.test(pfMain) && /max-age=31536000/.test(pfMain), true,
   'and the dev stack caches them the same way');

// Three grids draw hundreds of photos; none may load eagerly.
for (const f of ['frontend/src/sections/SheetCard.jsx',
                 'frontend/src/sections/PriceCard.jsx',
                 'frontend/src/pages/Design.jsx']) {
  const src = fs.readFileSync(f, 'utf8');
  const imgs = src.match(/<img [^>]*src=\{s\.image_path\}[^>]*>/gs) || [];
  is(imgs.length > 0 && imgs.every((i) => /loading="lazy"/.test(i)), true,
     `${f.split('/').pop()} lazy-loads its photos`);
}

// Uploads are shrunk on the way in, with the three behaviours that matter:
// The exact constant, bounded: /1200/ alone passed happily with the resize
// neutered to 120000.
is(/DISPLAY_PX = 1200\n/.test(pfUp) && /thumbnail\(\(DISPLAY_PX, DISPLAY_PX\)/.test(pfUp),
   true, 'a phone photo is resized to the display size');
// Passthrough is decided BEFORE exif_transpose: it returns a copy whose
// .format is None, and testing after re-encoded every small JPEG for
// nothing — that exact bug shipped for ten minutes.
is(pfUp.indexOf('small_jpeg') < pfUp.indexOf('ImageOps.exif_transpose'), true,
   'a small upright JPEG passes through before any transpose copy');
is(/getexif\(\)\.get\(274, 1\)/.test(pfUp), true,
   'and only an upright one — a sideways phone shot still gets rotated');
is(/raise ValueError\("That file is not a readable image"\)/.test(pfUp), true,
   'garbage with an image content-type is refused, not a 500');
is(/^pillow==/m.test(pfReq), true, 'Pillow is pinned in the image');


// ---- the editor fits its window ----
// At 1250px the form column overflowed 99px under the Select Section card,
// 177px at 1100 (measured with a headless-Chrome harness on the real
// stylesheet). Grid tracks refuse to shrink below their content unless told.
console.log('\n-- the editor fits --');
is(/\.style-panel \{ display: grid; grid-template-columns: 280px minmax\(0, 1fr\)/.test(css),
   true, 'the form column is allowed to shrink below its content');
is(/\.editor-grid > \* \{ min-width: 0; \}/.test(css), true,
   'and so are the editor\u2019s two cards');
is(/\.chan-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(css),
   true, 'the channel pair shrinks instead of spilling');
is(/@media \(max-width: 1200px\) \{ \.editor-grid \{ grid-template-columns: 1fr; \} \}/.test(css),
   true, 'one column below 1200 — the 1020-1200 band was the broken zone');
// The SKU row wraps whenever it is tight, not only under one breakpoint.
// Not cut(): that helper finds `to` from the top of the file, and `}`
// matches long before .sku-parts does.
const skuAt = css.indexOf('.sku-parts {');
const skuRule = css.slice(skuAt, css.indexOf('}', skuAt));
is(/flex-wrap: wrap;/.test(skuRule), true,
   'the six SKU segments wrap at any width rather than running out of the card');

// The Pricing Matrix once redefined the editor's .price-row and .price-input
// and quietly restyled the editor's whole Pricing section. The sheet's
// classes are namespaced pmx-; neither family may define the other's names
// twice.
// Exact counts, pinned to what the editor legitimately owns today: one
// .price-row rule and four .price-input rules (base, two descendants, one
// modifier). A fifth means somebody reused the editor's names again.
for (const [name, owns] of [['price-row', 1], ['price-input', 4], ['price-grid', 0]]) {
  const defs = (css.match(new RegExp(`^\\.${name}[ .:,{]`, 'gm')) || []).length;
  is(defs, owns, `.${name}: exactly the editor's ${owns} rule(s), none from the sheet`);
}
is(/\.pmx-row \{/.test(css) && /pmx-grid/.test(
     fs.readFileSync('frontend/src/pages/Matrix.jsx', 'utf8')), true,
   'the pricing sheet uses its own pmx- names end to end');


// ---- the audit round: query shape, races, render storms ----
// 22 findings survived a 53-agent adversarial audit; these pin the fixes.
console.log('\n-- the audit round --');
const auRepo = fs.readFileSync('backend/app/repo.py', 'utf8');
const auMeta = fs.readFileSync('backend/app/routers/meta.py', 'utf8');
const auStylesR = fs.readFileSync('backend/app/routers/styles.py', 'utf8');
const auChkR = fs.readFileSync('backend/app/routers/checklist.py', 'utf8');
const auMx = fs.readFileSync('frontend/src/pages/Matrix.jsx', 'utf8');
const auEd = fs.readFileSync('frontend/src/pages/StyleEditor.jsx', 'utf8');
const auDs = fs.readFileSync('frontend/src/pages/Design.jsx', 'utf8');
const auPast = fs.readFileSync('frontend/src/sections/PastSeasons.jsx', 'utf8');
const auCard = fs.readFileSync('frontend/src/sections/SheetCard.jsx', 'utf8');
const auChk = fs.readFileSync('frontend/src/pages/Checklist.jsx', 'utf8');

// /api/meta: one scan of styles for all the distinct lists, not 27.
is(/def distinct_lists\(cols\):/.test(auRepo)
   && /return \{c: \(row\[c\] or \[\]\) for c in cols\}/.test(auRepo), true,
   'meta reads every distinct list in one scan, and an empty column stays []');
is(/def distinct\(c\):/.test(auRepo), false, 'the per-column scan helper is gone');
// The CONDITIONAL, not the strings: a dead `if False:` kept every string
// this test used to look for while never sending a 304.
is(/if request\.headers\.get\("if-none-match"\) == etag:\s*\n\s*return Response\(status_code=304/
   .test(auMeta) && /"Cache-Control": "no-cache"/.test(auMeta), true,
   'and the route answers a matching If-None-Match with an empty 304');

// matrix_rows: the dead fields are gone and the probes are consolidated.
const auRows = cut(auRepo, 'def matrix_rows(', 'def _sales_index(');
is(['next_sells_sy', 'next_sells_000', 'seasons_run', 'past_sy_mark', 'past_000_mark']
   .filter((k) => auRows.includes(k)), [],
   'the five fields nothing reads are no longer computed or shipped');
is(/LEFT JOIN LATERAL \(\s*SELECT o\.sell_sy, o\.sell_000/.test(auRows), true,
   'the previous-season pair is one lateral probe, not two scalar subqueries');
is(/prev\.sell_sy  AS prev_sells_sy/.test(auRows)
   && /prev\.sell_000 AS prev_sells_000/.test(auRows), true,
   'under the same output names the card reads');
is(/\(se\.season_number \+ 2\) IN \(/.test(auRows), true,
   'next_season_loaded is one hashed subplan, not a per-row EXISTS');
is(/cwagg\.marks AS colorway_marks/.test(auRows)
   && /FILTER \(WHERE cw\.mark IS NOT NULL\)/.test(auRows), true,
   'pen, band and background come from one scan of the colourways');

// load_style: the BOM arrives in one query however many colourways.
is(/WHERE cy\.colorway_id = ANY\(%s\)/.test(auRepo)
   && /ORDER BY cy\.colorway_id, cy\.slot/.test(auRepo), true,
   'load_style fetches every colourway\u2019s lines in one round trip');
is(/def style_exists\(style_id: int\) -> bool:/.test(auRepo)
   && /repo\.style_exists\(style_id\)/.test(auStylesR), true,
   'costing 404s via one indexed probe, not a full editor payload');

// checklist: a tick refetches one row, and the route offers it.
is(/api\.checklist\(\{ style_id: row\.id \}\)/.test(auChk), true,
   'a tick asks the server for its own row only');
is(/style_id: int \| None = Query\(None\)/.test(auChkR)
   && /AND s\.id = %s/.test(auRepo), true,
   'and the endpoint filters to it server-side');

// races: a stale response must be a no-op, never a repaint.
is(/const loadSeq = useRef\(0\)/.test(auMx)
   && /if \(seq === loadSeq\.current\) setRows\(r\)/.test(auMx), true,
   'a slow season response cannot paint over the one on screen');
// Pinned to the ECHO site: the catch-path revert carries the same guard
// text, so a loose match passed with the echo guard deleted.
is(/const saveSeq = useRef\(new Map\(\)\)/.test(auMx)
   && /&& saveSeq\.current\.get\(row\.id\) === seq\) patch\(saved\)/.test(auMx), true,
   'an earlier save\u2019s echo cannot overwrite a later save on the same row');
is(/catch\(\(\) => \{\}\)/.test(auMx), false,
   'no error on the Matrix is swallowed into a silent dead end');
// The guard INSIDE then(), not the flag's declaration: deleting the one
// line that checks it left the declaration — and this test — intact.
is(/api\.getStyle\(id\)\s*\n\s*\.then\(\(s\) => \{\s*\n\s*if \(!live\) return;/.test(auEd),
   true, 'the editor ignores a superseded style load instead of hydrating it');
is(/const loadSeq = useRef\(0\)/.test(auDs) && /setLoadFailed\(true\)/.test(auDs), true,
   'the design page versions its loads and says when one failed');
is(/let live = true;[\s\S]{0,300}?api\.listStyles/.test(auPast), true,
   'the link search drops a response that arrives after the query changed');

// render storms: stable identities end to end.
is(/export default memo\(SheetCard\)/.test(auCard)
   && /isDragging = false/.test(auCard) && !/<datalist/.test(auCard), true,
   'SheetCard is memoised, takes live drag flags as primitives, owns no datalist');
is(/const proxyRef = useRef\(null\)/.test(auMx)
   && /onEdit: \(\.\.\.a\) => h\.current\.save\(\.\.\.a\)/.test(auMx), true,
   'the cards get identity-stable proxies that call the CURRENT handlers');
is(/live\.current = \{\s*save, markColour/.test(auMx), true,
   'whose targets are refreshed every render, so no closure can go stale');
// Each cached handler's own guard, because `live.current.dragging` also
// appears at the drop site and one occurrence kept a loose test green.
is(/const dragCache = useRef\(new Map\(\)\)/.test(auMx)
   && /onDragOver: \(e\) => \{\s*\n\s*if \(!live\.current\.dragging\) return;/.test(auMx)
   && /if \(live\.current\.over === id\) setOver\(null\)/.test(auMx), true,
   'drag handlers are cached per row and read the live drag state');
is(/const cardOptions = useMemo\(/.test(auMx)
   && (auMx.match(/<datalist key=\{name\}/g) || []).length === 1, true,
   'one datalist set at page level, built only when a list changes');
is(/const AttrRow = memo\(/.test(auMx)
   && /confirming=\{confirmDelete === r\.id\}/.test(auMx), true,
   'the attribute grid\u2019s rows are memoised with primitive props');
is(/const Sheet = memo\(DesignSheet\)/.test(auDs)
   && /<Sheet key=\{s\.id\}/.test(auDs)
   && /useCallback\(\(style, marks\) => \{/.test(auDs), true,
   'design sheets are memoised behind a stable save handler');
is(/export default memo\(PriceCard\)/.test(
     fs.readFileSync('frontend/src/sections/PriceCard.jsx', 'utf8')), true,
   'and so are the pricing cards');


// ---- the app ships per page ----
console.log('\n-- code splitting --');
const auApp = fs.readFileSync('frontend/src/App.jsx', 'utf8');
is(/import Login from '\.\/pages\/Login\.jsx'/.test(auApp), true,
   'the login screen is eager — it must never depend on a second request');
is((auApp.match(/lazyPage\(\(\) => import\(/g) || []).length === 8, true,
   'and every other page is its own chunk');
// A redeploy 404s the old chunk names on purpose (nginx.conf), so a tab
// that outlives a deploy gets one reload — and the flag must clear on
// success or that tab's ONLY reload is spent for ever.
is(/sessionStorage\.removeItem\(RELOADED\)/.test(auApp)
   && /sessionStorage\.getItem\(RELOADED\) === '1'/.test(auApp), true,
   'the one-shot reload re-arms after any successful load');
is(/class ChunkBoundary extends Component/.test(auApp)
   && (auApp.match(/<ChunkBoundary>/g) || []).length === 2, true,
   'and a chunk that still fails lands on words and a button, not a white page');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
