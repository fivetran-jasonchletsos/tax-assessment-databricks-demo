import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, formatCurrency } from '../api/queries';
import type { ParcelSearchResult } from '../types';

export default function SearchPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [city, setCity] = useState(params.get('city') ?? '');
  const [zip, setZip] = useState(params.get('zip') ?? '');
  const [results, setResults] = useState<ParcelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'value-desc' | 'value-asc' | 'change-desc'>('value-desc');

  useEffect(() => {
    setLoading(true);
    api
      .searchParcels({
        q: params.get('q') ?? undefined,
        city: params.get('city') ?? undefined,
        zip: params.get('zip') ?? undefined,
        limit: 200,
      })
      .then((r) => setResults(r.results))
      .finally(() => setLoading(false));
  }, [params]);

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      if (sort === 'value-desc') return b.assessed_value - a.assessed_value;
      if (sort === 'value-asc') return a.assessed_value - b.assessed_value;
      return (b.assessed_value_change_pct ?? 0) - (a.assessed_value_change_pct ?? 0);
    });
    return copy;
  }, [results, sort]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (q.trim()) next.q = q.trim();
    if (city.trim()) next.city = city.trim();
    if (zip.trim()) next.zip = zip.trim();
    setParams(next);
  };

  const clearFilters = () => {
    setQ('');
    setCity('');
    setZip('');
    setParams({});
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Search properties</h1>
          <p className="text-sm text-slate-500 mt-1">
            Query the <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">fct_assessments</code> mart
            joined with <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">dim_parcels</code>.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          {loading ? 'Searching...' : `${sorted.length} ${sorted.length === 1 ? 'result' : 'results'}`}
        </div>
      </div>

      <form
        onSubmit={applyFilters}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-3 mb-6"
      >
        <div className="md:col-span-5">
          <label className="block text-xs font-medium text-slate-500 mb-1">Address / parcel / owner</label>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Forbes Ave"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-2 focus:outline-primary-200"
          />
        </div>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-slate-500 mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. PITTSBURGH"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-2 focus:outline-primary-200"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">ZIP</label>
          <input
            type="text"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="15217"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-2 focus:outline-primary-200"
          />
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            type="submit"
            className="flex-1 rounded-md bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium px-4 py-2"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm px-3 py-2"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">Sort:</div>
        <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-xs">
          {[
            ['value-desc', 'Value ↓'],
            ['value-asc', 'Value ↑'],
            ['change-desc', 'Change ↓'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key as typeof sort)}
              className={`px-3 py-1 rounded ${
                sort === key ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          Loading...
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="text-slate-700 font-medium">No properties matched your filters.</div>
          <button onClick={clearFilters} className="mt-3 text-sm text-primary-700 hover:text-primary-900 font-medium">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <Th>Parcel ID</Th>
                <Th>Address</Th>
                <Th>Owner</Th>
                <Th>Use</Th>
                <Th align="right">Assessed</Th>
                <Th align="right">Market</Th>
                <Th align="right">YoY</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((p) => (
                <tr
                  key={p.parcel_id}
                  onClick={() => navigate(`/parcels/${encodeURIComponent(p.parcel_id)}`)}
                  className="cursor-pointer hover:bg-primary-50/50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">{p.parcel_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{p.address}</div>
                    <div className="text-xs text-slate-500">
                      {p.city}, PA {p.zip_code}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{p.current_owner_name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.land_use_description ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(p.assessed_value)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(p.market_value)}</td>
                  <td className="px-4 py-3 text-right">
                    <ChangeChip pct={p.assessed_value_change_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function ChangeChip({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return <span className="text-slate-400">—</span>;
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
