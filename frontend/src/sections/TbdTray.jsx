import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Inbox, Trash2, GripVertical, Check, X } from 'lucide-react';

/**
 * A holding tray for styles whose position is not decided yet.
 *
 * Adding a style to a collection puts it at the end, which is right when it
 * belongs there and wrong when it belongs in the middle — the team would add
 * it, scroll to the bottom and drag it back up past thirty cards. A style
 * parked here has no position at all: it is not on the sheet and does not
 * print until someone drops it onto a card.
 *
 * Fixed to the viewport rather than placed in the page, because the whole
 * point is that the drop target is one short drag away wherever you have
 * scrolled to.
 */
const OPEN_KEY = 'im-master:tbd-open';

export default function TbdTray({
  items = [], collection, season, onAdd, onDelete, onDragStart, onDragEnd, busy = false,
}) {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  // Which chip is asking to be deleted. The confirm belongs here, beside the
  // thing that was clicked — the grid's version lives in a table row that the
  // Layout tab never renders, so a tray wired to it looked like a dead button.
  const [confirming, setConfirming] = useState(null);

  // Remembered per browser: a tray someone collapsed should stay collapsed
  // when they come back, and this is a convenience, not state anyone relies
  // on — a browser that refuses to store it just starts open.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPEN_KEY);
      if (saved !== null) setOpen(saved === '1');
    } catch { /* starts open */ }
  }, []);

  const toggle = () => {
    setOpen((was) => {
      try { window.localStorage.setItem(OPEN_KEY, was ? '0' : '1'); } catch { /* fine */ }
      return !was;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const typed = name.trim();
    if (!typed || busy) return;
    onAdd(typed);
    setName('');
  };

  return (
    <aside className={`tbd-tray${open ? '' : ' shut'}`} aria-label="Styles with no position yet">
      <button type="button" className="tbd-head" onClick={toggle}
        aria-expanded={open}>
        <Inbox size={15} />
        <span className="tbd-title">TBD</span>
        {items.length > 0 && <span className="tbd-count">{items.length}</span>}
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>

      {open && (
        <div className="tbd-body">
          <form className="tbd-add" onSubmit={submit}>
            <input
              className="input"
              value={name}
              placeholder="Style name"
              aria-label="Name of a style with no position yet"
              // Upper-cased on the way in, like every other style name.
              onChange={(e) => setName(e.target.value.toUpperCase())}
            />
            <button type="submit" className="btn-chip" disabled={busy || !name.trim()}>
              <Plus size={14} /> Add
            </button>
          </form>

          {/* Said once, here, rather than on every chip. */}
          <p className="tbd-note">
            {collection
              ? <>Lands in <strong>{collection}</strong> when you drag it onto a card.</>
              : <>Pick one collection to park styles into.</>}
          </p>

          {items.length === 0 ? (
            <p className="tbd-empty">
              Nothing waiting. Add a style here when you know it exists but not
              where it goes.
            </p>
          ) : (
            <ul className="tbd-list">
              {items.map((s) => (
                <li key={s.id}>
                  <span
                    className="tbd-chip"
                    draggable
                    title={`Drag ${s.name} onto the card it should sit before`}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(s.id));
                      onDragStart?.(s.id);
                    }}
                    onDragEnd={() => onDragEnd?.()}
                  >
                    <GripVertical size={12} aria-hidden="true" />
                    <span className="tbd-name">{s.name}</span>
                  </span>
                  {confirming === s.id ? (
                    <span className="tbd-gate">
                      <button type="button" className="sheet-colour-yes"
                        title={`Delete ${s.name} for good`}
                        aria-label={`Confirm deleting ${s.name}`}
                        onClick={() => { setConfirming(null); onDelete?.(s); }}>
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <button type="button" className="sheet-colour-no"
                        title="Keep it" aria-label={`Keep ${s.name}`}
                        onClick={() => setConfirming(null)}>
                        <X size={11} strokeWidth={3} />
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="tbd-bin"
                      title={`Delete ${s.name}`} aria-label={`Delete ${s.name}`}
                      onClick={() => setConfirming(s.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
