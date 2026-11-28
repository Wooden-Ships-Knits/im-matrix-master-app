import { useState } from 'react';
import { X } from 'lucide-react';
import { Field, NumberInput, Combo, CheckBox } from '../components/ui.jsx';
import { channelOf, channelParts, styleAllows } from '../channel.js';
import Blueprint, { PARTS, PART_LABEL } from './Blueprint.jsx';

const emptyLine = () => ({ yarn: '', percent: '', ends: '', note: '' });
// A new colour starts with no channel recorded rather than with both
// ticked: "nobody has said" is the truth about a colour just typed in,
// and BOTH is an answer that nobody gave.
const emptyColorway = () => ({
  name: '', sub_to: '', sub_reason: '', whs_channel: '', bom: [emptyLine()],
});

/**
 * Colorways and their yarn lines. The BOM is the same for every size,
 * so it is edited once per colorway.
 */
export default function BomSection({ form, update, meta }) {
  const colorways = form.colorways;
  // Two ways of reading one list. The BOM tab is every yarn of a colourway;
  // the Blueprint tab is every yarn of one PART of a colourway, picked off
  // the drawing. Neither holds anything of its own — the lines are the same
  // lines, and `component` is the only thing that differs between them.
  const [tab, setTab] = useState('bom');
  const [part, setPart] = useState('body');
  const [which, setWhich] = useState(0);

  const setColorways = (next) => update({ colorways: next });

  const addColorway = () => setColorways([...colorways, emptyColorway()]);

  const setColorway = (i, patch) =>
    setColorways(colorways.map((cw, x) => (x === i ? { ...cw, ...patch } : cw)));

  const removeColorway = (i) =>
    setColorways(colorways.filter((_, x) => x !== i));

  const renameColorway = (i, name) =>
    setColorways(colorways.map((cw, x) => (x === i ? { ...cw, name } : cw)));

  const addLine = (i) =>
    setColorways(colorways.map((cw, x) =>
      x === i ? { ...cw, bom: [...cw.bom, emptyLine()] } : cw));

  const setLine = (i, j, patch) =>
    setColorways(colorways.map((cw, x) =>
      x === i
        ? { ...cw, bom: cw.bom.map((ln, y) => (y === j ? { ...ln, ...patch } : ln)) }
        : cw));

  const removeLine = (i, j) =>
    setColorways(colorways.map((cw, x) =>
      x === i ? { ...cw, bom: cw.bom.filter((_, y) => y !== j) } : cw));

  // Which colourway the blueprint is showing. Clamped rather than trusted:
  // a colourway can be removed on the other tab while this index is held.
  const cwIndex = Math.min(which, Math.max(colorways.length - 1, 0));
  const cw = colorways[cwIndex];

  // How many lines each part has, for the drawing and the part list. A line
  // with no part is for the whole garment and is counted under none of them.
  const counts = {};
  for (const ln of cw?.bom || []) {
    if (ln.component) counts[ln.component] = (counts[ln.component] || 0) + 1;
  }
  const unplaced = (cw?.bom || []).filter((ln) => !ln.component && ln.yarn).length;

  // The indices of this part's lines in the colourway's own bom array, so
  // editing one here edits the same line the BOM tab shows.
  const rows = (cw?.bom || [])
    .map((ln, j) => ({ ln, j }))
    .filter(({ ln }) => ln.component === part);

  const addPartLine = () =>
    setColorways(colorways.map((c, x) =>
      x === cwIndex ? { ...c, bom: [...c.bom, { ...emptyLine(), component: part }] } : c));

  if (tab === 'blueprint') {
    return (
      <div>
        <Tabs tab={tab} setTab={setTab} />

        {colorways.length === 0 ? (
          <p className="muted">
            No colorways yet — a yarn belongs to a colour, so add one on the
            BOM tab before placing yarns on the drawing.
          </p>
        ) : (
          <>
            {colorways.length > 1 && (
              <Field label="Colourway">
                <select className="input" value={cwIndex}
                  onChange={(e) => setWhich(Number(e.target.value))}>
                  {colorways.map((c, i) => (
                    <option key={i} value={i}>{c.name || `Colorway ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
            )}

            <div className="bp-wrap">
              <Blueprint selected={part} counts={counts} onSelect={setPart} />

              <div className="bp-side">
                {/* The same choice as the drawing, in words. The drawing says
                    where a part is; this says what it is called and whether
                    anything has been put in it. */}
                <ul className="bp-list">
                  {PARTS.map((pt) => (
                    <li key={pt.id}>
                      <button type="button"
                        className={`bp-pick${part === pt.id ? ' on' : ''}`}
                        onClick={() => setPart(pt.id)}>
                        <span className="bp-pick-name">{pt.label}</span>
                        <span className={`bp-pick-n${counts[pt.id] ? '' : ' none'}`}>
                          {counts[pt.id] || '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {unplaced > 0 && (
                  <p className="bp-unplaced">
                    {unplaced} yarn{unplaced === 1 ? '' : 's'} on this colourway
                    {unplaced === 1 ? ' is' : ' are'} for the whole garment,
                    not a part. They stay on the BOM tab.
                  </p>
                )}
              </div>
            </div>

            <div className="bom-label">
              {PART_LABEL[part]} — {cw?.name || `Colorway ${cwIndex + 1}`}
            </div>

            {rows.length === 0 && (
              <p className="muted bp-empty">
                No yarn on the {PART_LABEL[part].toLowerCase()} yet.
              </p>
            )}

            {rows.length > 0 && (
              <div className="bom-row no-part bom-head" aria-hidden="true">
                <span>Yarn</span><span>Percentage</span><span>Ends</span><span />
              </div>
            )}

            {rows.map(({ ln, j }) => (
              <div key={j} className="bom-row no-part">
                <Combo value={ln.yarn} onChange={(v) => setLine(cwIndex, j, { yarn: v })}
                  options={meta?.yarns || []} placeholder="Pick a yarn or type a new one" />
                <NumberInput value={ln.percent} min="0" max="100" decimals={1}
                  aria-label="Percentage"
                  onChange={(v) => setLine(cwIndex, j, { percent: v })} placeholder="%" />
                <NumberInput value={ln.ends} min="0" aria-label="Ends"
                  onChange={(v) => setLine(cwIndex, j, { ends: v })} placeholder="Ends" />
                <button type="button" className="icon-btn danger"
                  title="Remove yarn line" aria-label="Remove yarn line"
                  onClick={() => removeLine(cwIndex, j)}>
                  <X size={18} />
                </button>
              </div>
            ))}

            <button type="button" className="btn-chip" onClick={addPartLine}>
              + yarn on the {PART_LABEL[part].toLowerCase()}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <Tabs tab={tab} setTab={setTab} />
      {colorways.length === 0 && (
        <p className="muted" style={{ marginTop: 0 }}>
          No colorways yet — add the first colour combination for this style.
        </p>
      )}

      {colorways.map((cw, i) => {
        const sell = channelParts(cw.whs_channel);
        return (
        <div key={i} className="cw-block">
          <div className="cw-head">
            <Field label={i === 0 ? 'Colorways' : `Colorway ${i + 1}`}>
              <Combo value={cw.name} onChange={(v) => renameColorway(i, v)}
                options={meta?.colorNames || []}
                placeholder="e.g. BREAKER WHITE/MYKONOS" />
            </Field>
            <button type="button" className="btn-remove"
              onClick={() => removeColorway(i)}>
              Remove
            </button>

            {/* This colour's own channel. A garment sold on both can still
                have one colour that only ever goes to wholesale, which is
                what the pink pens on the Matrix card mean — and until now
                that fact had nowhere to live.

                A box the STYLE does not sell through is shut, not just
                faded: a colour cannot go somewhere the garment does not.
                Its stored value still shows, so a style whose channel was
                narrowed afterwards reads as the contradiction it is rather
                than quietly losing what it said. */}
            <div className="cw-chan">
              <span className="cw-chan-label">Sold through</span>
              {[['sy', 'SY', sell.sy, form.sell_sy],
                ['whs', '000', sell.whs, form.sell_000]].map(([key, text, on, styleOn]) => {
                  const allowed = styleAllows(key, form.sell_sy, form.sell_000);
                  return (
                    <CheckBox
                      key={key}
                      label={text}
                      tone={key}
                      checked={on}
                      disabled={!allowed}
                      title={allowed ? undefined
                        : `This style does not sell through ${text}`}
                      onChange={(v) => setColorway(i, {
                        whs_channel: key === 'sy'
                          ? channelOf(v, sell.whs) : channelOf(sell.sy, v),
                      })}
                    />
                  );
                })}
            </div>
          </div>

          <div className="bom-label">Yarns / BOM (same for every size)</div>

          <div className="bom-row bom-head" aria-hidden="true">
            <span>Yarn</span>
            <span>Percentage</span>
            <span>Ends</span>
            <span>Part</span>
            <span />
          </div>

          {cw.bom.map((ln, j) => (
            <div key={j} className="bom-row">
              <Combo value={ln.yarn} onChange={(v) => setLine(i, j, { yarn: v })}
                options={meta?.yarns || []} placeholder="Pick a yarn or type a new one" />
              <NumberInput value={ln.percent} min="0" max="100" decimals={1}
                aria-label="Percentage"
                onChange={(v) => setLine(i, j, { percent: v })} placeholder="%" />
              <NumberInput value={ln.ends} min="0" aria-label="Ends"
                onChange={(v) => setLine(i, j, { ends: v })} placeholder="Ends" />
              {/* Set from the drawing on the other tab, and readable here, so
                  the two cannot say different things about one line. */}
              <select className="input bom-part" value={ln.component || ''}
                aria-label="Part of the garment"
                onChange={(e) => setLine(i, j, { component: e.target.value || null })}>
                <option value="">Whole garment</option>
                {PARTS.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.label}</option>
                ))}
              </select>
              <button type="button" className="icon-btn danger" title="Remove yarn line"
                aria-label="Remove yarn line" onClick={() => removeLine(i, j)}>
                <X size={18} />
              </button>
            </div>
          ))}

          <button type="button" className="btn-chip" onClick={() => addLine(i)}>
            + yarn line
          </button>

          {/* Substitution. Keep this colourway and point it at the one that
              replaced it — editing the tag in place is how the history is
              lost today (identity.md §6). */}
          <div className="sub-row">
            {/* <Field label="Sub to">
              <select className="input" value={cw.sub_to || ''}
                onChange={(e) => setColorway(i, { sub_to: e.target.value })}>
                <option value="">Not substituted</option>
                {colorways
                  .filter((o, x) => x !== i && o.name)
                  .map((o) => (
                    <option key={o.name} value={o.name}>{o.name}</option>
                  ))}
              </select>
            </Field> */}
            {cw.sub_to && (
              <Field label="Reason">
                <input className="input" value={cw.sub_reason || ''}
                  placeholder="e.g. yarn volume short"
                  onChange={(e) => setColorway(i, { sub_reason: e.target.value })} />
              </Field>
            )}
          </div>
          {cw.sub_to && (
            <p className="sub-note">
              {cw.name || 'This colour'} → {cw.sub_to} · kept for sales history
            </p>
          )}
        </div>
        );
      })}

      <button type="button" className="btn-chip" onClick={addColorway}>
        + Add color
      </button>
    </div>
  );
}

/** The two ways of reading one colourway's yarns. */
function Tabs({ tab, setTab }) {
  return (
    <div className="rep-tabs bom-tabs" role="tablist" aria-label="How to read the BOM">
      {[['bom', 'BOM'], ['blueprint', 'Blueprint']].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={tab === id}
          className={`card-title tab${tab === id ? ' on' : ''}`}
          onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
