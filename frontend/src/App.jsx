import { Component, Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import { readSession, isOperator, SESSION_EXPIRED } from './session.js';
import DevBanner from './components/DevBanner.jsx';

/**
 * Each page is its own chunk, fetched on first visit and then held for ever
 * by the immutable asset cache (frontend/nginx.conf). The login screen used
 * to pay for the whole app — Matrix, the print sheet, the editor — before a
 * password had even been typed.
 *
 * Login itself stays eager: it is the screen that must never depend on a
 * second request succeeding.
 */
const RELOADED = 'im-master:chunk-reloaded';

const lazyPage = (load) => lazy(() => load()
  .then((m) => {
    // A successful import clears the one-shot flag, so the NEXT deploy can
    // use its reload too. Left set, the first recovery would also be the
    // last one this tab ever got.
    try { sessionStorage.removeItem(RELOADED); } catch { /* fine */ }
    return m;
  })
  .catch((err) => {
    // nginx deliberately 404s hashed assets that a redeploy replaced, so a
    // tab that outlives a deploy asks for a chunk that no longer exists.
    // One reload fetches the new index.html and the new chunk names. The
    // flag keeps a genuinely broken network from reloading in a loop; if
    // storage itself is blocked, fall through to the error boundary rather
    // than reload blind.
    let alreadyTried = true;
    try {
      alreadyTried = sessionStorage.getItem(RELOADED) === '1';
      sessionStorage.setItem(RELOADED, '1');
    } catch { /* treat as already tried */ }
    if (!alreadyTried) {
      window.location.reload();
      return new Promise(() => {});   // keep Suspense up through the reload
    }
    throw err;
  }));

const Home = lazyPage(() => import('./pages/Home.jsx'));
const Browse = lazyPage(() => import('./pages/Browse.jsx'));
const StyleEditor = lazyPage(() => import('./pages/StyleEditor.jsx'));
const Report = lazyPage(() => import('./pages/Report.jsx'));
const Checklist = lazyPage(() => import('./pages/Checklist.jsx'));
const Matrix = lazyPage(() => import('./pages/Matrix.jsx'));
const Design = lazyPage(() => import('./pages/Design.jsx'));
const ColorTable = lazyPage(() => import('./pages/ColorTable.jsx'));
const PrintSheet = lazyPage(() => import('./pages/PrintSheet.jsx'));

/**
 * The floor under lazy(): without a boundary, a chunk that cannot be
 * fetched even after the one-shot reload unmounts the whole root — a white
 * page with no way out. This is plain words and a button instead.
 */
class ChunkBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { broken: false };
  }

  static getDerivedStateFromError() {
    return { broken: true };
  }

  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <main className="page">
        <section className="card card-pad">
          <h2 className="card-title">Could not load that screen</h2>
          <p className="card-sub">
            The connection dropped or the app was updated underneath this
            tab. Reloading fixes both.
          </p>
          <button type="button" className="btn btn-save"
            onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      </main>
    );
  }
}

export default function App() {
  const [session, setSession] = useState(readSession);

  // The token can die while the tab is open — it is good for twelve hours and
  // nobody closes a tab. api.js clears it and fires this; without it the page
  // keeps offering buttons the server will refuse.
  useEffect(() => {
    const signedOut = () => setSession(null);
    window.addEventListener(SESSION_EXPIRED, signedOut);
    return () => window.removeEventListener(SESSION_EXPIRED, signedOut);
  }, []);

  // Nothing is reachable without a session — not even the browse page, so
  // the app never renders a screen it would then have to take away.
  if (!session) {
    return (
      <ToastProvider>
        <DevBanner />
        <Login onSignedIn={setSession} />
      </ToastProvider>
    );
  }

  // A guest gets the browse screen and nothing else. The API refuses guest
  // writes regardless; this is so the app does not offer what it cannot do.
  if (!isOperator(session)) {
    return (
      <ToastProvider>
        <DevBanner />
        <ChunkBoundary>
          {/* fallback={null}: the page keeps its background while a chunk
              loads, which on a LAN is a handful of milliseconds. */}
          <Suspense fallback={null}>
            <Routes>
              <Route path="/browse" element={<Browse readOnly />} />
              <Route path="*" element={<Navigate to="/browse" replace />} />
            </Routes>
          </Suspense>
        </ChunkBoundary>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <DevBanner />
      <ChunkBoundary>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/new" element={<StyleEditor key="new" />} />
            <Route path="/report" element={<Report />} />
            <Route path="/checklist" element={<Checklist />} />
            <Route path="/matrix" element={<Matrix />} />
            <Route path="/design" element={<Design />} />
            <Route path="/colors" element={<ColorTable />} />
            <Route path="/print" element={<PrintSheet />} />
            <Route path="/edit/:id" element={<StyleEditor />} />
          </Routes>
        </Suspense>
      </ChunkBoundary>
    </ToastProvider>
  );
}
