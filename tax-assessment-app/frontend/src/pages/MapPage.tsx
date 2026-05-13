import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { api, formatCurrency, formatPercent } from '../api/queries';
import { quantile } from '../analytics';
import type { ParcelSearchResult } from '../types';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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
  ratio: ['#86efac', '#fde68a', '#fb923c', '#f87171', '#b91c1c'], // higher = worse calibration
  change: ['#10b981', '#86efac', '#cbd5e1', '#fda4af', '#dc2626'],
};

export default function MapPage() {
  const [parcels, setParcels] = useState<ParcelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('assessed');
  const navigate = useNavigate();

  useEffect(() => {
    api
      .searchParcels({ limit: 10000 })
      .then((r) => setParcels(r.results))
      .finally(() => setLoading(false));
  }, []);

  const placed = useMemo(
    () => parcels.filter((p) => p.latitude != null && p.longitude != null),
    [parcels],
  );

  const breakpoints = useMemo(() => {
    const values = placed
      .map((p) => MODE_META[mode].valueOf(p))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    return [0.2, 0.4, 0.6, 0.8].map((q) => quantile(values, q) ?? 0);
  }, [placed, mode]);

  const colorFor = (val: number | null): string => {
    if (val === null || !Number.isFinite(val)) return '#94a3b8';
    const ramp = COLOR_RAMPS[mode];
    if (val < breakpoints[0]) return ramp[0];
    if (val < breakpoints[1]) return ramp[1];
    if (val < breakpoints[2]) return ramp[2];
    if (val < breakpoints[3]) return ramp[3];
    return ramp[4];
  };

  const fmtForMode = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return '—';
    if (mode === 'ratio') return val.toFixed(2);
    if (mode === 'change') return formatPercent(val);
    return formatCurrency(val);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Controls bar */}
      <div className="border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 z-10">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Property heatmap{' '}
              <span className="text-slate-400 text-sm font-normal">— {MODE_META[mode].label}</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {loading
                ? 'Loading parcels…'
                : `${placed.length.toLocaleString()} parcels plotted by ZIP centroid. ${MODE_META[mode].subtitle}.`}
            </p>
          </div>

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

      {/* Map */}
      <div className="relative flex-1">
        {placed.length > 0 && (
          <MapContainer
            center={[40.4406, -79.9959]}
            zoom={11}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {placed.map((p) => {
              const v = MODE_META[mode].valueOf(p);
              return (
                <CircleMarker
                  key={p.parcel_id}
                  center={[p.latitude!, p.longitude!]}
                  radius={5}
                  pathOptions={{
                    color: colorFor(v),
                    fillColor: colorFor(v),
                    fillOpacity: 0.7,
                    weight: 1,
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

        {/* Legend (floats on top of map) */}
        <div className="absolute bottom-4 right-4 z-[400] rounded-xl bg-white/95 backdrop-blur shadow-lg border border-slate-200 p-3 text-xs max-w-[260px]">
          <div className="font-semibold text-slate-900 mb-2">{MODE_META[mode].label}</div>
          <div className="space-y-1">
            {COLOR_RAMPS[mode].map((color, i) => {
              const lo = i === 0 ? null : breakpoints[i - 1];
              const hi = i === 4 ? null : breakpoints[i];
              return (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="tabular-nums text-slate-700">
                    {lo === null ? '< ' : `${fmtForMode(lo)} – `}
                    {hi === null ? `${fmtForMode(breakpoints[3])}+` : fmtForMode(hi)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
            Buckets are quintiles (every 20%) of the visible parcels.
          </div>
        </div>

        {/* Coverage caveat */}
        <div className="absolute top-4 left-4 z-[400] rounded-md bg-white/95 backdrop-blur border border-slate-200 px-3 py-2 text-[11px] text-slate-600 max-w-[280px]">
          <strong className="text-slate-800">Note:</strong> WPRDC's open dataset doesn't ship
          parcel geometry. Markers are placed at the ZIP centroid with a small jitter so
          neighbors don't overlap — accurate to the neighborhood, not the building.
        </div>
      </div>
    </div>
  );
}
