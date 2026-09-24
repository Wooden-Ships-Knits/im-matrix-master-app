import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Check, CheckCircle2, AlertCircle } from 'lucide-react';
import { roundFixed } from '../format.js';

/* ---------------- Toast ---------------- */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------------- Confirm dialog ---------------- */

export function ConfirmDialog({ open, title, message, confirmLabel = 'Yes, continue',
  danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-save'}`}
            onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Field wrappers ---------------- */

export function Field({ label, hint, className = '', children }) {
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, ...rest }) {
  return (
    <input className="input" value={value ?? ''}
      onChange={(e) => onChange(e.target.value)} {...rest} />
  );
}

export function NumberInput({ value, onChange, decimals, ...rest }) {
  const [editing, setEditing] = useState(false);

  // `decimals` rounds what is shown, never what is stored. A yarn percentage
  // is held to six decimals because the sheet keeps it as a fraction
  // (0.97933884 -> 97.933884%) and the percentages have to total 100, so
  // rounding the value itself would break the BOM. Focusing gives the full
  // number back to edit.
  const round = decimals != null && !editing
    && value !== '' && value != null && !Number.isNaN(Number(value));
  const shown = round ? roundFixed(value, decimals) : (value ?? '');

  return (
    <input className="input" type="number" inputMode="decimal" step="any"
      {...rest}
      value={shown}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      onChange={(e) => onChange(e.target.value)} />
  );
}

/** A from/to pair. Sales are always asked for over a period, never a day. */
export function DateRange({ value = {}, onChange }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="date-range">
      <input className="input" type="date" aria-label="From"
        value={value.from || ''} max={value.to || undefined} onChange={set('from')} />
      <span className="date-sep">to</span>
      <input className="input" type="date" aria-label="To"
        value={value.to || ''} min={value.from || undefined} onChange={set('to')} />
    </div>
  );
}


export function PriceInput({ value, onChange, ...rest }) {
  return (
    <div className={`price-input${rest.disabled ? ' is-disabled' : ''}`}>
      <span className="currency">$</span>
      <input className="input" type="number" inputMode="decimal" step="any" min="0"
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

export function CheckBox({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box"><Check size={17} strokeWidth={3.2} /></span>
      {label}
    </label>
  );
}

/* ---------------- Combobox ----------------
 * Dropdown-first input: staff pick from the list instead of typing.
 * Typing filters the list; when `allowNew`, an unknown value can be
 * added with one click and is saved for next time.
 */
export function Combo({ value, onChange, options = [], placeholder,
  allowNew = true, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null = show saved value
  const blurTimer = useRef(null);

  const shown = query === null ? (value ?? '') : query;
  const q = (query ?? '').toLowerCase();
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;
  const exact = options.some((o) => o.toLowerCase() === q);

  const pick = (v) => {
    onChange(v);
    onSelect?.(v);
    setQuery(null);
    setOpen(false);
  };

  return (
    <div className="combo"
      onBlur={() => { blurTimer.current = setTimeout(() => { setOpen(false); setQuery(null); }, 120); }}
      onFocus={() => clearTimeout(blurTimer.current)}>
      <input
        className="input"
        value={shown}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (allowNew) onChange(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); setQuery(null); }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered.length > 0 && query) pick(filtered[0]);
            else if (allowNew && query) pick(query.trim());
            else setOpen(false);
          }
        }}
      />
      {open && (
        <div className="combo-list" role="listbox">
          {filtered.slice(0, 80).map((o) => (
            <button type="button" key={o}
              className={`combo-option ${o === value ? 'hl' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}>
              {o}
            </button>
          ))}
          {allowNew && query && query.trim() && !exact && (
            <button type="button" className="combo-option add"
              onMouseDown={(e) => { e.preventDefault(); pick(query.trim()); }}>
              + Add “{query.trim()}”
            </button>
          )}
          {filtered.length === 0 && (!allowNew || !query) && (
            <div className="combo-empty">No options yet</div>
          )}
        </div>
      )}
    </div>
  );
}
