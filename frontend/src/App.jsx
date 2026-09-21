import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Browse from './pages/Browse.jsx';
import StyleEditor from './pages/StyleEditor.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/browse" element={<Browse />} />
        <Route path="/new" element={<StyleEditor key="new" />} />
        <Route path="/edit/:id" element={<StyleEditor />} />
      </Routes>
    </ToastProvider>
  );
}
