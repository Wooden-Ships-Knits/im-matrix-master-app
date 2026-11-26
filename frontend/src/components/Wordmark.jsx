import { Link } from 'react-router-dom';

/**
 * The app's name, in one place.
 *
 * It was written out in seven files, so renaming it meant finding all seven —
 * which is how the title in index.html ends up disagreeing with the header.
 *
 * "PDM" carries the header and the full phrase sits beside it, because
 * "PDM (Product Data Management)" set at the logo's 2.1rem does not fit in a
 * band that also holds the navigation. The expansion is there for whoever has
 * not met the abbreviation yet, and steps aside on a narrow screen.
 */
export const APP_NAME = 'PDM';
export const APP_NAME_FULL = 'Product Data Management';

export default function Wordmark({ to = '/', centred = false }) {
  const inner = (
    <>
      <span className="logo-mark">{APP_NAME}</span>
      <span className="logo-expand">{APP_NAME_FULL}</span>
    </>
  );
  const className = `logo${centred ? ' logo-center' : ''}`;

  // On the home page the name is not a link to the page you are already on.
  if (!to) return <div className={className}>{inner}</div>;
  return <Link to={to} className={className}>{inner}</Link>;
}
