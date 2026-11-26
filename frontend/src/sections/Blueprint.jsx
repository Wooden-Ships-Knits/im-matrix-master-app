/**
 * A pullover, drawn flat, with each part selectable.
 *
 * The workbook has a line drawing with numbered arrows — neck width, chest,
 * sleeve length — which is how the team has always said which part of a
 * garment they mean. This is the same idea put to a different use: the parts
 * are the thing a yarn line belongs to, so the drawing is how one is
 * assigned.
 *
 * The geometry is the winner of a four-way design panel (judged unanimously,
 * 2026-11-18): four independently drawn flats, each iterated against its own
 * renders, scored by three judges on realism, seams, polish and
 * clickability. Every coordinate was computed parametrically, not typed —
 * which is why the seams are exact:
 *
 *   - the front collar band's outer edge IS the body's neck curve
 *     (`C 186 92 196 104 210 104` appears in both paths, verbatim);
 *   - the cuff sits on the sleeve's own end (`46.6 206.9` is a corner of
 *     both), and the hem band starts on the body's bottom edge (`136 236`);
 *   - the collar is two bands — a standing back band and a front band — with
 *     the page showing between them, the way a real crew neck reads from the
 *     front. No hole is punched and nothing deaf to the pointer sits over
 *     the neck, so clicking anywhere on either band picks it.
 *
 * PARTS is the vocabulary, and GARMENT_PARTS in backend/app/repo.py is the
 * same list: a part with no shape here could not be pointed at, and a part
 * the server does not know could not be saved. frontend/test keeps them in
 * step.
 */

// Order is top to bottom, which is the order somebody reads a garment in.
export const PARTS = [
  { id: 'neck', label: 'Neck', hint: 'Collar and neckband' },
  { id: 'body', label: 'Base body', hint: 'Front and back panels' },
  { id: 'sleeve', label: 'Sleeves', hint: 'Both sleeves' },
  { id: 'cuff', label: 'Cuffs', hint: 'Both sleeve ribs' },
  { id: 'hem', label: 'Hem rib', hint: 'The bottom band' },
];

export const PART_LABEL = Object.fromEntries(PARTS.map((p) => [p.id, p.label]));

// The clickable shapes, exactly as the winning flat drew them. Both sleeves
// are one part and both cuffs are one part: a garment has a sleeve yarn, not
// a left-sleeve yarn. Kept verbatim — these coordinates were generated so
// that adjacent parts share their seam curves to the digit, and a hand edit
// here is how a gap opens along a seam.
const SHAPES = {
  sleeve: [
    'M 129 87 C 105 99 57 144 25 178.1 L 46.6 206.9 C 75 193 109 173 131 156 '
      + 'C 134 130 132 106 129 87 Z',
    'M 291 87 C 315 99 363 144 395 178.1 L 373.4 206.9 C 345 193 311 173 289 156 '
      + 'C 286 130 288 106 291 87 Z',
  ],
  cuff: [
    'M 25 178.1 L 46.6 206.9 L 29.7 217.7 L 9.9 191.3 Z',
    'M 395 178.1 L 373.4 206.9 L 390.3 217.7 L 410.1 191.3 Z',
  ],
  body: [
    'M 129 87 L 178 70 C 186 92 196 104 210 104 C 224 104 234 92 242 70 '
      + 'L 291 87 C 288 112 283 134 289 156 C 287 190 285 215 284 236 '
      + 'L 136 236 C 135 215 133 190 131 156 C 137 134 132 112 129 87 Z',
  ],
  hem: [
    'M 136 236 L 284 236 L 284 258 C 236 260.5 184 260.5 136 258 Z',
  ],
  neck: [
    // The standing back of the collar, visible above the shoulder line…
    'M 186.5 66 C 196 70 224 70 233.5 66 C 231.5 59.5 222 56.5 210 56.5 '
      + 'C 198 56.5 188.5 59.5 186.5 66 Z',
    // …and the front band, whose outer edge is the body's neck curve.
    'M 178 70 C 186 92 196 104 210 104 C 224 104 234 92 242 70 L 233.5 66 '
      + 'C 227 85 219 93.5 210 93.5 C 201 93.5 193 85 186.5 66 Z',
  ],
};

// Rib hatching for the collar, cuffs and hem, pre-computed on the bands'
// own geometry by the same generator — every tick starts and ends on its
// band's edges. One path of M…L subpaths; the caps are round, so the
// closing Z draws nothing.
const DECO =
  'M 183 77.9 L 188.4 75.5 Z M 186.8 85.4 L 192 82.4 Z M 190.8 91.5 L 195.8 87.7 Z '
  + 'M 195.1 96.2 L 199.5 91.4 Z M 199.7 99.6 L 203.1 93.6 Z M 204.6 101.6 L 206.4 94.8 Z '
  + 'M 210 102.3 L 209.9 95.2 Z M 215.3 101.6 L 213.5 94.8 Z M 220.3 99.6 L 216.8 93.7 Z '
  + 'M 224.8 96.3 L 220.4 91.4 Z M 229.2 91.5 L 224.2 87.7 Z M 233.2 85.4 L 228 82.4 Z '
  + 'M 237 78 L 231.6 75.6 Z M 191.1 62.4 L 192.7 64.5 Z M 195.1 60.3 L 197.1 65.8 Z '
  + 'M 200.3 58.9 L 201.7 66.8 Z M 206.6 58.2 L 207 67.3 Z M 213.4 58.2 L 212.9 67.3 Z '
  + 'M 219.7 58.9 L 218.2 66.8 Z M 224.9 60.3 L 222.8 65.8 Z M 228.9 62.4 L 227.3 64.5 Z '
  + 'M 144.2 238.6 L 144.2 255.8 Z M 152.4 238.6 L 152.4 256.1 Z M 160.7 238.6 L 160.7 256.4 Z '
  + 'M 168.9 238.6 L 168.9 256.7 Z M 177.1 238.6 L 177.1 256.9 Z M 185.3 238.6 L 185.3 257.1 Z '
  + 'M 193.6 238.6 L 193.6 257.2 Z M 201.8 238.6 L 201.8 257.3 Z M 210 238.6 L 210 257.3 Z '
  + 'M 218.2 238.6 L 218.2 257.3 Z M 226.4 238.6 L 226.4 257.2 Z M 234.7 238.6 L 234.7 257.1 Z '
  + 'M 242.9 238.6 L 242.9 256.9 Z M 251.1 238.6 L 251.1 256.7 Z M 259.3 238.6 L 259.3 256.4 Z '
  + 'M 267.6 238.6 L 267.6 256.1 Z M 275.8 238.6 L 275.8 255.8 Z '
  + 'M 28.7 186.7 L 16.7 196.7 Z M 31.4 190.3 L 19.1 199.9 Z M 34 193.8 L 21.6 203.2 Z '
  + 'M 36.7 197.4 L 24 206.4 Z M 39.4 200.9 L 26.4 209.7 Z '
  + 'M 391.3 186.7 L 403.3 196.7 Z M 388.6 190.3 L 400.9 199.9 Z M 386 193.8 L 398.4 203.2 Z '
  + 'M 383.3 197.4 L 396 206.4 Z M 380.6 200.9 L 393.6 209.7 Z';

// The file's own paint order: sleeves under everything, then cuffs, the
// body over the sleeve caps, the hem on the body's edge, the collar last.
const ORDER = ['sleeve', 'cuff', 'body', 'hem', 'neck'];

export default function Blueprint({ selected, counts = {}, onSelect }) {
  const hit = (id) => ({
    className: `bp-part${selected === id ? ' on' : ''}${counts[id] ? ' filled' : ''}`,
    onClick: () => onSelect?.(id),
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(id); }
    },
    'aria-pressed': selected === id,
    'aria-label': `${PART_LABEL[id]}${counts[id]
      ? `, ${counts[id]} yarn lines` : ', no yarns yet'}`,
  });

  return (
    <svg className="bp" viewBox="0 0 420 380" role="group"
      aria-label="Pullover — pick a part">
      {ORDER.map((id) => SHAPES[id].map((d, i) => (
        <path key={`${id}${i}`} d={d} {...hit(id)} />
      )))}
      {/* Knit texture, so a rib reads as a rib. Last and deaf to the
          pointer: it is detail on top of the parts, not a part of its own. */}
      <g className="bp-rib" aria-hidden="true">
        <path d={DECO} />
      </g>
    </svg>
  );
}
