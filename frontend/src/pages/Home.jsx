import { Link } from 'react-router-dom';
import { CirclePlus, ClipboardList, TextSearch, FileSpreadsheet, BarChart3, Table2, FileDown} from 'lucide-react';

export default function Home() {
  return (
    <>
      <header className="band home-band">
        <div className="logo logo-center" style={{ display: 'block' }}>IM Master</div>
      </header>

      <main className="home-wrap">
        <Link to="/new" className="home-card">
          <span className="icon-frame"><CirclePlus size={54} strokeWidth={1.6} /></span>
          <span className="label">Add</span>
        </Link>

        <Link to="/browse" className="home-card">
          <span className="icon-frame"><TextSearch size={54} strokeWidth={1.6} /></span>
          <span className="label">Browse / Edit</span>
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
