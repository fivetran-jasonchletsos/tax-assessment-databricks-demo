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
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import { api, formatCurrency, formatCurrencyShort, formatNumber } from '../api/queries';
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

// Tufte: small multiples-style restraint. Single accent color (primary-700)
// varied by saturation. Light gridlines. No tooltip border. Median is
// annotated directly in-chart rather than discussed in caption.
const ACCENT = '#1d4ed8';
const ACCENT_SOFT = '#93c5fd';
const RISING = '#b91c1c';
const FALLING = '#047857';

const TOOLTIP_STYLE = {
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
  padding: '8px 10px',
} as const;

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
  const histogram = useMemo(() => valueHistogram(parcels), [parcels]);
  const movers = useMemo(() => outliers(parcels, 5), [parcels]);
  const exemption = useMemo(() => exemptionCoverage(parcels), [parcels]);

  const median = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.5) ?? 0, [parcels]);
  const p90 = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.9) ?? 0, [parcels]);
  const p10 = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.1) ?? 0, [parcels]);

  // Find which histogram bucket contains the median, for the reference line
  const medianBucketIdx = histogram.findIndex((b) => median >= b.lo && median < b.hi);
  const medianLabel = medianBucketIdx >= 0 ? histogram[medianBucketIdx].label : null;

  const scatter = useMemo(
    () =>
      parcels
        .filter((p) => p.market_value > 0 && p.assessed_value > 0)
        .map((p) => ({
          x: p.assessed_value,
          y: p.market_value,
          z: 1,
        })),
    [parcels],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-3xl">
        <div className="inline-flex items-center rounded-full bg-primary-100 text-primary-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
          Advanced Analytics
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">County-wide deep dive</h1>
        <p className="text-sm text-slate-500 mt-2">
          Residential parcels across {byCity.length} municipalities, derived from the gold-layer marts.
          All aggregations run in your browser; nothing roundtrips to Databricks.
        </p>
      </header>

      {/* KPIs — vary visual weight so the eye lands on the most informative one. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-10">
        <KPI label="Parcels" value={loading ? '—' : formatNumber(parcels.length)} muted />
        <KPI
          label="Median assessed"
          value={loading ? '—' : formatCurrency(median)}
          caption="50th percentile"
          primary
        />
        <KPI label="P10 — P90" value={loading ? '—' : `${formatCurrencyShort(p10)} – ${formatCurrencyShort(p90)}`} caption="Middle 80%" />
        <KPI
          label="Avg YoY change"
          value={
            loading
              ? '—'
              : `${parcels.reduce((s, p) => s + (p.assessed_value_change_pct ?? 0), 0) / Math.max(1, parcels.length) >= 0 ? '+' : ''}${(parcels.reduce((s, p) => s + (p.assessed_value_change_pct ?? 0), 0) / Math.max(1, parcels.length)).toFixed(1)}%`
          }
          caption="Across all parcels"
        />
        <KPI
          label="Exemption coverage"
          value={loading ? '—' : `${exemption.coverage_pct.toFixed(0)}%`}
          caption={`${formatNumber(exemption.with_exemption)} parcels`}
        />
      </div>

      {/* Lead with the headline distribution chart; everything below is supporting. */}
      <Panel
        title="Assessed value distribution"
        subtitle={medianLabel ? `Median falls in the ${medianLabel} bucket` : undefined}
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={56}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                cursor={{ fill: 'rgba(29,78,216,0.06)' }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: any) => [`${v} parcels`, '']}
                separator=""
              />
              <Bar dataKey="count" fill={ACCENT} radius={[3, 3, 0, 0]} maxBarSize={56}>
                {histogram.map((_, i) => (
                  <Cell key={i} fill={i === medianBucketIdx ? '#1e40af' : ACCENT} />
                ))}
              </Bar>
              {medianBucketIdx >= 0 && (
                <ReferenceLine
                  x={histogram[medianBucketIdx].label}
                  stroke="#f59e0b"
                  strokeDasharray="3 3"
                  label={{ value: 'Median', position: 'top', fill: '#b45309', fontSize: 11 }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Panel title="Assessed vs market value" subtitle="Each dot is one parcel — closer to the diagonal = better-calibrated assessment">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 12, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#f1f5f9" />
                <XAxis
                  dataKey="x"
                  type="number"
                  name="Assessed"
                  tickFormatter={formatCurrencyShort}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Market"
                  tickFormatter={formatCurrencyShort}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <ZAxis dataKey="z" range={[24, 24]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: any, n: any) => [formatCurrency(v as number), n]}
                  labelFormatter={() => ''}
                />
                <Scatter data={scatter} fill={ACCENT_SOFT} stroke={ACCENT} strokeOpacity={0.5} fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Top municipalities" subtitle="By total assessed value in the snapshot">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...byCity].sort((a, b) => b.total_assessed - a.total_assessed).slice(0, 10)}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              >
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
                  width={150}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(29,78,216,0.06)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: any) => [formatCurrency(v as number), '']}
                  separator=""
                />
                <Bar dataKey="total_assessed" fill={ACCENT} radius={[0, 3, 3, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Year-over-year assessment change" subtitle="Average % change per municipality">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...byCity].sort((a, b) => b.avg_change_pct - a.avg_change_pct).slice(0, 10)}
                layout="vertical"
                margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="city"
                  type="category"
                  tick={{ fill: '#334155', fontSize: 11 }}
                  width={150}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(29,78,216,0.06)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: any) => [`${(v as number).toFixed(2)}%`, '']}
                  separator=""
                />
                <ReferenceLine x={0} stroke="#94a3b8" />
                <Bar dataKey="avg_change_pct" radius={[0, 3, 3, 0]} maxBarSize={20}>
                  {byCity.map((c, i) => (
                    <Cell key={i} fill={c.avg_change_pct >= 0 ? RISING : FALLING} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Land use mix" subtitle="Composition of assessed value across property types">
          <div className="space-y-2 pt-2">
            {byUse.slice(0, 6).map((u, i) => {
              const totalAll = byUse.reduce((s, x) => s + x.total_assessed, 0);
              const pct = totalAll === 0 ? 0 : (u.total_assessed / totalAll) * 100;
              return (
                <div key={u.use}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700 truncate pr-2">{u.use}</span>
                    <span className="text-slate-500 tabular-nums whitespace-nowrap">
                      {formatCurrencyShort(u.total_assessed)} · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded bg-slate-100 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: i === 0 ? ACCENT : ACCENT_SOFT,
                        opacity: 1 - i * 0.12,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="ZIP code performance" subtitle="Median assessed value and YoY change" className="mt-6">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="min-w-full text-sm tabular-nums">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium">ZIP</th>
                <th className="px-3 py-2 text-right font-medium">Parcels</th>
                <th className="px-3 py-2 text-right font-medium">Median</th>
                <th className="px-3 py-2 text-right font-medium">P90</th>
                <th className="px-3 py-2 text-right font-medium">Avg YoY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...byZip].sort((a, b) => b.count - a.count).slice(0, 10).map((z) => (
                <tr key={z.zip}>
                  <td className="px-3 py-2.5 font-mono text-slate-700">{z.zip}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(z.count)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900 font-medium">{formatCurrency(z.median_assessed)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{formatCurrency(z.p90_assessed)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`font-medium ${
                        z.avg_change_pct >= 0 ? 'text-rose-700' : 'text-emerald-700'
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

      <Panel title="Biggest YoY movers" subtitle="Parcels with the largest absolute assessed-value change" className="mt-6">
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="min-w-full text-sm tabular-nums">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="px-3 py-2 text-left font-medium">Parcel</th>
                <th className="px-3 py-2 text-left font-medium">Address</th>
                <th className="px-3 py-2 text-left font-medium">Municipality</th>
                <th className="px-3 py-2 text-right font-medium">Assessed</th>
                <th className="px-3 py-2 text-right font-medium">YoY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movers.slice(0, 10).map((p) => (
                <tr key={p.parcel_id}>
                  <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{p.parcel_id}</td>
                  <td className="px-3 py-2.5 text-slate-900">{p.address}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.city}</td>
                  <td className="px-3 py-2.5 text-right text-slate-900 font-medium">{formatCurrency(p.assessed_value)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={`font-medium ${
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
      </Panel>

      <p className="mt-8 text-xs text-slate-500 max-w-3xl">
        <strong className="text-slate-700">Methodology:</strong> Distribution bins are aligned to natural property
        brackets (not equal-width) so the shape of a heavy-tailed dataset reads correctly. Per-year history is
        synthesized deterministically per parcel — for live multi-year history, see individual parcel pages.
      </p>
    </div>
  );
}

function KPI({
  label,
  value,
  caption,
  primary,
  muted,
}: {
  label: string;
  value: string;
  caption?: string;
  primary?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-4 ${
        primary
          ? 'bg-primary-700 text-white shadow-md'
          : muted
          ? 'bg-slate-100 text-slate-700'
          : 'bg-white border border-slate-200'
      }`}
    >
      <div className={`text-[10px] uppercase tracking-wider font-medium ${primary ? 'text-primary-100' : 'text-slate-500'}`}>
        {label}
      </div>
      <div className={`mt-1 text-xl sm:text-2xl font-semibold tabular-nums ${primary ? 'text-white' : 'text-slate-900'}`}>
        {value}
      </div>
      {caption && (
        <div className={`mt-0.5 text-[11px] ${primary ? 'text-primary-100' : 'text-slate-400'}`}>{caption}</div>
      )}
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
    <section className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
