import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Browse from './pages/Browse.jsx';
import StyleEditor from './pages/StyleEditor.jsx';
import Report from './pages/Report.jsx';
import Checklist from './pages/Checklist.jsx';
import Matrix from './pages/Matrix.jsx';
import PrintSheet from './pages/PrintSheet.jsx';
import Login from './pages/Login.jsx';
import { readSession, isOperator, SESSION_EXPIRED } from './session.js';
import DevBanner from './components/DevBanner.jsx';

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
        <Routes>
          <Route path="/browse" element={<Browse readOnly />} />
          <Route path="*" element={<Navigate to="/browse" replace />} />
        </Routes>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <DevBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/new" element={<StyleEditor key="new" />} />
        <Route path="/report" element={<Report />} />
        <Route path="/checklist" element={<Checklist />} />
        <Route path="/matrix" element={<Matrix />} />
        <Route path="/print" element={<PrintSheet />} />
        <Route path="/edit/:id" element={<StyleEditor />} />
      </Routes>
    </ToastProvider>
  );
}
