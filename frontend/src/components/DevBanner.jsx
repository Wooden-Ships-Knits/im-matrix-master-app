import { useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * Shown across the top of every page when the backend says it is a dev one.
 *
 * The development and production sites are identical to look at, and only one
 * of them holds the data people rely on — so the difference has to be visible
 * rather than remembered.
 *
 * It renders nothing in production. A banner that is usually there is a
 * banner nobody reads.
 */
export default function DevBanner() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    // A failure here must never blank the page it sits above: no banner is
    // the right answer when we cannot tell which environment this is.
    api.health()
      .then((h) => { if (h?.dev) setInfo(h); })
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <div className="dev-banner" role="status">
      <strong>DEVELOPMENT</strong>
      <span>
        Not the live site — this database is {info.db_name || 'local'} and
        anything here can be reset without notice.
      </span>
    </div>
  );
}
