import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, getSnapshotTime, subscribeSource, type DataSource } from '../api/queries';

export default function Layout() {
  const [source, setSource] = useState<DataSource>('demo');
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeSource(setSource);
    // Kick off summary load so the source/snapshot metadata gets populated.
    api.getSummary().finally(() => setSnapshotAt(getSnapshotTime()));
    return unsub;
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-primary-800 text-white shadow-sm sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <div className="h-9 w-9 rounded-lg bg-primary-500 flex items-center justify-center font-bold text-sm">
                AC
              </div>
              <div className="leading-tight">
                <div className="font-semibold text-sm sm:text-base">Allegheny County</div>
                <div className="text-[11px] sm:text-xs text-primary-200">Tax Assessment Portal</div>
              </div>
            </Link>

            <form onSubmit={onSubmit} className="hidden md:flex flex-1 max-w-xl">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search address, parcel ID, or owner..."
                className="flex-1 rounded-l-md border-0 px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-primary-300"
              />
              <button
                type="submit"
                className="rounded-r-md bg-primary-600 hover:bg-primary-500 px-4 py-2 text-sm font-medium border border-primary-600 transition-colors"
              >
                Search
              </button>
            </form>

            <nav className="hidden lg:flex items-center gap-1 text-sm">
              {[
                ['/', 'Home'],
                ['/search', 'Properties'],
                ['/analytics', 'Analytics'],
                ['/agent', 'Ask AI'],
                ['/about', 'About'],
              ].map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-md transition-colors ${
                      isActive ? 'bg-primary-700' : 'hover:bg-primary-700/60'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            <SourceBadge source={source} snapshotAt={snapshotAt} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-sm text-slate-500 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div>
            Data flow:{' '}
            <strong className="text-slate-700">
              Fivetran → Databricks Unity Catalog → dbt → daily JSON snapshot
            </strong>
          </div>
          <div>© 2026 Allegheny County · Demo build</div>
        </div>
      </footer>
    </div>
  );
}

function SourceBadge({ source, snapshotAt }: { source: DataSource; snapshotAt: string | null }) {
  const live = source === 'live';
  const when = snapshotAt ? new Date(snapshotAt) : null;
  const ago = when ? relativeTime(when) : null;
  return (
    <div
      title={
        live
          ? `Live Databricks snapshot${ago ? ` · refreshed ${ago}` : ''}`
          : 'Curated sample — set DATABRICKS_* repo secrets to enable live snapshots'
      }
      className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        live ? 'bg-emerald-500/20 text-emerald-100' : 'bg-amber-500/20 text-amber-100'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          live ? 'bg-emerald-400' : 'bg-amber-300'
        } animate-pulse`}
      />
      {live ? `Databricks · ${ago ?? 'snapshot'}` : 'Demo snapshot'}
    </div>
  );
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
