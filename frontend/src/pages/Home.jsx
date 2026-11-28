import { Link } from 'react-router-dom';
import Wordmark from '../components/Wordmark.jsx';
import { CirclePlus, ClipboardList, TextSearch, ListChecks, FileSpreadsheet, BarChart3, Table2, FileDown, Palette, SwatchBook} from 'lucide-react';

// The colour work is its own app, on its own subdomain. Written here rather
// than inline so there is one place to change when it moves, and so it is
// obvious at the top of the file that one of these cards leaves PDM.
const COLOR_BOARD = 'https://color-board.pt-infashion.com';

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

        {/* ---------------------------------------------------------------
            Hidden on purpose — 26 Nov 2026. The rebuild is being shown one
            screen at a time, so the front door offers Add and Matrix and
            nothing else for now. Nothing is removed: the routes all still
            work, so /browse, /design, /colors, /checklist and /report open
            if you type the address, and the top band of every other page
            still links to them.

            Color Table came back on 28 Nov as Color Board, above — pointing
            at the separate colour app rather than at /colors.

            Uncomment a card to put it back.
            --------------------------------------------------------------- */}

        {/* <Link to="/browse" className="home-card">
          <span className="icon-frame"><TextSearch size={54} strokeWidth={1.6} /></span>
          <span className="label">Browse / Edit</span>
        </Link> */}

        {/* After Matrix and before Checklist: it is the other way of
            reading the same styles, and it is read while the garment is
            still being designed rather than once it is being prepared.
        <Link to="/design" className="home-card">
          <span className="icon-frame"><Palette size={54} strokeWidth={1.6} /></span>
          <span className="label">Design</span>
        </Link> */}

        {/* Called Color Board, and it leaves PDM.

            The colour work lives in its own app at color-board.pt-infashion.com
            for now. PDM's own /colors screen is still here and still works if
            you type the address — this card simply is not the way to it, so
            an <a>, not a <Link>: a router link to an address the router does
            not own goes nowhere.

            Same tab, not a new one. It is a destination, not a reference
            looked up beside what you were doing, and the front door has no
            unsaved work to come back to. */}
        <a href={COLOR_BOARD} className="home-card">
          <span className="icon-frame"><SwatchBook size={54} strokeWidth={1.6} /></span>
          <span className="label">Color Board</span>
        </a>

        {/* <Link to="/checklist" className="home-card">
          <span className="icon-frame"><ListChecks size={54} strokeWidth={1.6} /></span>
          <span className="label">Checklist</span>
        </Link> */}

        {/* <Link to="/report" className="home-card">
          <span className="icon-frame"><ClipboardList size={54} strokeWidth={1.6} /></span>
          <span className="label">Report</span>
        </Link> */}
      </main>

      <footer className="home-foot">
        PT In Fashion — knitwear style master data
      </footer>
    </>
  );
}
