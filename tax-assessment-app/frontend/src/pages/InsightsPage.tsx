import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, formatCurrency, formatNumber } from '../api/queries';
import type { ParcelSearchResult } from '../types';

// County-wide trends. Real data would come from a dedicated /api/insights/*
// endpoint hitting fct_assessments / fct_appeals_summary directly; for the
// demo we derive distributions from the search sample.
export default function InsightsPage() {
  const [parcels, setParcels] = useState<ParcelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .searchParcels({ limit: 500 })
      .then((r) => setParcels(r.results))
      .finally(() => setLoading(false));
  }, []);

  const byCity = aggregateByCity(parcels);
  const byUse = aggregateByLandUse(parcels);
  const totalAssessed = parcels.reduce((s, p) => s + p.assessed_value, 0);
  const avgGrowth =
    parcels.length > 0
      ? parcels.reduce((s, p) => s + (p.assessed_value_change_pct ?? 0), 0) / parcels.length
      : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">County insights</h1>
        <p className="text-sm text-slate-500 mt-1">
          Aggregations across <code className="font-mono text-xs bg-slate-100 px-1 rounded">fct_assessments</code>{' '}
          for the current tax year.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Tile label="Sample assessed value" value={loading ? '—' : formatCurrency(totalAssessed)} />
        <Tile label="Parcels in sample" value={loading ? '—' : formatNumber(parcels.length)} />
        <Tile
          label="Avg YoY change"
          value={loading ? '—' : `${avgGrowth >= 0 ? '+' : ''}${avgGrowth.toFixed(2)}%`}
          tone={avgGrowth >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Assessed value by city</h2>
          <p className="text-sm text-slate-500 mb-4">Top cities by total assessed value in the sample.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCity} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis dataKey="city" type="category" tick={{ fill: '#64748b', fontSize: 12 }} width={110} />
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Bar dataKey="total" fill="#0284c7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Composition by land use</h2>
          <p className="text-sm text-slate-500 mb-4">Share of assessed value across property types.</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byUse}
                  dataKey="total"
                  nameKey="use"
                  outerRadius={100}
                  innerRadius={60}
                  paddingAngle={2}
                >
                  {byUse.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Highest YoY changes</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Parcel</th>
                  <th className="px-4 py-2 text-left">Address</th>
                  <th className="px-4 py-2 text-left">City</th>
                  <th className="px-4 py-2 text-right">Assessed</th>
                  <th className="px-4 py-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...parcels]
                  .filter((p) => p.assessed_value_change_pct !== null && p.assessed_value_change_pct !== undefined)
                  .sort(
                    (a, b) =>
                      Math.abs(b.assessed_value_change_pct ?? 0) -
                      Math.abs(a.assessed_value_change_pct ?? 0),
                  )
                  .slice(0, 8)
                  .map((p) => (
                    <tr key={p.parcel_id}>
                      <td className="px-4 py-2 text-xs font-mono text-slate-600">{p.parcel_id}</td>
                      <td className="px-4 py-2">{p.address}</td>
                      <td className="px-4 py-2 text-slate-500">{p.city}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(p.assessed_value)}</td>
                      <td className="px-4 py-2 text-right">
                        <span
                          className={`font-semibold ${
                            (p.assessed_value_change_pct ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {(p.assessed_value_change_pct ?? 0) >= 0 ? '+' : ''}
                          {(p.assessed_value_change_pct ?? 0).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const PIE_COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#f59e0b', '#d97706', '#10b981'];

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  const color = tone === 'up' ? 'text-rose-600' : tone === 'down' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function aggregateByCity(parcels: ParcelSearchResult[]) {
  const map = new Map<string, number>();
  for (const p of parcels) map.set(p.city, (map.get(p.city) ?? 0) + p.assessed_value);
  return Array.from(map.entries())
    .map(([city, total]) => ({ city, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function aggregateByLandUse(parcels: ParcelSearchResult[]) {
  const map = new Map<string, number>();
  for (const p of parcels) {
    const key = p.land_use_description ?? 'Unspecified';
    map.set(key, (map.get(key) ?? 0) + p.assessed_value);
  }
  return Array.from(map.entries())
    .map(([use, total]) => ({ use, total }))
    .sort((a, b) => b.total - a.total);
}
