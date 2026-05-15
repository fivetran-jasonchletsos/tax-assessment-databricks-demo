import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { api, getSnapshotTime, subscribeSource, type DataSource } from '../api/queries';
import * as watchlist from '../watchlist';
import DefenderSync from './DefenderSync';
import HelpTour from './HelpTour';

// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A — unlocks the DefenderSync easter egg.
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

const NAV_ITEMS: [string, string][] = [
  ['/', 'Home'],
  ['/search', 'Properties'],
  ['/dashboard', 'Dashboard'],
  ['/map', 'Map'],
  ['/agent', 'Ask AI'],
  ['/pipeline', 'Pipeline'],
  ['/about', 'About'],
];

type DemoEntry = { key: string; name: string; industry: string; url: string; accent: string };
const DEMOS: DemoEntry[] = [
  { key: 'healthcare', name: 'Epic Clarity', industry: 'Healthcare · Clinical analytics', url: 'https://fivetran-jasonchletsos.github.io/Healthcare-EPIC-Snowflake-Demo/', accent: '#0d9488' },
  { key: 'tax-assessment', name: 'Allegheny County Tax', industry: 'Public sector · Property assessment', url: 'https://fivetran-jasonchletsos.github.io/fivetran-sheetz-demo/', accent: '#dc2626' },
  { key: 'finserv',    name: 'Meridian', industry: 'Financial Services · Wealth & banking', url: 'https://fivetran-jasonchletsos.github.io/FinServ-ODI-Demo/', accent: '#1d4ed8' },
  { key: 'media',      name: 'Lighthouse', industry: 'Media · Audience & content intel', url: 'https://fivetran-jasonchletsos.github.io/Media-ODI-Demo/', accent: '#7c3aed' },
];
const CURRENT_DEMO = 'tax-assessment';

export default function Layout() {
  const [source, setSource] = useState<DataSource>('demo');
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [watchCount, setWatchCount] = useState(0);
  const [spaceSyncOpen, setSpaceSyncOpen] = useState(false);
  const konamiBufferRef = useRef<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = subscribeSource(setSource);
    api.getSummary().finally(() => setSnapshotAt(getSnapshotTime()));
    const wsub = watchlist.subscribe((ids) => setWatchCount(ids.length));
    return () => {
      unsub();
      wsub();
    };
  }, []);

  // Konami code listener — unlocks the DefenderSync easter egg.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;
      const key = e.key.toLowerCase();
      const buf = konamiBufferRef.current;
      buf.push(key);
      if (buf.length > KONAMI.length) buf.shift();
      if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i])) {
        konamiBufferRef.current = [];
        setSpaceSyncOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close mobile drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    setMobileOpen(false);
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="bg-primary-800 text-white shadow-sm sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary-500 flex items-center justify-center font-bold text-sm">
                AC
              </div>
              <div className="leading-tight min-w-0">
                <div className="font-semibold text-sm sm:text-base truncate">Allegheny County</div>
                <div className="text-[10px] sm:text-xs text-primary-200 hidden xs:block sm:block">
                  Tax Assessment Portal
                </div>
              </div>
            </Link>

            {/* Desktop search */}
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
                aria-label="Search"
                className="inline-flex items-center justify-center rounded-r-md bg-primary-600 hover:bg-primary-500 px-3 border border-primary-600 transition-colors"
              >
                <SearchIcon className="h-4 w-4" />
              </button>
            </form>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1 text-sm">
              {NAV_ITEMS.map(([to, label]) => (
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/watchlist')}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-primary-700/70"
                aria-label="Watchlist"
                title="Watchlist"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill={watchCount > 0 ? '#fbbf24' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                {watchCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-900">
                    {watchCount}
                  </span>
                )}
              </button>
              <DemoSwitcher source={source} snapshotAt={snapshotAt} />
              {/* Mobile menu toggle */}
              <button
                type="button"
                onClick={() => setMobileOpen((o) => !o)}
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileOpen}
                className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-primary-700/70"
              >
                {mobileOpen ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile drawer */}
          {mobileOpen && (
            <div className="lg:hidden pb-3 border-t border-primary-700/40 pt-3 space-y-3">
              <form onSubmit={onSubmit} className="md:hidden flex">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search address, parcel, owner..."
                  className="flex-1 rounded-l-md border-0 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-2 focus:outline-primary-300"
                />
                <button
                  type="submit"
                  aria-label="Search"
                  className="inline-flex items-center justify-center rounded-r-md bg-primary-600 hover:bg-primary-500 px-3 border border-primary-600 transition-colors"
                >
                  <SearchIcon className="h-4 w-4" />
                </button>
              </form>
              <nav className="grid grid-cols-2 gap-1 text-sm">
                {NAV_ITEMS.map(([to, label]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      `px-3 py-2 rounded-md transition-colors text-center ${
                        isActive ? 'bg-primary-700' : 'bg-primary-700/30 hover:bg-primary-700/60'
                      }`
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="pt-2 border-t border-primary-700/40">
                <div className="text-[10px] uppercase tracking-wider text-primary-200 mb-2">
                  Switch demo
                </div>
                <div className="grid grid-cols-1 gap-1">
                  {DEMOS.map((d) => {
                    const isCurrent = d.key === CURRENT_DEMO;
                    const inner = (
                      <>
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: d.accent }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{d.name}</div>
                          <div className="text-[11px] text-primary-200 truncate">{d.industry}</div>
                        </div>
                        {isCurrent && (
                          <span className="text-[10px] uppercase tracking-wider bg-primary-700 text-primary-100 rounded px-1.5 py-0.5">
                            Current
                          </span>
                        )}
                      </>
                    );
                    return isCurrent ? (
                      <div
                        key={d.key}
                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary-700/30 opacity-70"
                      >
                        {inner}
                      </div>
                    ) : (
                      <a
                        key={d.key}
                        href={d.url}
                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary-700/30 hover:bg-primary-700/60 transition-colors"
                      >
                        {inner}
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      <HelpTour />

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 text-xs sm:text-sm text-slate-500 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div>
            Data flow:{' '}
            <strong className="text-slate-700">
              Fivetran → Databricks → dbt → daily refresh
            </strong>
          </div>
          <div>© 2026 Allegheny County</div>
        </div>
      </footer>

      {spaceSyncOpen && <DefenderSync onClose={() => setSpaceSyncOpen(false)} />}
    </div>
  );
}

function DemoSwitcher({ source, snapshotAt }: { source: DataSource; snapshotAt: string | null }) {
  const live = source === 'live';
  const when = snapshotAt ? new Date(snapshotAt) : null;
  const ago = when ? relativeTime(when) : null;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const title = live
    ? `Live Databricks snapshot${ago ? ` · refreshed ${ago}` : ''} — click to switch demo`
    : 'Curated sample — click to switch demo';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium transition-colors ${
          live ? 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' : 'bg-amber-500/20 text-amber-100 hover:bg-amber-500/30'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${
            live ? 'bg-emerald-400' : 'bg-amber-300'
          } animate-pulse`}
        />
        <span className="hidden xs:inline sm:inline">{live ? `Databricks · ${ago ?? 'snapshot'}` : 'Demo'}</span>
        <span className="xs:hidden sm:hidden">{live ? '●' : '○'}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[280px] rounded-lg bg-white text-slate-900 shadow-lg ring-1 ring-black/10 overflow-hidden z-40"
        >
          <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Switch demo
          </div>
          <div className="py-1">
            {DEMOS.map((d) => {
              const isCurrent = d.key === CURRENT_DEMO;
              const inner = (
                <>
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: d.accent }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{d.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] uppercase tracking-wider bg-slate-200 text-slate-700 rounded px-1.5 py-0.5">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{d.industry}</div>
                  </div>
                </>
              );
              return isCurrent ? (
                <div
                  key={d.key}
                  className="flex items-start gap-2.5 px-3 py-2 opacity-70"
                >
                  {inner}
                </div>
              ) : (
                <a
                  key={d.key}
                  href={d.url}
                  className="flex items-start gap-2.5 px-3 py-2 hover:bg-slate-100 transition-colors"
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
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
