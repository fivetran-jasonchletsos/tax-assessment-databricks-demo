import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, formatCurrency, formatCurrencyShort, formatNumber } from '../api/queries';
import type { ParcelSearchResult } from '../types';

const ACCENT = '#1d4ed8';
const RISING = '#b91c1c';
const FALLING = '#047857';
const TOOLTIP_STYLE = {
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
  padding: '8px 10px',
} as const;

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

  const byCity = useMemo(() => aggregateByCity(parcels), [parcels]);
  const byUse = useMemo(() => aggregateByLandUse(parcels), [parcels]);
  const totalAssessed = parcels.reduce((s, p) => s + p.assessed_value, 0);
  const totalExempted = parcels.reduce((s, p) => s + (p.total_exemption_amount ?? 0), 0);
  const avgGrowth =
    parcels.length > 0
      ? parcels.reduce((s, p) => s + (p.assessed_value_change_pct ?? 0), 0) / parcels.length
      : 0;
  const useTotalAll = byUse.reduce((s, u) => s + u.total, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">County insights</h1>
        <p className="text-sm text-slate-500 mt-2">
          Aggregations across <code className="font-mono text-xs bg-slate-100 px-1 rounded">fct_assessments</code>{' '}
          for the current tax year. Use the <a href="#/dashboard" className="text-primary-700 hover:text-primary-900">Dashboard</a>{' '}
          for the full county-scale view.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-8">
        <Tile
          label="Total assessed (sample)"
          value={loading ? '—' : formatCurrency(totalAssessed)}
          primary
        />
        <Tile label="Parcels in sample" value={loading ? '—' : formatNumber(parcels.length)} muted />
        <Tile
          label="Avg YoY change"
          value={loading ? '—' : `${avgGrowth >= 0 ? '+' : ''}${avgGrowth.toFixed(2)}%`}
          tone={avgGrowth >= 0 ? 'up' : 'down'}
        />
        <Tile
          label="Exempted value"
          value={loading ? '—' : formatCurrencyShort(totalExempted)}
          caption={`${((totalExempted / Math.max(1, totalAssessed)) * 100).toFixed(1)}% of assessed`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">Assessed value by city</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Top municipalities by total assessed value — sorted descending
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCity} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={formatCurrencyShort}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="city"
                  type="category"
                  tick={{ fill: '#334155', fontSize: 11 }}
                  width={130}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(29,78,216,0.06)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: any) => [formatCurrency(v as number), '']}
                  separator=""
                />
                <Bar dataKey="total" fill={ACCENT} radius={[0, 3, 3, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">Composition by land use</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Share of assessed value across property types — sorted by size
            </p>
          </div>
          <div className="space-y-1.5">
            {byUse.slice(0, 8).map((u) => {
              const pct = useTotalAll === 0 ? 0 : (u.total / useTotalAll) * 100;
              return (
                <div key={u.use} className="text-xs">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-slate-700 truncate pr-2">{u.use}</span>
                    <span className="text-slate-500 tabular-nums whitespace-nowrap">
                      {formatCurrencyShort(u.total)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{ width: `${pct}%`, backgroundColor: ACCENT }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">Highest YoY assessment changes</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Largest absolute swings — flagging candidates for assessor review
            </p>
          </div>
          <div className="h-64 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...parcels]
                  .filter((p) => p.assessed_value_change_pct != null)
                  .sort(
                    (a, b) =>
                      Math.abs(b.assessed_value_change_pct ?? 0) -
                      Math.abs(a.assessed_value_change_pct ?? 0),
                  )
                  .slice(0, 10)
                  .map((p) => ({
                    name: p.address,
                    pct: p.assessed_value_change_pct ?? 0,
                  }))}
                layout="vertical"
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: '#334155', fontSize: 10 }}
                  width={200}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(29,78,216,0.06)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: any) => [`${(v as number).toFixed(1)}%`, '']}
                  separator=""
                />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Bar dataKey="pct" radius={[0, 3, 3, 0]} maxBarSize={16}>
                  {[...parcels]
                    .filter((p) => p.assessed_value_change_pct != null)
                    .sort(
                      (a, b) =>
                        Math.abs(b.assessed_value_change_pct ?? 0) -
                        Math.abs(a.assessed_value_change_pct ?? 0),
                    )
                    .slice(0, 10)
                    .map((p, i) => (
                      <Cell
                        key={i}
                        fill={(p.assessed_value_change_pct ?? 0) >= 0 ? RISING : FALLING}
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm tabular-nums">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-medium">Parcel</th>
                  <th className="px-3 py-2 text-left font-medium">Address</th>
                  <th className="px-3 py-2 text-left font-medium">City</th>
                  <th className="px-3 py-2 text-right font-medium">Assessed</th>
                  <th className="px-3 py-2 text-right font-medium">YoY</th>
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
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{p.parcel_id}</td>
                      <td className="px-3 py-2.5 text-slate-900">{p.address}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.city}</td>
                      <td className="px-3 py-2.5 text-right text-slate-900 font-medium">{formatCurrency(p.assessed_value)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`font-semibold ${
                            (p.assessed_value_change_pct ?? 0) >= 0 ? 'text-rose-700' : 'text-emerald-700'
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

function Tile({
  label,
  value,
  tone,
  primary,
  muted,
  caption,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
  primary?: boolean;
  muted?: boolean;
  caption?: string;
}) {
  const valueColor = primary
    ? 'text-white'
    : tone === 'up'
    ? 'text-rose-700'
    : tone === 'down'
    ? 'text-emerald-700'
    : 'text-slate-900';
  const container = primary
    ? 'bg-primary-700 text-white shadow-md'
    : muted
    ? 'bg-slate-100 text-slate-700'
    : 'bg-white border border-slate-200';
  return (
    <div className={`rounded-lg p-4 ${container}`}>
      <div className={`text-[10px] uppercase tracking-wider font-medium ${primary ? 'text-primary-100' : 'text-slate-500'}`}>
        {label}
      </div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {caption && (
        <div className={`mt-0.5 text-[11px] ${primary ? 'text-primary-100' : 'text-slate-400'}`}>
          {caption}
        </div>
      )}
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
