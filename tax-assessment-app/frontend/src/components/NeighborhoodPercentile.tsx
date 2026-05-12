import { useEffect, useMemo, useState } from 'react';
import { api, formatCurrency } from '../api/queries';
import { quantile } from '../analytics';
import type { ParcelSearchResult } from '../types';

interface Props {
  parcelId: string;
  zipCode: string;
  assessedValue: number;
}

// "Where does this parcel sit in its ZIP?" — single high-signal widget.
// Computes peer rank, median, p10/p90, and renders a sparkline density
// strip with the parcel's marker. Pure client-side over the snapshot.
export default function NeighborhoodPercentile({ parcelId, zipCode, assessedValue }: Props) {
  const [peers, setPeers] = useState<ParcelSearchResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .searchParcels({ zip: zipCode, limit: 5000 })
      .then((r) => !cancelled && setPeers(r.results))
      .catch(() => !cancelled && setPeers([]));
    return () => {
      cancelled = true;
    };
  }, [zipCode]);

  const stats = useMemo(() => {
    if (!peers || peers.length === 0) return null;
    const values = peers.map((p) => p.assessed_value).filter((v) => v > 0);
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = sorted.filter((v) => v <= assessedValue).length;
    const percentile = (rank / sorted.length) * 100;
    const median = quantile(values, 0.5) ?? 0;
    const p10 = quantile(values, 0.1) ?? 0;
    const p90 = quantile(values, 0.9) ?? 0;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return {
      count: values.length,
      percentile,
      median,
      p10,
      p90,
      min,
      max,
      diffFromMedian: assessedValue - median,
      diffPct: ((assessedValue - median) / median) * 100,
    };
  }, [peers, assessedValue]);

  if (!stats || stats.count < 5) {
    return null; // not enough peers to be meaningful
  }

  const pos = Math.max(0, Math.min(100, ((assessedValue - stats.min) / Math.max(1, stats.max - stats.min)) * 100));
  const above = stats.diffFromMedian >= 0;
  const tone = above ? 'rose' : 'emerald';
  const toneColors = {
    rose: { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
    emerald: { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  }[tone];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Where this parcel ranks</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Among {stats.count.toLocaleString()} residential parcels in ZIP {zipCode}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Percentile</div>
          <div className="text-2xl font-bold text-primary-700 tabular-nums">
            {stats.percentile.toFixed(0)}<span className="text-base font-medium text-slate-400">th</span>
          </div>
        </div>
      </div>

      <div className={`rounded-md border ${toneColors.border} ${toneColors.bg} px-3 py-2 text-sm`}>
        <strong className={toneColors.text}>
          {above ? '+' : '−'}
          {formatCurrency(Math.abs(stats.diffFromMedian))}
        </strong>{' '}
        <span className="text-slate-700">
          ({above ? '+' : ''}{stats.diffPct.toFixed(1)}%) vs. ZIP median of{' '}
          <strong>{formatCurrency(stats.median)}</strong>
        </span>
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">
          Distribution
        </div>
        <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-200 via-slate-200 to-rose-200">
          {/* p10 / median / p90 ticks */}
          <Tick at={((stats.p10 - stats.min) / Math.max(1, stats.max - stats.min)) * 100} color="#64748b" />
          <Tick at={((stats.median - stats.min) / Math.max(1, stats.max - stats.min)) * 100} color="#1e293b" tall />
          <Tick at={((stats.p90 - stats.min) / Math.max(1, stats.max - stats.min)) * 100} color="#64748b" />
          {/* This parcel's marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-primary-700 border-2 border-white shadow-md"
            style={{ left: `${pos}%` }}
            title={`${formatCurrency(assessedValue)} — ${stats.percentile.toFixed(0)}th percentile`}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-500 tabular-nums">
          <span>{formatCurrency(stats.min)}</span>
          <span>P10 {formatCurrency(stats.p10)}</span>
          <span>Median {formatCurrency(stats.median)}</span>
          <span>P90 {formatCurrency(stats.p90)}</span>
          <span>{formatCurrency(stats.max)}</span>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400 leading-snug">
        Parcel <code className="font-mono">{parcelId}</code> assessed at{' '}
        <strong className="text-slate-700">{formatCurrency(assessedValue)}</strong>. Rank within the
        ZIP is computed live from the snapshot.
      </p>
    </section>
  );
}

function Tick({ at, color, tall }: { at: number; color: string; tall?: boolean }) {
  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 w-0.5 ${tall ? 'h-4' : 'h-2.5'}`}
      style={{ left: `${at}%`, backgroundColor: color }}
    />
  );
}
