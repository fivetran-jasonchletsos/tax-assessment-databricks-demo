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
    avg_change_pct: mean(rows.map((r) => r.assessed_value_change_pct ?? 0)),
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
    avg_change_pct: mean(rows.map((r) => r.assessed_value_change_pct ?? 0)),
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

export function valueHistogram(parcels: ParcelSearchResult[], bins = 12) {
  const values = parcels.map((p) => p.assessed_value).filter((v) => v > 0);
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return [{ label: `$${Math.round(min / 1000)}k`, count: values.length, mid: min }];
  const width = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    label: `$${Math.round((min + width * i) / 1000)}k`,
    count: 0,
    mid: min + width * (i + 0.5),
  }));
  for (const v of values) {
    let idx = Math.min(bins - 1, Math.floor((v - min) / width));
    if (idx < 0) idx = 0;
    buckets[idx].count += 1;
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
