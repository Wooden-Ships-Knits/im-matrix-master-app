import { useState } from 'react';
import { CirclePlus } from 'lucide-react';

/**
 * Add a style, naming the collection it belongs to.
 *
 * Used where there is no collection block to infer one from: a season with
 * nothing in it yet, and the end of the attribute grid. The Layout tab's
 * per-block slot passes its own collection instead and only asks for a name.
 *
 * Typing a collection that does not exist creates it, which is how a new
 * season gets its first block — otherwise the first style of a season would
 * have nowhere to go.
 */
export default function AddStyle({
  season, collections = [], collection = '', busy = false, onAdd,
}) {
  const [name, setName] = useState('');
  // Pre-filled when a collection is already chosen, so the common case is
  // one field and Enter.
  const [into, setInto] = useState(collection);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    onAdd(into.trim(), name.trim());
    setName('');
  };

  return (
    <form className="mx-add-style" onSubmit={submit}>
      <input
        className="input"
        value={name}
        placeholder="Style name"
        aria-label={`New style in ${season}`}
        onChange={(e) => setName(e.target.value.toUpperCase())}
      />
      <input
        className="input"
        value={into}
        list="mx-collections"
        placeholder="Collection"
        aria-label="Collection for the new style"
        onChange={(e) => setInto(e.target.value.toUpperCase())}
      />
      <datalist id="mx-collections">
        {collections.map((c) => <option key={c} value={c} />)}
      </datalist>
      <button type="submit" className="btn btn-save" disabled={busy || !name.trim()}>
        <CirclePlus size={16} /> {busy ? 'Adding…' : 'Add style'}
      </button>
    </form>
  );
}
