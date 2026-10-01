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
        nextRingMark, RING_MARKS,
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
    + '          nextRingMark, RING_MARKS,'
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
is(COLORWAY_MARKS, ['green', 'red', 'purple', 'magenta', 'blue'], 'five pens, in order');
is(nextColorwayMark(''), 'green', 'unmarked goes to the first pen');
is(nextColorwayMark('green'), 'red', 'and on through the list');
is(nextColorwayMark('blue'), '', 'the last clears it, so a click can undo');
is(nextColorwayMark(undefined), 'green', 'never set behaves as unmarked');
is(nextColorwayMark('chartreuse'), 'green', 'a pen no longer in the palette restarts');
const pens = [];
let pen = '';
for (let i = 0; i < COLORWAY_MARKS.length + 1; i += 1) {
  pens.push(pen || 'none'); pen = nextColorwayMark(pen);
}
is(pens, ['none', ...COLORWAY_MARKS], 'one click per pen, then back to none');

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

console.log('\n-- the ring round a next-season circle --');
is(RING_MARKS, ['yellow', 'orange'], 'two rings');
is(nextRingMark(''), 'yellow', 'unringed goes to yellow');
is(nextRingMark('yellow'), 'orange', 'then orange');
is(nextRingMark('orange'), '', 'then off again');
is(nextRingMark(undefined), 'yellow', 'never set behaves as unringed');

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

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
