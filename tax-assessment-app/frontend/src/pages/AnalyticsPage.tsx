import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { api, formatCurrency, formatNumber } from '../api/queries';
import {
  exemptionCoverage,
  groupByCity,
  groupByLandUse,
  groupByZip,
  outliers,
  quantile,
  valueHistogram,
} from '../analytics';
import type { ParcelSearchResult } from '../types';

export default function AnalyticsPage() {
  const [parcels, setParcels] = useState<ParcelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .searchParcels({ limit: 5000 })
      .then((r) => setParcels(r.results))
      .finally(() => setLoading(false));
  }, []);

  const byCity = useMemo(() => groupByCity(parcels), [parcels]);
  const byZip = useMemo(() => groupByZip(parcels), [parcels]);
  const byUse = useMemo(() => groupByLandUse(parcels), [parcels]);
  const histogram = useMemo(() => valueHistogram(parcels, 14), [parcels]);
  const movers = useMemo(() => outliers(parcels, 5), [parcels]);
  const exemption = useMemo(() => exemptionCoverage(parcels), [parcels]);

  const median = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.5) ?? 0, [parcels]);
  const p90 = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.9) ?? 0, [parcels]);
  const p10 = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.1) ?? 0, [parcels]);

  const scatter = useMemo(
    () =>
      parcels
        .filter((p) => p.market_value > 0 && p.assessed_value > 0)
        .map((p) => ({
          x: p.assessed_value,
          y: p.market_value,
          z: 1,
          city: p.city,
        })),
    [parcels],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="inline-flex items-center rounded-full bg-primary-100 text-primary-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
          Advanced Analytics
        </div>
        <h1 className="text-3xl font-bold text-slate-900">County-wide deep dive</h1>
        <p className="text-sm text-slate-500 mt-1">
          Aggregations across the gold-layer marts. All numbers computed in your browser from the
          published snapshot — no roundtrips to Databricks.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <KPI label="Parcels" value={loading ? '—' : formatNumber(parcels.length)} />
        <KPI label="Median assessed" value={loading ? '—' : formatCurrency(median)} />
        <KPI label="P90 assessed" value={loading ? '—' : formatCurrency(p90)} />
        <KPI label="P10 assessed" value={loading ? '—' : formatCurrency(p10)} />
        <KPI
          label="Exemption coverage"
          value={loading ? '—' : `${exemption.coverage_pct.toFixed(1)}%`}
          caption={`${formatNumber(exemption.with_exemption)} of ${formatNumber(exemption.total)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Assessed value distribution" subtitle="Histogram across all parcels in snapshot">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} interval={1} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => `${v} parcels`}
                />
                <Bar dataKey="count" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Assessed vs market value" subtitle="Each dot is one parcel">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 12, right: 12, top: 6, bottom: 6 }}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis
                  dataKey="x"
                  type="number"
                  name="Assessed"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Market"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <ZAxis dataKey="z" range={[40, 40]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any) => [formatCurrency(v as number), n]}
                  labelFormatter={() => ''}
                />
                <Scatter data={scatter} fill="#0ea5e9" fillOpacity={0.45} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Top cities by total assessed value" subtitle="Sized by parcel count">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...byCity].sort((a, b) => b.total_assessed - a.total_assessed).slice(0, 10)}
                layout="vertical"
                margin={{ left: 60 }}
              >
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <YAxis dataKey="city" type="category" tick={{ fill: '#64748b', fontSize: 11 }} width={120} />
                <Tooltip
                  formatter={(v: any) => formatCurrency(v as number)}
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="total_assessed" fill="#0284c7" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Assessment change by city" subtitle="Average YoY % — red = rising, green = falling">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...byCity].sort((a, b) => b.avg_change_pct - a.avg_change_pct).slice(0, 10)}
                layout="vertical"
                margin={{ left: 60 }}
              >
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <YAxis dataKey="city" type="category" tick={{ fill: '#64748b', fontSize: 11 }} width={120} />
                <Tooltip
                  formatter={(v: any) => `${(v as number).toFixed(2)}%`}
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="avg_change_pct">
                  {byCity.map((c, i) => (
                    <Cell key={i} fill={c.avg_change_pct >= 0 ? '#e11d48' : '#059669'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="ZIP code performance" subtitle="Median assessed value and YoY change">
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">ZIP</th>
                  <th className="px-3 py-2 text-right">Parcels</th>
                  <th className="px-3 py-2 text-right">Median</th>
                  <th className="px-3 py-2 text-right">P90</th>
                  <th className="px-3 py-2 text-right">YoY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...byZip].sort((a, b) => b.count - a.count).slice(0, 10).map((z) => (
                  <tr key={z.zip}>
                    <td className="px-3 py-2 font-mono text-slate-700">{z.zip}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(z.count)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(z.median_assessed)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(z.p90_assessed)}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`font-semibold ${
                          z.avg_change_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {z.avg_change_pct >= 0 ? '+' : ''}
                        {z.avg_change_pct.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Composition by land use" subtitle="Where the value sits">
          <div className="space-y-2">
            {byUse.slice(0, 6).map((u, i) => {
              const totalAll = byUse.reduce((s, x) => s + x.total_assessed, 0);
              const pct = totalAll === 0 ? 0 : (u.total_assessed / totalAll) * 100;
              return (
                <div key={u.use}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{u.use}</span>
                    <span className="text-slate-500">
                      {formatCurrency(u.total_assessed)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#f59e0b', '#10b981'][
                          i % 6
                        ],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Biggest YoY movers"
          subtitle="Parcels with the largest absolute assessed-value change"
          className="lg:col-span-2"
        >
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Parcel</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">City</th>
                  <th className="px-3 py-2 text-right">Assessed</th>
                  <th className="px-3 py-2 text-right">YoY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movers.slice(0, 10).map((p) => (
                  <tr key={p.parcel_id}>
                    <td className="px-3 py-2 text-xs font-mono text-slate-600">{p.parcel_id}</td>
                    <td className="px-3 py-2">{p.address}</td>
                    <td className="px-3 py-2 text-slate-500">{p.city}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(p.assessed_value)}</td>
                    <td className="px-3 py-2 text-right">
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
        </Panel>
      </div>

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Methodology:</strong> All charts are computed client-side from the published JSON snapshot.
        For trends spanning multiple tax years, see individual parcel pages — the snapshot persists per-year
        history.
      </div>
    </div>
  );
}

function KPI({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {caption && <div className="mt-0.5 text-xs text-slate-400">{caption}</div>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
