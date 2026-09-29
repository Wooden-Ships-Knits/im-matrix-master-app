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
const { verdict, byManualOrder, cutPages, breakable } = await import(
  'data:text/javascript,' + encodeURIComponent(
    slice('const verdict =', 'const legendFor')
    + slice('const byManualOrder =', 'const cutPages')
    + slice('const cutPages =', 'const SEASON_NAMES')
    + cut(card, 'export const breakable =', 'export const CHANNEL_MARK')
      .replace('export const', 'const')
    + '\nexport { verdict, byManualOrder, cutPages, breakable };'));

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

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
