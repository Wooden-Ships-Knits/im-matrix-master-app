import { X } from 'lucide-react';
import { Field, NumberInput, Combo } from '../components/ui.jsx';

const emptyLine = () => ({ yarn: '', percent: '', ends: '', note: '' });

/**
 * Colorways and their yarn lines. The BOM is the same for every size,
 * so it is edited once per colorway.
 */
export default function BomSection({ form, update, meta }) {
  const colorways = form.colorways;

  const setColorways = (next) => update({ colorways: next });

  const addColorway = () =>
    setColorways([...colorways, { name: '', bom: [emptyLine()] }]);

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

  return (
    <div>
      {colorways.length === 0 && (
        <p className="muted" style={{ marginTop: 0 }}>
          No colorways yet — add the first colour combination for this style.
        </p>
      )}

      {colorways.map((cw, i) => (
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
          </div>

          <div className="bom-label">Yarns / BOM (same for every size)</div>

          {cw.bom.map((ln, j) => (
            <div key={j} className="bom-row">
              <Combo value={ln.yarn} onChange={(v) => setLine(i, j, { yarn: v })}
                options={meta?.yarns || []} placeholder="Pick a yarn or type a new one" />
              <NumberInput value={ln.percent} min="0" max="100"
                onChange={(v) => setLine(i, j, { percent: v })} placeholder="%" />
              <NumberInput value={ln.ends} min="0"
                onChange={(v) => setLine(i, j, { ends: v })} placeholder="Ends" />
              <button type="button" className="icon-btn danger" title="Remove yarn line"
                aria-label="Remove yarn line" onClick={() => removeLine(i, j)}>
                <X size={18} />
              </button>
            </div>
          ))}

          <button type="button" className="btn-chip" onClick={() => addLine(i)}>
            + yarn line
          </button>
        </div>
      ))}

      <button type="button" className="btn-chip" onClick={addColorway}>
        + Add color
      </button>
    </div>
  );
}
