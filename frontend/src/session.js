/**
 * Who is using the app, for as long as the browser remembers.
 *
 * The token is opaque here: it is signed by the server with the password, so
 * the page cannot mint one and cannot read anything out of it that the server
 * did not put there. The role is kept alongside only so the UI knows what to
 * show — every actual refusal happens at the API.
 *
 * Which is the point: hiding a button is a courtesy, not a control. A guest
 * who finds the Matrix screen anyway gets a 403 from the server rather than a
 * silent failure.
 */
const KEY = 'im-master:session';

export const readSession = () => {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.token || !parsed?.role) return null;
    // Expired sessions are dropped here so the app asks again rather than
    // sending a token every call just to be told it is stale.
    if (parsed.expires && parsed.expires * 1000 < Date.now()) return null;
    return parsed;
  } catch { return null; }
};

export const writeSession = (session) => {
  try {
    if (session) window.localStorage.setItem(KEY, JSON.stringify(session));
    else window.localStorage.removeItem(KEY);
  } catch { /* a session that cannot be remembered still works for this tab */ }
};

export const isOperator = (session) => session?.role === 'operator';
