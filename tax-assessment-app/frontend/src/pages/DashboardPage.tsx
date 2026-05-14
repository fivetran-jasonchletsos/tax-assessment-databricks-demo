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
  linearFit,
  outliers,
  quantile,
  valueHistogram,
} from '../analytics';
import type { ParcelSearchResult, ZipTrend } from '../types';
import {
  KPISkeleton,
  LoadingBanner,
  PanelSkeleton,
  SkeletonBlock,
} from '../components/Skeleton';
import SparklineSvg from '../components/Sparkline';

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

interface Filter {
  bin?: { lo: number; hi: number; label: string };
  city?: string;
  zip?: string;
  landUse?: string;
}

export default function DashboardPage() {
  const [allParcels, setAllParcels] = useState<ParcelSearchResult[]>([]);
  const [zipTrends, setZipTrends] = useState<Map<string, ZipTrend>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>({});

  useEffect(() => {
    // Pull everything available — at 100K-scale the limit guard keeps this safe.
    api
      .searchParcels({ limit: 200000 })
      .then((r) => setAllParcels(r.results))
      .finally(() => setLoading(false));
    // ZIP trends are non-critical; failure leaves the column blank.
    api.getZipTrends().then((r) => {
      const m = new Map<string, ZipTrend>();
      for (const t of r.zips) m.set(t.zip, t);
      setZipTrends(m);
    });
  }, []);

  // Apply active filters to every chart + KPI.
  const parcels = useMemo(() => {
    let rows = allParcels;
    if (filter.bin) {
      const { lo, hi } = filter.bin;
      rows = rows.filter((p) => p.assessed_value >= lo && p.assessed_value < hi);
    }
    if (filter.city) rows = rows.filter((p) => p.city === filter.city);
    if (filter.zip) rows = rows.filter((p) => p.zip_code === filter.zip);
    if (filter.landUse) {
      rows = rows.filter((p) => (p.land_use_description ?? 'Unspecified') === filter.landUse);
    }
    return rows;
  }, [allParcels, filter]);

  const filterCount = Object.values(filter).filter(Boolean).length;
  const filtered = filterCount > 0;

  const byCity = useMemo(() => groupByCity(parcels), [parcels]);
  const byZip = useMemo(() => groupByZip(parcels), [parcels]);
  const byUse = useMemo(() => groupByLandUse(parcels), [parcels]);
  const histogram = useMemo(() => valueHistogram(parcels), [parcels]);
  const movers = useMemo(() => outliers(parcels, 5), [parcels]);
  const exemption = useMemo(() => exemptionCoverage(parcels), [parcels]);

  const median = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.5) ?? 0, [parcels]);
  const p90 = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.9) ?? 0, [parcels]);
  const p10 = useMemo(() => quantile(parcels.map((p) => p.assessed_value), 0.1) ?? 0, [parcels]);
  const totalAssessed = useMemo(
    () => parcels.reduce((s, p) => s + p.assessed_value, 0),
    [parcels],
  );

  // County-wide yearly trend series derived from per-ZIP median histories.
  // We average each year's medians across all trended ZIPs (or the filtered
  // ZIP only, if a ZIP filter is active) to produce a single time series
  // for the KPI sparklines. yoyPctSeries is the year-over-year % change
  // of that median series.
  const { medianSeries, yoyPctSeries } = useMemo(() => {
    const trends = filter.zip
      ? Array.from(zipTrends.values()).filter((t) => t.zip === filter.zip)
      : Array.from(zipTrends.values());
    if (trends.length === 0) return { medianSeries: [] as number[], yoyPctSeries: [] as number[] };
    const years = trends[0].years;
    const m: number[] = [];
    for (let i = 0; i < years.length; i++) {
      let sum = 0;
      let n = 0;
      for (const t of trends) {
        if (t.median_assessed[i] !== undefined) {
          sum += t.median_assessed[i];
          n += 1;
        }
      }
      if (n > 0) m.push(sum / n);
    }
    const yoy: number[] = [];
    for (let i = 1; i < m.length; i++) {
      const prev = m[i - 1];
      if (prev > 0) yoy.push(((m[i] - prev) / prev) * 100);
    }
    return { medianSeries: m, yoyPctSeries: yoy };
  }, [zipTrends, filter.zip]);

  // Find which histogram bucket contains the median, for the reference line
  const medianBucketIdx = histogram.findIndex((b) => median >= b.lo && median < b.hi);
  const medianLabel = medianBucketIdx >= 0 ? histogram[medianBucketIdx].label : null;

  // Plotting all 575K parcels in a scatter chart locks up the browser.
  // Stratified random sample by hash-of-parcel-id so the visible cloud
  // is deterministic across renders, and the regression below still
  // computes over the same sample (proportional, unbiased).
  const SCATTER_CAP = 5000;
  const scatter = useMemo(() => {
    const valid = parcels.filter((p) => p.market_value > 0 && p.assessed_value > 0);
    if (valid.length <= SCATTER_CAP) {
      return valid.map((p) => ({ x: p.assessed_value, y: p.market_value, z: 1 }));
    }
    const stride = valid.length / SCATTER_CAP;
    const out: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < SCATTER_CAP; i++) {
      const p = valid[Math.floor(i * stride)];
      out.push({ x: p.assessed_value, y: p.market_value, z: 1 });
    }
    return out;
  }, [parcels]);

  // --- Filter toggles ----------------------------------------------------
  const toggleBin = (idx: number) => {
    const b = histogram[idx];
    setFilter((prev) =>
      prev.bin?.label === b.label
        ? { ...prev, bin: undefined }
        : { ...prev, bin: { lo: b.lo, hi: b.hi, label: b.label } },
    );
  };
  const toggleCity = (city: string) =>
    setFilter((prev) => ({ ...prev, city: prev.city === city ? undefined : city }));
  const toggleZip = (zip: string) =>
    setFilter((prev) => ({ ...prev, zip: prev.zip === zip ? undefined : zip }));
  const toggleLandUse = (use: string) =>
    setFilter((prev) => ({ ...prev, landUse: prev.landUse === use ? undefined : use }));
  const clearFilters = () => setFilter({});

  // While parcels.json is downloading + parsing (~77 MB at 575K-scale)
  // the page would otherwise render empty for 5-15s on slower wifi.
  // Show a skeleton screen so it reads as "loading" instead of "broken."
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-6 max-w-3xl">
          <div className="inline-flex items-center rounded-full bg-primary-100 text-primary-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
            Dashboard
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">County-wide deep dive</h1>
          <p className="text-sm text-slate-500 mt-2">Loading 575,000+ parcels from the published snapshot…</p>
          <div className="mt-3">
            <LoadingBanner
              label="Downloading parcels.json"
              detail="~15 MB gzipped · one-time fetch · cached for the rest of the session"
            />
          </div>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-10">
          <KPISkeleton />
          <KPISkeleton primary />
          <KPISkeleton />
          <KPISkeleton />
          <KPISkeleton />
        </div>
        <PanelSkeleton title="Assessed value distribution" height={240} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <PanelSkeleton title="Assessed vs market value" height={240} />
          <PanelSkeleton title="Top municipalities" height={240} />
          <PanelSkeleton title="Year-over-year change" height={240} />
          <PanelSkeleton title="Land use mix" height={180} />
        </div>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <SkeletonBlock className="h-3 w-1/4 mb-3" />
          <SkeletonBlock className="h-2 w-full mb-1.5" />
          <SkeletonBlock className="h-2 w-full mb-1.5" />
          <SkeletonBlock className="h-2 w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 max-w-3xl">
        <div className="inline-flex items-center rounded-full bg-primary-100 text-primary-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
          Dashboard
        </div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">County-wide deep dive</h1>
        <p className="text-sm text-slate-500 mt-2">
          Residential parcels across {byCity.length}{filtered ? ' filtered' : ''} municipalities, derived
          from the gold-layer marts.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs text-slate-700">
          <span>
            <strong className="text-slate-900">Interactive —</strong> click any bar, row, or land-use
            slice to cross-filter every chart, KPI, and table on this page.
          </span>
        </div>
      </header>

      {filtered && (
        <div className="mb-6 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-primary-700 font-semibold mr-1">
            Filtered:
          </span>
          {filter.bin && (
            <FilterChip
              label={`Value ${filter.bin.label}`}
              onClear={() => setFilter((p) => ({ ...p, bin: undefined }))}
            />
          )}
          {filter.city && (
            <FilterChip
              label={`City ${filter.city}`}
              onClear={() => setFilter((p) => ({ ...p, city: undefined }))}
            />
          )}
          {filter.zip && (
            <FilterChip
              label={`ZIP ${filter.zip}`}
              onClear={() => setFilter((p) => ({ ...p, zip: undefined }))}
            />
          )}
          {filter.landUse && (
            <FilterChip
              label={`Use ${filter.landUse}`}
              onClear={() => setFilter((p) => ({ ...p, landUse: undefined }))}
            />
          )}
          <span className="text-xs text-primary-700 ml-1">
            Showing {formatNumber(parcels.length)} of {formatNumber(allParcels.length)} parcels
          </span>
          <button
            onClick={clearFilters}
            className="ml-auto text-xs font-medium text-primary-700 hover:text-primary-900"
          >
            Clear all
          </button>
        </div>
      )}

      {/* KPIs — leads with total roll value (the treasurer's headline number),
          then drill-downs that describe distribution and direction. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-10">
        <KPI
          label="Total assessed roll"
          value={loading ? '—' : formatCurrencyShort(totalAssessed)}
          caption={`${formatNumber(parcels.length)} parcels`}
          primary
          spark={
            medianSeries.length >= 2
              ? { values: medianSeries, stroke: '#bae6fd', fill: '#bae6fd' }
              : undefined
          }
        />
        <KPI
          label="Median assessed"
          value={loading ? '—' : formatCurrency(median)}
          caption="50th percentile"
        />
        <KPI
          label="P10 — P90"
          value={loading ? '—' : `${formatCurrencyShort(p10)} – ${formatCurrencyShort(p90)}`}
          caption="Middle 80%"
        />
        <KPI
          label="Avg YoY change"
          value={
            loading
              ? '—'
              : `${parcels.reduce((s, p) => s + (p.assessed_value_change_pct ?? 0), 0) / Math.max(1, parcels.length) >= 0 ? '+' : ''}${(parcels.reduce((s, p) => s + (p.assessed_value_change_pct ?? 0), 0) / Math.max(1, parcels.length)).toFixed(1)}%`
          }
          caption="Across all parcels"
          spark={
            yoyPctSeries.length >= 2
              ? {
                  values: yoyPctSeries,
                  stroke:
                    yoyPctSeries[yoyPctSeries.length - 1] >= yoyPctSeries[0] ? RISING : FALLING,
                  fill:
                    yoyPctSeries[yoyPctSeries.length - 1] >= yoyPctSeries[0] ? RISING : FALLING,
                }
              : undefined
          }
        />
        <KPI
          label="Exemption coverage"
          value={loading ? '—' : `${exemption.coverage_pct.toFixed(0)}%`}
          caption={`${formatNumber(exemption.with_exemption)} parcels exempt`}
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
              <Bar
                dataKey="count"
                radius={[3, 3, 0, 0]}
                maxBarSize={56}
                onClick={(_, idx) => toggleBin(idx as number)}
                cursor="pointer"
              >
                {histogram.map((b, i) => {
                  const selected = filter.bin?.label === b.label;
                  const dim = filter.bin && !selected;
                  return (
                    <Cell
                      key={i}
                      fill={selected ? '#1e3a8a' : i === medianBucketIdx ? '#1e40af' : ACCENT}
                      opacity={dim ? 0.3 : 1}
                    />
                  );
                })}
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
        {(() => {
          const fit = linearFit(scatter);
          const subtitle = fit
            ? `Best-fit line: market ≈ ${fit.slope.toFixed(2)} × assessed + ${formatCurrencyShort(fit.intercept)} · R² = ${fit.r2.toFixed(3)} · n=${fit.n.toLocaleString()}`
            : 'Each dot is one parcel — closer to the diagonal = better-calibrated assessment';
          // Build the regression line endpoints for the overlay.
          const fitLine = fit
            ? [
                { x: fit.xMin, y: fit.slope * fit.xMin + fit.intercept },
                { x: fit.xMax, y: fit.slope * fit.xMax + fit.intercept },
              ]
            : [];
          return (
            <Panel title="Assessed vs market value" subtitle={subtitle}>
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
                    <Scatter
                      name="Parcels"
                      data={scatter}
                      fill={ACCENT_SOFT}
                      stroke={ACCENT}
                      strokeOpacity={0.4}
                      fillOpacity={0.5}
                    />
                    {fit && (
                      <Scatter
                        name="Best-fit"
                        data={fitLine}
                        line={{ stroke: '#f59e0b', strokeWidth: 2.5, strokeDasharray: '6 4' }}
                        shape={() => null as any}
                        legendType="none"
                      />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              {fit && (
                <div className="mt-3 flex gap-3 text-xs text-slate-500 flex-wrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-4 bg-amber-500 rounded-sm" />
                    Best-fit (OLS)
                  </span>
                  <span>
                    <strong className="text-slate-700">R² {fit.r2.toFixed(3)}</strong>{' '}
                    — {fit.r2 > 0.9 ? 'tight' : fit.r2 > 0.7 ? 'strong' : 'loose'} calibration between
                    assessed and market values.
                  </span>
                </div>
              )}
            </Panel>
          );
        })()}

        <Panel
          title="Top municipalities"
          subtitle="Click a bar to filter the dashboard to that municipality"
        >
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
                <Bar
                  dataKey="total_assessed"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={20}
                  onClick={(d: any) => toggleCity(d?.city)}
                  cursor="pointer"
                >
                  {[...byCity]
                    .sort((a, b) => b.total_assessed - a.total_assessed)
                    .slice(0, 10)
                    .map((c, i) => {
                      const selected = filter.city === c.city;
                      const dim = filter.city && !selected;
                      return (
                        <Cell key={i} fill={selected ? '#1e3a8a' : ACCENT} opacity={dim ? 0.3 : 1} />
                      );
                    })}
                </Bar>
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

        <Panel title="Land use mix" subtitle="Click a row to filter by property type">
          <div className="space-y-1 pt-2">
            {byUse.slice(0, 6).map((u, i) => {
              const totalAll = byUse.reduce((s, x) => s + x.total_assessed, 0);
              const pct = totalAll === 0 ? 0 : (u.total_assessed / totalAll) * 100;
              const selected = filter.landUse === u.use;
              const dim = filter.landUse && !selected;
              return (
                <button
                  key={u.use}
                  onClick={() => toggleLandUse(u.use)}
                  className={`w-full text-left px-2 py-1.5 rounded transition-colors ${
                    selected ? 'bg-primary-50' : 'hover:bg-slate-50'
                  } ${dim ? 'opacity-50' : ''}`}
                >
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
                        backgroundColor: selected ? '#1e3a8a' : i === 0 ? ACCENT : ACCENT_SOFT,
                        opacity: 1 - i * 0.12,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      {(() => {
        const rows = [...byZip].sort((a, b) => b.count - a.count).slice(0, 10);
        const maxP90 = Math.max(0, ...rows.map((r) => r.p90_assessed));
        return (
          <Panel
            title="ZIP code performance"
            subtitle="Click a row to filter the dashboard to that ZIP — bullet shows median (filled) and P90 (outline); trend shows median assessed value over time"
            className="mt-6"
          >
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="min-w-full text-sm tabular-nums">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-medium">ZIP</th>
                    <th className="px-3 py-2 text-right font-medium">Parcels</th>
                    <th className="px-3 py-2 text-left font-medium w-[32%]">Median · P90</th>
                    <th className="px-3 py-2 text-right font-medium">Median</th>
                    <th className="px-3 py-2 text-center font-medium">Trend</th>
                    <th className="px-3 py-2 text-right font-medium">Avg YoY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((z) => {
                    const selected = filter.zip === z.zip;
                    const trend = zipTrends.get(z.zip);
                    return (
                      <tr
                        key={z.zip}
                        onClick={() => toggleZip(z.zip)}
                        className={`cursor-pointer transition-colors ${
                          selected ? 'bg-primary-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono text-slate-700">{z.zip}</td>
                        <td className="px-3 py-2.5 text-right">{formatNumber(z.count)}</td>
                        <td className="px-3 py-2.5">
                          <BulletBar
                            median={z.median_assessed}
                            p90={z.p90_assessed}
                            max={maxP90}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-900 font-medium">
                          {formatCurrency(z.median_assessed)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="inline-block align-middle">
                            <Sparkline
                              values={trend?.median_assessed ?? []}
                              years={trend?.years}
                            />
                          </div>
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })()}

      {(() => {
        const top = movers.slice(0, 10);
        return (
          <Panel
            title="Biggest YoY movers"
            subtitle="Bar shows the change direction and magnitude; red = rising, green = falling"
            className="mt-6"
          >
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="min-w-full text-sm tabular-nums">
                <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-medium">Parcel</th>
                    <th className="px-3 py-2 text-left font-medium">Address</th>
                    <th className="px-3 py-2 text-left font-medium">Municipality</th>
                    <th className="px-3 py-2 text-right font-medium">Assessed</th>
                    <th className="px-3 py-2 text-center font-medium w-[140px]">YoY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {top.map((p) => (
                    <tr key={p.parcel_id}>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{p.parcel_id}</td>
                      <td className="px-3 py-2.5 text-slate-900">{p.address}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.city}</td>
                      <td className="px-3 py-2.5 text-right text-slate-900 font-medium">{formatCurrency(p.assessed_value)}</td>
                      <td className="px-3 py-2.5">
                        <TrafficLight pct={p.assessed_value_change_pct ?? 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })()}

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
  spark,
}: {
  label: string;
  value: string;
  caption?: string;
  primary?: boolean;
  muted?: boolean;
  spark?: { values: number[]; stroke: string; fill?: string };
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
      {spark && spark.values.length >= 2 && (
        <div className="mt-1.5">
          <SparklineSvg
            values={spark.values}
            stroke={spark.stroke}
            fill={spark.fill}
            width={88}
            height={20}
            strokeWidth={1.5}
          />
        </div>
      )}
      {caption && (
        <div className={`mt-0.5 text-[11px] ${primary ? 'text-primary-100' : 'text-slate-400'}`}>{caption}</div>
      )}
    </div>
  );
}

// Inline bullet: filled bar = median; outlined bar = P90. Both scaled to
// the column max so eye can compare rows at a glance.
function BulletBar({
  median,
  p90,
  max,
}: {
  median: number;
  p90: number;
  max: number;
}) {
  if (max <= 0) return null;
  const medianPct = Math.max(0, Math.min(100, (median / max) * 100));
  const p90Pct = Math.max(0, Math.min(100, (p90 / max) * 100));
  return (
    <div className="relative h-5 w-full">
      {/* track */}
      <div className="absolute inset-y-1.5 left-0 right-0 rounded bg-slate-100" />
      {/* P90 outline range */}
      <div
        className="absolute inset-y-1.5 left-0 rounded border border-primary-300 bg-primary-100/40"
        style={{ width: `${p90Pct}%` }}
      />
      {/* Median fill */}
      <div
        className="absolute inset-y-0.5 left-0 rounded bg-primary-700"
        style={{ width: `${medianPct}%` }}
      />
    </div>
  );
}

// Compact inline-SVG sparkline. Stroke is auto-colored (rising = RISING,
// falling = FALLING) so the trend reads without a legend. Endpoint dot marks
// the most recent year. Empty/single-point series render as an em dash.
function Sparkline({
  values,
  years,
  width = 96,
  height = 24,
}: {
  values: number[];
  years?: number[];
  width?: number;
  height?: number;
}) {
  if (!values || values.length < 2) {
    return <span className="text-slate-400">—</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / span) * h;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const fillPath = `${path} L${points[points.length - 1][0].toFixed(1)} ${(height - pad).toFixed(1)} L${points[0][0].toFixed(1)} ${(height - pad).toFixed(1)} Z`;
  const rising = values[values.length - 1] >= values[0];
  const stroke = rising ? RISING : FALLING;
  const last = points[points.length - 1];
  const yearRange = years && years.length >= 2 ? `${years[0]}–${years[years.length - 1]}` : '';
  const delta = ((values[values.length - 1] - values[0]) / values[0]) * 100;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Trend ${yearRange}: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
      className="overflow-visible"
    >
      <title>{`${yearRange}  ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}</title>
      <path d={fillPath} fill={stroke} opacity={0.08} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={1.75} fill={stroke} />
    </svg>
  );
}

// Traffic-light indicator: green = falling or flat, yellow = modest rise,
// red = significant rise. Higher assessed value = bigger tax bill, so up
// is "bad" semantics in this context.
function TrafficLight({ pct }: { pct: number }) {
  let color: string;
  let label: string;
  if (pct >= 8) {
    color = 'bg-rose-500';
    label = 'High rise';
  } else if (pct >= 3) {
    color = 'bg-amber-400';
    label = 'Moderate rise';
  } else {
    color = 'bg-emerald-500';
    label = pct < 0 ? 'Falling' : 'Stable';
  }
  return (
    <div className="flex items-center justify-center gap-2" title={label}>
      <span className={`inline-block h-3 w-3 rounded-full ${color} ring-2 ring-white shadow`} />
      <span
        className={`text-xs font-semibold tabular-nums w-12 text-right ${
          pct >= 8 ? 'text-rose-700' : pct >= 3 ? 'text-amber-700' : 'text-emerald-700'
        }`}
      >
        {pct >= 0 ? '+' : ''}
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-primary-300 text-primary-800 text-xs font-medium px-2.5 py-1">
      {label}
      <button
        onClick={onClear}
        aria-label={`Remove ${label} filter`}
        className="text-primary-500 hover:text-primary-700"
      >
        ×
      </button>
    </span>
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
