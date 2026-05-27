import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { api, formatCurrency, formatNumber } from '../api/queries';
import type { SummaryStats, ParcelSearchResult } from '../types';

// Leaflet's default marker icon URLs are bundler-hostile; serve from
// public/leaflet via BASE_URL (Fastly-cached) instead of hot-linking unpkg.
const LEAFLET_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/leaflet`;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_BASE}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_BASE}/marker-icon.png`,
  shadowUrl: `${LEAFLET_BASE}/marker-shadow.png`,
});

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [recent, setRecent] = useState<ParcelSearchResult[]>([]);

  useEffect(() => {
    api.getSummary().then(setStats);
    api.searchParcels({ limit: 4 }).then((r) => setRecent(r.results.slice(0, 4)));
  }, []);

  return (
    <>
      {/* MINIMAL TITLE STRIP */}
      <section className="text-white animate-fade-up" style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 60%, #111827 100%)' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight whitespace-nowrap text-white">
              What a modern data product looks like.
            </h1>
            <span className="hidden md:inline text-xs" style={{ color: '#6b7280' }}>
              575K records · refreshed daily · zero ETL maintenance
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm">
            <InlineStat label="Parcels" value={stats ? formatNumber(stats.total_parcels) : '—'} />
            <InlineStat label="Avg assessed" value={stats ? formatCurrency(stats.avg_assessed_value) : '—'} />
            <InlineStat label="Exemptions" value={stats ? formatCurrency(stats.total_exemptions) : '—'} />
            <button
              onClick={() => navigate('/pipeline')}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.2)' }}
              title="Pipeline Health"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Pipeline Live
            </button>
          </div>
        </div>
      </section>

      {/* TWO HERO TILES — side by side on lg+ */}
      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <FindPropertySpotlight
            onGo={(q) => navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')}
            recent={recent}
          />
          <AgentSpotlight
            onAsk={(q) => navigate(`/agent?q=${encodeURIComponent(q)}`)}
            onOpen={() => navigate('/agent')}
            onAbout={() => navigate('/about-agent')}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Featured properties</h2>
            <p className="text-sm text-slate-500">
              Live samples of recently assessed properties — every row traces back to a governed warehouse table.
            </p>
          </div>
          <button
            onClick={() => navigate('/search')}
            className="text-sm font-medium text-primary-700 hover:text-primary-900"
          >
            View all properties →
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {recent.map((p) => (
            <FeaturedPropertyCard
              key={p.parcel_id}
              parcel={p}
              onClick={() => navigate(`/parcels/${encodeURIComponent(p.parcel_id)}`)}
            />
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">Built on a modern data stack</h2>
          <p className="text-slate-500 mb-10">
            Every value on this page traces back through governed, observable infrastructure.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: '1', name: 'Fivetran', desc: 'Connect any source in minutes — 700+ pre-built connectors, no custom code required.', bar: '#f59e0b' },
              { step: '2', name: 'Databricks', desc: 'One governed copy of every record — auditable, observable, queryable.', bar: '#d97706' },
              { step: '3', name: 'dbt', desc: 'Trusted business logic, version-controlled — tests guard every transformation.', bar: '#b45309' },
              { step: '4', name: 'React', desc: 'Ship a public-facing data product on top of your warehouse — no middleware.', bar: '#92400e' },
            ].map((s) => (
              <div key={s.name} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="h-1" style={{ background: s.bar }} />
                <div className="p-5">
                  <div className="text-xs font-mono text-slate-400">STEP {s.step}</div>
                  <div className="mt-1 text-lg font-display font-semibold text-slate-900">{s.name}</div>
                  <div className="mt-2 text-sm text-slate-500">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-wider font-medium" style={{ color: '#6b7280' }}>{label}</div>
      <div className="text-sm sm:text-base font-display font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}

function FindPropertySpotlight({
  onGo,
  recent: _recent,
}: {
  onGo: (q: string) => void;
  recent: ParcelSearchResult[];
}) {
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onGo(q.trim());
  };
  const samples = ['Squirrel Hill', 'Mt Lebanon', 'Glenshaw', '15217', '15116'];
  return (
    <div className="relative overflow-hidden rounded-2xl text-white shadow-xl h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 40%, #f59e0b 100%)' }}>
      {/* Road-grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          opacity: 0.35,
        }}
      />

      <div className="relative p-6 sm:p-7 flex flex-col gap-5 flex-1">
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-black/20 backdrop-blur-sm px-3 py-1 text-xs font-display font-medium uppercase tracking-wider text-amber-100">
          Find Property
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-white">
            Search any parcel in Allegheny County
          </h2>
          <p className="mt-2 text-sm sm:text-base" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Address, parcel ID, owner, or neighborhood. Returns assessment history, exemptions,
            appeals, comparables, and an estimated tax bill.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="2920 Angeline Dr, Glenshaw"
            className="flex-1 min-w-0 rounded-md border-0 px-4 py-3 text-base text-slate-900 placeholder:text-slate-500 shadow-lg focus:outline-2 focus:outline-white"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-3 text-base font-display font-semibold shadow-lg transition-all whitespace-nowrap"
            style={{ background: '#111827', color: '#f59e0b' }}
          >
            Search
            <span aria-hidden>→</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-auto">
          <span className="text-xs self-center mr-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Try:</span>
          {samples.map((s) => (
            <button
              key={s}
              onClick={() => onGo(s)}
              className="text-xs sm:text-sm rounded-lg backdrop-blur-sm px-3 py-1.5 transition-colors"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentSpotlight({
  onAsk,
  onOpen,
  onAbout,
}: {
  onAsk: (q: string) => void;
  onOpen: () => void;
  onAbout: () => void;
}) {
  const samples = [
    'Biggest YoY assessment jumps?',
    'Parcels in ZIP 15217',
    'Homestead exemptions',
    'Compare cities',
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl text-white shadow-xl h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 60%, #111827 100%)' }}>
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(245,158,11,0.18) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative p-6 sm:p-7 flex flex-col gap-5 flex-1">
        <div className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-display font-medium uppercase tracking-wider" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
          AI Agent
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold leading-tight text-white">
            Ask the Property Insight Agent
          </h2>
          <p className="mt-2 text-sm sm:text-base" style={{ color: '#9ca3af' }}>
            Skip the form — ask in plain English. The local rules engine answers instantly;
            opt-in Claude mode handles harder questions.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {samples.map((s) => (
            <button
              key={s}
              onClick={() => onAsk(s)}
              className="group/chip text-left text-sm sm:text-base rounded-lg px-4 py-3 transition-colors flex items-center justify-between gap-3"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb' }}
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden style={{ color: '#fbbf24' }}>→</span>
                <span>{s}</span>
              </span>
              <span
                aria-hidden
                className="group-hover/chip:translate-x-0.5 transition-transform"
                style={{ color: '#6b7280' }}
              >
                →
              </span>
            </button>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={onOpen}
            className="inline-flex w-fit items-center gap-2 rounded-md px-5 py-3 text-base font-display font-semibold shadow-lg transition-colors"
            style={{ background: '#f59e0b', color: '#111827' }}
          >
            Open the agent
            <span aria-hidden>→</span>
          </button>
          <button
            onClick={onAbout}
            className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
            style={{ color: '#9ca3af' }}
          >
            How it works
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Featured property card with a live mini-map. WPRDC doesn't ship parcel
// imagery and every third-party static-map service we tried is either
// dead (staticmap.openstreetmap.de) or returns 403 (Wikimedia). A small
// non-interactive Leaflet map is reliable and uses the same OSM tile
// infra the parcel detail page already loads.
function FeaturedPropertyCard({
  parcel,
  onClick,
}: {
  parcel: ParcelSearchResult;
  onClick: () => void;
}) {
  const hasCoords = parcel.latitude != null && parcel.longitude != null;
  const gradient = gradientForLandUse(parcel.land_use_description);

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open parcel at ${parcel.address}, ${parcel.city}`}
      className="text-left rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-lg hover:border-primary-300 transition-all overflow-hidden group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <div className={`relative h-36 overflow-hidden ${gradient}`}>
        {hasCoords && (
          <div className="absolute inset-0 pointer-events-none">
            <MapContainer
              center={[parcel.latitude!, parcel.longitude!]}
              zoom={16}
              zoomControl={false}
              attributionControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
              boxZoom={false}
              keyboard={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[parcel.latitude!, parcel.longitude!]} />
            </MapContainer>
          </div>
        )}
        {/* dark gradient overlay so the address chip is always readable */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
        <div className="absolute top-2 left-2 z-[400]">
          <span className="rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-mono text-slate-700 shadow">
            {parcel.parcel_id}
          </span>
        </div>
        <div className="absolute bottom-2 right-2 z-[400]">
          <ChangeChip pct={parcel.assessed_value_change_pct} />
        </div>
      </div>
      <div className="p-4">
        <div className="font-semibold text-slate-900 truncate">{parcel.address}</div>
        <div className="text-xs text-slate-500 truncate">
          {parcel.city} · {parcel.zip_code}
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-lg font-bold text-primary-700 tabular-nums">
            {formatCurrency(parcel.assessed_value)}
          </div>
          <div className="text-[11px] text-slate-400 truncate ml-2">
            {parcel.land_use_description}
          </div>
        </div>
      </div>
    </div>
  );
}

function gradientForLandUse(use: string | null | undefined): string {
  const u = (use ?? '').toLowerCase();
  if (u.includes('commercial')) return 'bg-gradient-to-br from-amber-400 to-orange-600';
  if (u.includes('industrial')) return 'bg-gradient-to-br from-slate-500 to-slate-700';
  if (u.includes('multi') || u.includes('apartment')) return 'bg-gradient-to-br from-primary-500 to-primary-800';
  if (u.includes('vacant')) return 'bg-gradient-to-br from-emerald-400 to-teal-600';
  // Residential / single family / default
  return 'bg-gradient-to-br from-sky-500 to-primary-700';
}

function ChangeChip({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <span
      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
        up ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
      }`}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
