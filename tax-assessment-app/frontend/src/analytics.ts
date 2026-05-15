// ============================================================
// Client-side analytics over the snapshot bundle.
//
// Everything in here is pure / synchronous so it stays fast in
// the browser even with thousands of parcels.
// ============================================================

import type { ParcelSearchResult } from './types';

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// Ordinary least squares: returns slope, intercept, r², and the min/max of x
// so callers can draw the fit segment without recomputing the bounds.
export function linearFit(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  r2: number;
  xMin: number;
  xMax: number;
  n: number;
} | null {
  if (points.length < 2) return null;
  const n = points.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const { x, y } of points) {
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  // r² via 1 - SS_res / SS_tot
  const meanY = sy / n;
  let ssRes = 0, ssTot = 0;
  let xMin = Infinity, xMax = -Infinity;
  for (const { x, y } of points) {
    const yhat = slope * x + intercept;
    ssRes += (y - yhat) ** 2;
    ssTot += (y - meanY) ** 2;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, xMin, xMax, n };
}

export function groupByCity(parcels: ParcelSearchResult[]) {
  const map = new Map<string, ParcelSearchResult[]>();
  for (const p of parcels) {
    const list = map.get(p.city) ?? [];
    list.push(p);
    map.set(p.city, list);
  }
  return Array.from(map.entries()).map(([city, rows]) => ({
    city,
    count: rows.length,
    total_assessed: rows.reduce((s, r) => s + r.assessed_value, 0),
    median_assessed: quantile(rows.map((r) => r.assessed_value), 0.5) ?? 0,
    // Median YoY — robust to the long tail of reassessment outliers; null
    // values are dropped, not coerced to zero (that biased the old mean toward 0).
    median_change_pct: quantile(
      rows.map((r) => r.assessed_value_change_pct).filter((v): v is number => v !== null && v !== undefined),
      0.5,
    ) ?? 0,
    exemption_coverage: rows.filter((r) => (r.total_exemption_amount ?? 0) > 0).length / rows.length,
    rows,
  }));
}

export function groupByZip(parcels: ParcelSearchResult[]) {
  const map = new Map<string, ParcelSearchResult[]>();
  for (const p of parcels) {
    const list = map.get(p.zip_code) ?? [];
    list.push(p);
    map.set(p.zip_code, list);
  }
  return Array.from(map.entries()).map(([zip, rows]) => ({
    zip,
    count: rows.length,
    median_assessed: quantile(rows.map((r) => r.assessed_value), 0.5) ?? 0,
    p90_assessed: quantile(rows.map((r) => r.assessed_value), 0.9) ?? 0,
    median_change_pct: quantile(
      rows.map((r) => r.assessed_value_change_pct).filter((v): v is number => v !== null && v !== undefined),
      0.5,
    ) ?? 0,
  }));
}

export function groupByLandUse(parcels: ParcelSearchResult[]) {
  const map = new Map<string, ParcelSearchResult[]>();
  for (const p of parcels) {
    const key = p.land_use_description ?? 'Unspecified';
    const list = map.get(key) ?? [];
    list.push(p);
    map.set(key, list);
  }
  return Array.from(map.entries())
    .map(([use, rows]) => ({
      use,
      count: rows.length,
      total_assessed: rows.reduce((s, r) => s + r.assessed_value, 0),
      median_assessed: quantile(rows.map((r) => r.assessed_value), 0.5) ?? 0,
    }))
    .sort((a, b) => b.total_assessed - a.total_assessed);
}

// Property-value bins aligned to natural homeowner brackets, not equal
// widths. Equal-width binning over a heavy-tailed distribution piles
// the bulk into one column and leaves the others empty — useless for
// reading the shape of the data.
const DEFAULT_BINS: Array<[number, number, string]> = [
  [0, 50_000, '<$50k'],
  [50_000, 100_000, '$50–100k'],
  [100_000, 150_000, '$100–150k'],
  [150_000, 200_000, '$150–200k'],
  [200_000, 250_000, '$200–250k'],
  [250_000, 300_000, '$250–300k'],
  [300_000, 400_000, '$300–400k'],
  [400_000, 500_000, '$400–500k'],
  [500_000, 750_000, '$500–750k'],
  [750_000, 1_000_000, '$750k–1M'],
  [1_000_000, 1_500_000, '$1–1.5M'],
  [1_500_000, Number.POSITIVE_INFINITY, '$1.5M+'],
];

export function valueHistogram(parcels: ParcelSearchResult[], _legacy?: number) {
  const values = parcels.map((p) => p.assessed_value).filter((v) => v > 0);
  const buckets = DEFAULT_BINS.map(([lo, hi, label]) => ({
    label,
    count: 0,
    lo,
    hi,
    mid: hi === Number.POSITIVE_INFINITY ? lo * 1.5 : (lo + hi) / 2,
  }));
  for (const v of values) {
    const idx = DEFAULT_BINS.findIndex(([lo, hi]) => v >= lo && v < hi);
    if (idx >= 0) buckets[idx].count += 1;
  }
  return buckets;
}

export function outliers(parcels: ParcelSearchResult[], minAbsChangePct = 6) {
  return [...parcels]
    .filter(
      (p) =>
        p.assessed_value_change_pct !== null &&
        p.assessed_value_change_pct !== undefined &&
        Math.abs(p.assessed_value_change_pct) >= minAbsChangePct,
    )
    .sort(
      (a, b) =>
        Math.abs(b.assessed_value_change_pct ?? 0) - Math.abs(a.assessed_value_change_pct ?? 0),
    );
}

export function exemptionCoverage(parcels: ParcelSearchResult[]) {
  const withExemption = parcels.filter((p) => (p.total_exemption_amount ?? 0) > 0).length;
  return {
    total: parcels.length,
    with_exemption: withExemption,
    without_exemption: parcels.length - withExemption,
    coverage_pct: parcels.length === 0 ? 0 : (withExemption / parcels.length) * 100,
    total_exempted: parcels.reduce((s, p) => s + (p.total_exemption_amount ?? 0), 0),
  };
}
