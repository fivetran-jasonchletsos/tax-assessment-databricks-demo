import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { api, formatCurrency, formatNumber, formatPercent } from '../api/queries';
import { quantile, valueHistogram } from '../analytics';
import type { ParcelSearchResult } from '../types';

const LEAFLET_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/leaflet`;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_BASE}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_BASE}/marker-icon.png`,
  shadowUrl: `${LEAFLET_BASE}/marker-shadow.png`,
});

type Mode = 'assessed' | 'market' | 'ratio' | 'change';

const MODE_META: Record<Mode, { label: string; subtitle: string; valueOf: (p: ParcelSearchResult) => number | null }> = {
  assessed: {
    label: 'Assessed value',
    subtitle: 'County roll for the current tax year',
    valueOf: (p) => p.assessed_value,
  },
  market: {
    label: 'Market value',
    subtitle: "County's estimate of what the property would sell for",
    valueOf: (p) => p.market_value,
  },
  ratio: {
    label: 'Market : assessed ratio',
    subtitle: 'How calibrated the assessment is (higher = more under-assessed)',
    valueOf: (p) => (p.assessed_value > 0 ? p.market_value / p.assessed_value : null),
  },
  change: {
    label: 'YoY change %',
    subtitle: 'Year-over-year assessment change',
    valueOf: (p) => p.assessed_value_change_pct,
  },
};

// Five-bucket diverging color ramp. Cool → neutral → warm.
const COLOR_RAMPS: Record<Mode, string[]> = {
  assessed: ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'],
  market: ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'],
  ratio: ['#86efac', '#fde68a', '#fb923c', '#f87171', '#b91c1c'],
  change: ['#10b981', '#86efac', '#cbd5e1', '#fda4af', '#dc2626'],
};

// One row per ZIP after aggregation.
interface ZipAgg {
  zip: string;
  count: number;
  lat: number;
  lng: number;
  parcels: ParcelSearchResult[];
  city: string; // most-common city in this ZIP
  values: number[]; // for the current mode
  median: number;
  p10: number;
  p90: number;
}

export default function MapPage() {
  const [parcels, setParcels] = useState<ParcelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('assessed');
  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .searchParcels({ limit: 200000 })
      .then((r) => setParcels(r.results))
      .finally(() => setLoading(false));
  }, []);

  const placed = useMemo(
    () => parcels.filter((p) => p.latitude != null && p.longitude != null),
    [parcels],
  );

  // Group placed parcels by ZIP, compute per-ZIP stats in the current mode.
  const zipAggs: ZipAgg[] = useMemo(() => {
    const m = new Map<string, ParcelSearchResult[]>();
    for (const p of placed) {
      if (!p.zip_code) continue;
      const k = p.zip_code;
      const arr = m.get(k) ?? [];
      arr.push(p);
      m.set(k, arr);
    }
    return Array.from(m.entries()).map(([zip, rows]) => {
      const lat =
        rows.reduce((s, p) => s + (p.latitude ?? 0), 0) / Math.max(1, rows.length);
      const lng =
        rows.reduce((s, p) => s + (p.longitude ?? 0), 0) / Math.max(1, rows.length);
      const values = rows
        .map((p) => MODE_META[mode].valueOf(p))
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const cityCounts = new Map<string, number>();
      for (const p of rows) cityCounts.set(p.city, (cityCounts.get(p.city) ?? 0) + 1);
      const city =
        Array.from(cityCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      return {
        zip,
        count: rows.length,
        lat,
        lng,
        parcels: rows,
        city,
        values,
        median: quantile(values, 0.5) ?? 0,
        p10: quantile(values, 0.1) ?? 0,
        p90: quantile(values, 0.9) ?? 0,
      };
    });
  }, [placed, mode]);

  // Mode-quantile breakpoints based on per-ZIP medians (so the buckets
  // are stable across ZIPs of different sizes).
  const breakpoints = useMemo(() => {
    const medians = zipAggs.map((z) => z.median);
    return [0.2, 0.4, 0.6, 0.8].map((q) => quantile(medians, q) ?? 0);
  }, [zipAggs]);

  const bucketIndex = (val: number | null): number => {
    if (val === null || !Number.isFinite(val)) return -1;
    if (val < breakpoints[0]) return 0;
    if (val < breakpoints[1]) return 1;
    if (val < breakpoints[2]) return 2;
    if (val < breakpoints[3]) return 3;
    return 4;
  };

  const colorFor = (val: number | null): string => {
    const i = bucketIndex(val);
    if (i < 0) return '#94a3b8';
    return COLOR_RAMPS[mode][i];
  };

  // ZIP-bubble radius scales with parcel count (sqrt for visual fairness).
  const zipRadius = (z: ZipAgg): number => {
    const max = Math.max(1, ...zipAggs.map((x) => x.count));
    return 8 + 28 * Math.sqrt(z.count / max);
  };

  // Individual-parcel radius (drill-in view) — color/size by VALUE.
  const parcelBucket = (val: number | null): number => {
    if (val === null || !Number.isFinite(val)) return -1;
    if (!selectedZip) return bucketIndex(val);
    const drillIn = zipAggs.find((z) => z.zip === selectedZip);
    if (!drillIn) return bucketIndex(val);
    const v = drillIn.values;
    const bp = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(v, q) ?? 0);
    if (val < bp[0]) return 0;
    if (val < bp[1]) return 1;
    if (val < bp[2]) return 2;
    if (val < bp[3]) return 3;
    return 4;
  };
  const parcelColor = (val: number | null) => {
    const i = parcelBucket(val);
    return i < 0 ? '#94a3b8' : COLOR_RAMPS[mode][i];
  };
  const parcelRadius = (val: number | null) => {
    const i = parcelBucket(val);
    return i < 0 ? 3 : 4 + i * 1.75;
  };

  const fmtForMode = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return '—';
    if (mode === 'ratio') return val.toFixed(2);
    if (mode === 'change') return formatPercent(val);
    return formatCurrency(val);
  };

  const selected = selectedZip ? zipAggs.find((z) => z.zip === selectedZip) ?? null : null;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Controls bar */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 z-10">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              {selected ? (
                <>
                  ZIP {selected.zip}{' '}
                  <span className="text-slate-400 text-sm font-normal">— {selected.city}</span>
                </>
              ) : (
                <>
                  Property heatmap{' '}
                  <span className="text-slate-400 text-sm font-normal">— {MODE_META[mode].label}</span>
                </>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500 animate-pulse" />
                  Loading 575,000+ parcels — one-time fetch, ~15 MB gzipped…
                </span>
              ) : selected ? (
                `${formatNumber(selected.count)} parcels in this ZIP. Click another ZIP or "Back to county view" to switch.`
              ) : (
                `${formatNumber(zipAggs.length)} ZIPs · ${formatNumber(placed.length)} parcels. Click any ZIP bubble to drill in.`
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelectedZip(null)}
                className="rounded-md border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium px-3 py-1.5"
              >
                ← Back to county view
              </button>
            )}
            <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1 text-xs">
              {(Object.keys(MODE_META) as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded font-medium transition-colors ${
                    mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {MODE_META[m].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        {zipAggs.length > 0 && (
          <MapContainer
            center={[40.4673, -80.0]}
            zoom={11}
            minZoom={9}
            maxZoom={18}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />

            <FitToBoundsOnce zipAggs={zipAggs} disabled={!!selected} />
            <FlyToOnSelect target={selected ? [selected.lat, selected.lng] : null} zoom={14} />

            {/* COUNTY VIEW: one bubble per ZIP, size = parcel count, color = median value */}
            {!selected &&
              zipAggs.map((z) => (
                <CircleMarker
                  key={z.zip}
                  center={[z.lat, z.lng]}
                  radius={zipRadius(z)}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 2,
                    fillColor: colorFor(z.median),
                    fillOpacity: 0.78,
                  }}
                  eventHandlers={{ click: () => setSelectedZip(z.zip) }}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5">
                      <div className="font-mono text-slate-500">ZIP {z.zip}</div>
                      <div className="font-semibold text-slate-900">{z.city}</div>
                      <div className="mt-2">
                        <strong>{MODE_META[mode].label} (median):</strong> {fmtForMode(z.median)}
                      </div>
                      <div className="text-slate-500">
                        {formatNumber(z.count)} parcels · P10–P90 {fmtForMode(z.p10)} –{' '}
                        {fmtForMode(z.p90)}
                      </div>
                      <button
                        onClick={() => setSelectedZip(z.zip)}
                        className="mt-2 text-primary-700 hover:text-primary-900 font-medium"
                      >
                        Drill into ZIP →
                      </button>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

            {/* DRILL-IN VIEW: individual parcels within the selected ZIP */}
            {selected &&
              selected.parcels.map((p) => {
                const v = MODE_META[mode].valueOf(p);
                return (
                  <CircleMarker
                    key={p.parcel_id}
                    center={[p.latitude!, p.longitude!]}
                    radius={parcelRadius(v)}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 1,
                      fillColor: parcelColor(v),
                      fillOpacity: 0.85,
                    }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <div className="font-mono text-slate-500">{p.parcel_id}</div>
                        <div className="font-semibold text-slate-900 mt-0.5">{p.address}</div>
                        <div className="text-slate-500">
                          {p.city} · {p.zip_code}
                        </div>
                        <div className="mt-2 text-sm">
                          <strong>{MODE_META[mode].label}:</strong> {fmtForMode(v)}
                        </div>
                        <div className="text-slate-500 mt-1">
                          Assessed {formatCurrency(p.assessed_value)} · Market{' '}
                          {formatCurrency(p.market_value)}
                        </div>
                        <button
                          onClick={() => navigate(`/parcels/${encodeURIComponent(p.parcel_id)}`)}
                          className="mt-2 text-primary-700 hover:text-primary-900 font-medium"
                        >
                          Open parcel →
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
          </MapContainer>
        )}

        {/* Side panel — shown only in drill-in view */}
        {selected && (
          <div className="absolute top-4 left-4 z-[400] w-[320px] max-h-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-white/95 backdrop-blur shadow-xl border border-slate-200 p-4 text-sm">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  ZIP breakdown
                </div>
                <div className="font-bold text-slate-900 text-lg">{selected.zip}</div>
                <div className="text-xs text-slate-500">{selected.city}</div>
              </div>
              <button
                onClick={() => setSelectedZip(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mb-3">
              <ZipStat label="Parcels" value={formatNumber(selected.count)} />
              <ZipStat label="Median" value={fmtForMode(selected.median)} primary />
              <ZipStat label="P10" value={fmtForMode(selected.p10)} />
              <ZipStat label="P90" value={fmtForMode(selected.p90)} />
            </dl>

            {/* Mini histogram of assessed values for this ZIP */}
            {(() => {
              const hist = valueHistogram(selected.parcels);
              const maxCount = Math.max(1, ...hist.map((b) => b.count));
              return (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                    Assessed value distribution
                  </div>
                  <div className="flex items-end gap-px h-20 rounded bg-slate-50 p-1">
                    {hist.map((b) => (
                      <div
                        key={b.label}
                        title={`${b.label}: ${b.count} parcels`}
                        className="flex-1 bg-primary-600 hover:bg-primary-700 rounded-sm transition-colors min-h-px"
                        style={{ height: `${(b.count / maxCount) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-slate-400 mt-1 tabular-nums">
                    <span>{hist[0]?.label}</span>
                    <span>{hist[hist.length - 1]?.label}</span>
                  </div>
                </div>
              );
            })()}

            <div className="mt-3 text-[10px] text-slate-400 leading-snug">
              Individual parcel dots show ZIP-centroid + jitter — accurate to the neighborhood, not
              the building.
            </div>
          </div>
        )}

        {/* Legend (bottom-right) */}
        <div className="absolute bottom-4 right-4 z-[400] rounded-xl bg-white/95 backdrop-blur shadow-lg border border-slate-200 p-3 text-xs max-w-[280px]">
          <div className="font-semibold text-slate-900 mb-2">
            {selected ? MODE_META[mode].label : `Median ${MODE_META[mode].label.toLowerCase()} per ZIP`}
          </div>
          <div className="space-y-1.5">
            {COLOR_RAMPS[mode].map((color, i) => {
              const lo = i === 0 ? null : breakpoints[i - 1];
              const hi = i === 4 ? null : breakpoints[i];
              const px = 8 + i * 3.5;
              return (
                <div key={i} className="flex items-center gap-2.5">
                  <span
                    className="inline-flex shrink-0 items-center justify-center"
                    style={{ width: 22, height: 22 }}
                  >
                    <span
                      className="rounded-full ring-2 ring-white"
                      style={{ backgroundColor: color, width: px, height: px }}
                    />
                  </span>
                  <span className="tabular-nums text-slate-700">
                    {lo === null ? '< ' : `${fmtForMode(lo)} – `}
                    {hi === null ? `${fmtForMode(breakpoints[3])}+` : fmtForMode(hi)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
            {selected
              ? 'Within-ZIP quintiles. Bigger + darker = higher value.'
              : 'County-wide quintiles of per-ZIP medians. ZIP bubble size = parcel count.'}
          </div>
        </div>

        {/* Coverage caveat */}
        {!selected && (
          <div className="absolute top-4 left-4 z-[400] rounded-md bg-white/95 backdrop-blur border border-slate-200 px-3 py-2 text-[11px] text-slate-600 max-w-[300px]">
            <strong className="text-slate-800">Note:</strong> WPRDC's open dataset doesn't ship
            parcel geometry. The map aggregates at the ZIP level (where the data is precise) —
            click any ZIP to see its parcel breakdown.
          </div>
        )}
      </div>
    </div>
  );
}

// react-leaflet helper: smoothly fly to a target position when it changes.
function FlyToOnSelect({ target, zoom }: { target: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, zoom, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.[0], target?.[1], zoom]);
  return null;
}

// Frame the map to all the ZIP centroids whenever we're in county view.
// Fires on first mount AND when transitioning back from drill-in view,
// so "← Back to county view" always returns to the framed Allegheny shot
// instead of staying zoomed in on the previously-selected ZIP.
function FitToBoundsOnce({
  zipAggs,
  disabled,
}: {
  zipAggs: ZipAgg[];
  disabled: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (disabled || zipAggs.length === 0) return;
    const latLngs = zipAggs.map((z) => [z.lat, z.lng] as [number, number]);
    const bounds = L.latLngBounds(latLngs);
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 12, duration: 0.8 });
  }, [disabled, zipAggs.length, map]);
  return null;
}

function ZipStat({
  label,
  value,
  primary,
}: {
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</dt>
      <dd
        className={`text-sm font-semibold tabular-nums ${
          primary ? 'text-primary-700' : 'text-slate-900'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
