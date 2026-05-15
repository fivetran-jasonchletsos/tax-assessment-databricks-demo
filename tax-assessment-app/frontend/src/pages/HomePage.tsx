import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { api, formatCurrency, formatNumber } from '../api/queries';
import type { SummaryStats, ParcelSearchResult } from '../types';

// Leaflet's default marker icon URLs are bundler-hostile; point them at the
// CDN explicitly (same fix used on the parcel detail page).
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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
      <section className="bg-gradient-to-r from-primary-800 to-primary-900 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight whitespace-nowrap">
              Know your property's assessment.
            </h1>
            <span className="hidden md:inline text-xs text-primary-200">
              Allegheny County · Updated daily via Fivetran
            </span>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm">
            <InlineStat label="Parcels" value={stats ? formatNumber(stats.total_parcels) : '—'} />
            <InlineStat label="Avg assessed" value={stats ? formatCurrency(stats.avg_assessed_value) : '—'} />
            <InlineStat label="Exemptions" value={stats ? formatCurrency(stats.total_exemptions) : '—'} />
            <button
              onClick={() => navigate('/pipeline')}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 px-2.5 py-1 text-[11px] font-medium transition-colors"
              title="Pipeline Health"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
              A snapshot of recently assessed parcels from the marts schema.
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

      <section className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Built on a modern data stack</h2>
          <p className="text-slate-500 mb-10">
            Every value on this page traces back through governed, observable infrastructure.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: '1', name: 'Fivetran', desc: 'Custom Python SDK connector syncs WPRDC + Allegheny County records.', color: 'from-sky-500 to-sky-700' },
              { step: '2', name: 'Databricks', desc: 'Unity Catalog governs raw, staging, and mart schemas.', color: 'from-primary-900 to-rose-700' },
              { step: '3', name: 'dbt', desc: 'Tested transformations produce dimension and fact tables.', color: 'from-orange-500 to-orange-700' },
              { step: '4', name: 'FastAPI + React', desc: 'Public-facing portal queries the marts layer.', color: 'from-emerald-500 to-emerald-700' },
            ].map((s) => (
              <div key={s.name} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className={`h-1.5 bg-gradient-to-r ${s.color}`} />
                <div className="p-5">
                  <div className="text-xs font-mono text-slate-400">STEP {s.step}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{s.name}</div>
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
      <div className="text-[10px] uppercase tracking-wider text-primary-200 font-medium">{label}</div>
      <div className="text-sm sm:text-base font-semibold tabular-nums">{value}</div>
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 via-primary-600 to-primary-800 text-white shadow-xl h-full flex flex-col">
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative p-6 sm:p-7 flex flex-col gap-5 flex-1">
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-medium uppercase tracking-wider">
          🔎 Find Property
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
            Search any parcel in Allegheny County
          </h2>
          <p className="mt-2 text-sm sm:text-base text-primary-100">
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
            className="flex-1 min-w-0 rounded-md border-0 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 shadow-lg focus:outline-2 focus:outline-amber-300"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-500 hover:bg-amber-400 px-5 py-3 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition-all hover:shadow-amber-500/50 whitespace-nowrap"
          >
            Search
            <span aria-hidden>→</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-auto">
          <span className="text-xs text-primary-200 self-center mr-1">Try:</span>
          {samples.map((s) => (
            <button
              key={s}
              onClick={() => onGo(s)}
              className="text-xs sm:text-sm rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-1.5 transition-colors border border-white/15"
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 text-white shadow-xl h-full flex flex-col">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative p-6 sm:p-7 flex flex-col gap-5 flex-1">
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-medium uppercase tracking-wider">
          <span aria-hidden>✨</span> AI Agent
        </div>
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
            Ask the Property Insight Agent
          </h2>
          <p className="mt-2 text-sm sm:text-base text-primary-50">
            Skip the form — ask in plain English. The local rules engine answers instantly;
            opt-in Claude mode handles harder questions.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {samples.map((s) => (
            <button
              key={s}
              onClick={() => onAsk(s)}
              className="group/chip text-left text-sm sm:text-base rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-4 py-3 transition-colors border border-white/15 flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2.5">
                <span aria-hidden className="text-primary-100">✨</span>
                <span>{s}</span>
              </span>
              <span
                aria-hidden
                className="text-primary-100 group-hover/chip:translate-x-0.5 transition-transform"
              >
                →
              </span>
            </button>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={onOpen}
            className="inline-flex w-fit items-center gap-2 rounded-md bg-white text-primary-700 px-5 py-3 text-base font-semibold shadow-lg hover:bg-primary-50 transition-colors"
          >
            Open the agent
            <span aria-hidden>→</span>
          </button>
          <button
            onClick={onAbout}
            className="inline-flex items-center gap-1.5 text-sm text-primary-50 hover:text-white font-medium underline-offset-4 hover:underline"
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
      className="text-left rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-lg hover:border-primary-300 transition-all overflow-hidden group cursor-pointer"
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
