import { Link } from 'react-router-dom';
import Wordmark from '../components/Wordmark.jsx';
import { CirclePlus, ClipboardList, TextSearch, ListChecks, FileSpreadsheet, BarChart3, Table2, FileDown, Palette, SwatchBook} from 'lucide-react';

export default function Home() {
  return (
    <>
      <header className="band home-band">
        <Wordmark to={null} centred />
      </header>

      <main className="home-wrap">
        <Link to="/new" className="home-card">
          <span className="icon-frame"><CirclePlus size={54} strokeWidth={1.6} /></span>
          <span className="label">Add</span>
        </Link>

        <Link to="/matrix" className="home-card">
          <span className="icon-frame"><Table2 size={54} strokeWidth={1.6} /></span>
          <span className="label">Matrix</span>
        </Link>

        <Link to="/browse" className="home-card">
          <span className="icon-frame"><TextSearch size={54} strokeWidth={1.6} /></span>
          <span className="label">Browse / Edit</span>
        </Link>

        {/* After Matrix and before Checklist: it is the other way of
            reading the same styles, and it is read while the garment is
            still being designed rather than once it is being prepared. */}
        <Link to="/design" className="home-card">
          <span className="icon-frame"><Palette size={54} strokeWidth={1.6} /></span>
          <span className="label">Design</span>
        </Link>

        {/* Beside Design: the same colours read the other way round — by
            yarn rather than by style. */}
        <Link to="/colors" className="home-card">
          <span className="icon-frame"><SwatchBook size={54} strokeWidth={1.6} /></span>
          <span className="label">Color Table</span>
        </Link>

        <Link to="/checklist" className="home-card">
          <span className="icon-frame"><ListChecks size={54} strokeWidth={1.6} /></span>
          <span className="label">Checklist</span>
        </Link>

        <Link to="/report" className="home-card">
          <span className="icon-frame"><ClipboardList size={54} strokeWidth={1.6} /></span>
          <span className="label">Report</span>
        </Link>
      </main>

      <footer className="home-foot">
        PT In Fashion — knitwear style master data
      </footer>
    </>
  );
}
