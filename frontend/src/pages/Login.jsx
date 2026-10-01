import { useState } from 'react';
import { LogIn, Eye } from 'lucide-react';
import { api } from '../api.js';
import { writeSession } from '../session.js';
import { APP_NAME, APP_NAME_FULL } from '../components/Wordmark.jsx';

/**
 * The way in. One password for the team, or look without one.
 *
 * The password is checked by the server — it is never in this bundle, and a
 * guest is refused by the API rather than by a hidden button.
 */
export default function Login({ onSignedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const enter = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const session = await fn();
      writeSession(session);
      onSignedIn(session);
    } catch (err) {
      setError(err.message || 'Could not sign in');
      setBusy(false);
    }
  };

  return (
    <main className="login-wrap">
      <form
        className="card card-pad login-card"
        onSubmit={(e) => { e.preventDefault(); enter(() => api.login(password)); }}
      >
        <h1 className="login-logo">{APP_NAME}</h1>
        <p className="login-expand">{APP_NAME_FULL}</p>
        <p className="card-sub">PT In Fashion — knitwear style master data</p>

        <label className="login-label" htmlFor="pw">Password</label>
        <input
          id="pw"
          className="input"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          placeholder="Team password"
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
        />

        {error && <p className="login-error" role="alert">{error}</p>}

        <button type="submit" className="btn btn-save login-go"
          disabled={busy || !password}>
          <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="login-or"><span>or</span></div>

        <button type="button" className="btn-chip login-guest" disabled={busy}
          onClick={() => enter(() => api.guest())}>
          <Eye size={15} /> Continue as guest
        </button>
        <p className="login-note">
          A guest can browse the styles. Adding, editing and the Matrix,
          Checklist and Report screens need the password.
        </p>
      </form>
    </main>
  );
}
