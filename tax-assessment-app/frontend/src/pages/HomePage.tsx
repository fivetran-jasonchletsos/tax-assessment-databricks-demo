import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatCurrency, formatNumber } from '../api/queries';
import type { SummaryStats, ParcelSearchResult } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [recent, setRecent] = useState<ParcelSearchResult[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.getSummary().then(setStats);
    api.searchParcels({ limit: 4 }).then((r) => setRecent(r.results.slice(0, 4)));
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  };

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 text-white">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 25% 30%, white 1px, transparent 1px), radial-gradient(circle at 75% 70%, white 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary-100">
              Public Records · Updated Daily via Fivetran
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Know your property's assessment.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-primary-100">
              Search any property in Allegheny County. View assessment history, exemptions,
              appeal outcomes, and comparables — all from one place.
            </p>

            <form onSubmit={submit} className="mt-8 flex max-w-2xl flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="123 Forbes Ave, Pittsburgh — or 0001-A-00150"
                className="flex-1 rounded-md border-0 px-5 py-4 text-base text-slate-900 placeholder:text-slate-400 shadow-lg focus:outline-2 focus:outline-primary-300"
              />
              <button
                type="submit"
                className="rounded-md bg-amber-500 hover:bg-amber-400 px-6 py-4 text-base font-semibold text-slate-900 shadow-lg transition-colors"
              >
                Find Property
              </button>
            </form>

            <div className="mt-3">
              <button
                onClick={() => navigate('/agent')}
                className="inline-flex items-center gap-2 rounded-full bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 px-4 py-1.5 text-sm font-medium transition-colors"
              >
                <span aria-hidden>✨</span>
                Ask the Property Insight Agent
              </button>
            </div>

            <div className="mt-4 text-sm text-primary-200">
              Popular searches:{' '}
              {['Squirrel Hill', 'Mt Lebanon', 'Northside', 'Downtown'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => navigate(`/search?q=${encodeURIComponent(label)}`)}
                  className="underline-offset-2 hover:underline hover:text-white"
                >
                  {label}
                  {i < 3 ? ' · ' : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 -mt-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Properties Tracked"
            value={stats ? formatNumber(stats.total_parcels) : '—'}
            caption={`Tax year ${stats?.current_tax_year ?? '—'}`}
          />
          <StatTile
            label="Avg Assessed Value"
            value={stats ? formatCurrency(stats.avg_assessed_value) : '—'}
            caption="Current year baseline"
          />
          <StatTile
            label="Exemptions Granted"
            value={stats ? formatCurrency(stats.total_exemptions) : '—'}
            caption="Homestead + senior + veteran"
          />
          <button
            onClick={() => navigate('/pipeline')}
            className="text-left rounded-xl bg-white border border-slate-200 shadow-md p-5 hover:border-emerald-300 hover:shadow-lg transition-all"
          >
            <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
              Pipeline Status
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </div>
            <div className="mt-1 text-xs text-slate-400">View details →</div>
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
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
            <button
              key={p.parcel_id}
              onClick={() => navigate(`/parcels/${encodeURIComponent(p.parcel_id)}`)}
              className="text-left rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-primary-300 transition-all"
            >
              <div className="text-xs text-slate-500 font-mono">{p.parcel_id}</div>
              <div className="mt-2 font-semibold text-slate-900">{p.address}</div>
              <div className="text-sm text-slate-500">
                {p.city}, PA {p.zip_code}
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <div className="text-lg font-bold text-primary-700">
                  {formatCurrency(p.assessed_value)}
                </div>
                <ChangeChip pct={p.assessed_value_change_pct} />
              </div>
              <div className="mt-2 text-xs text-slate-400">{p.land_use_description}</div>
            </button>
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
              { step: '2', name: 'Databricks', desc: 'Unity Catalog governs raw, staging, and mart schemas.', color: 'from-rose-500 to-rose-700' },
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

function StatTile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: 'success';
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-md p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div
        className={`mt-2 text-2xl font-bold ${
          tone === 'success' ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      {caption && <div className="mt-1 text-xs text-slate-400">{caption}</div>}
    </div>
  );
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
