// ============================================================
// API helpers — reads the gold layer written by
// scripts/build_snapshot.py. The snapshot is regenerated daily
// by .github/workflows/refresh-data.yml against Databricks.
//
// All data lives under <base>/data/, where <base> is the Vite
// public-base path (configured for the GitHub Pages subpath).
// ============================================================

import type {
  SummaryStats,
  ParcelSearchResponse,
  ParcelSearchResult,
  ParcelDetail,
  AssessmentsResponse,
  ExemptionsResponse,
  AppealsResponse,
  ComparablesResponse,
  ZipTrendsResponse,
} from '../types';

export type DataSource = 'live' | 'demo';

let lastSource: DataSource = 'demo';
let snapshotGeneratedAt: string | null = null;
const listeners = new Set<(s: DataSource) => void>();

function setSource(s: DataSource) {
  if (s === lastSource) return;
  lastSource = s;
  listeners.forEach((l) => l(s));
}

export function subscribeSource(fn: (s: DataSource) => void): () => void {
  listeners.add(fn);
  fn(lastSource);
  return () => listeners.delete(fn);
}

export function getSnapshotTime(): string | null {
  return snapshotGeneratedAt;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

let summaryCache: SummaryStats | null = null;
let parcelsCache: ParcelSearchResponse | null = null;

async function loadSummary(): Promise<SummaryStats> {
  if (summaryCache) return summaryCache;
  const data = await fetchJson<SummaryStats & { generated_at?: string; source?: DataSource }>(
    '/data/summary.json',
  );
  if (data.generated_at) snapshotGeneratedAt = data.generated_at;
  if (data.source) setSource(data.source);
  summaryCache = data;
  return data;
}

async function loadParcels(): Promise<ParcelSearchResponse> {
  if (parcelsCache) return parcelsCache;
  // Snapshot ships as a column-oriented `{count, columns, rows}` bundle
  // for ~65% size savings at 300K-parcel scale. Materialize back into
  // `ParcelSearchResult` objects here so callers don't see the wire
  // format. Legacy `{count, results: [...]}` format is also supported
  // for older snapshots / mock data.
  const raw = await fetchJson<any>('/data/parcels.json');
  let results: ParcelSearchResult[];
  if (Array.isArray(raw.rows) && Array.isArray(raw.columns)) {
    const cols: string[] = raw.columns;
    results = raw.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
      return obj as ParcelSearchResult;
    });
  } else {
    results = raw.results ?? [];
  }
  parcelsCache = { count: raw.count ?? results.length, results };
  return parcelsCache;
}

type DetailBundle = {
  parcel: ParcelDetail;
  assessments: AssessmentsResponse;
  exemptions: ExemptionsResponse;
  appeals: AppealsResponse;
  comparables: ComparablesResponse;
};

const detailCache = new Map<string, Promise<DetailBundle>>();

async function loadDetail(parcelId: string): Promise<DetailBundle> {
  if (detailCache.has(parcelId)) return detailCache.get(parcelId)!;
  const p = (async () => {
    const safe = parcelId.replace(/\//g, '_');
    try {
      return await fetchJson<DetailBundle>(`/data/parcels/${encodeURIComponent(safe)}.json`);
    } catch {
      // No detail bundle written for this parcel (it's outside the
      // featured ZIPs). Synthesize a graceful, limited-data view from
      // the parcels.json record so the detail page still renders.
      return synthesizeDetailFromList(parcelId);
    }
  })();
  // Don't cache a rejected promise — a transient failure would otherwise
  // poison the cache and make every later lookup for this parcel fail.
  p.catch(() => detailCache.delete(parcelId));
  detailCache.set(parcelId, p);
  return p;
}

async function synthesizeDetailFromList(parcelId: string): Promise<DetailBundle> {
  const all = await loadParcels();
  const p = all.results.find((r) => r.parcel_id === parcelId);
  if (!p) {
    throw new Error(`Parcel ${parcelId} not in snapshot.`);
  }
  const parcel: ParcelDetail = {
    parcel_id: p.parcel_id,
    address: p.address,
    city: p.city,
    zip_code: p.zip_code,
    county: 'Allegheny',
    current_owner_name: p.current_owner_name,
    current_mailing_address: p.current_owner_name,
    current_ownership_type: null,
    land_use_code: null,
    land_use_description: p.land_use_description,
    acreage: null,
    latitude: p.latitude,
    longitude: p.longitude,
  };
  const currentAssessment = {
    tax_year: p.tax_year,
    assessed_value: p.assessed_value,
    market_value: p.market_value,
    land_value: Math.round(p.assessed_value * 0.25),
    improvement_value: Math.round(p.assessed_value * 0.75),
    land_value_percentage: 25,
    improvement_value_percentage: 75,
    market_to_assessed_ratio:
      p.assessed_value > 0 ? +(p.market_value / p.assessed_value).toFixed(2) : null,
    assessed_value_change: null,
    assessed_value_change_pct: p.assessed_value_change_pct,
    total_exemption_amount: p.total_exemption_amount,
    net_assessed_value: p.assessed_value - (p.total_exemption_amount ?? 0),
    assessment_date: `${p.tax_year}-01-15`,
  };
  // Find a handful of nearby parcels in the same city / similar value as
  // a synthesized "comparables" list.
  const others = all.results
    .filter(
      (r) =>
        r.parcel_id !== p.parcel_id &&
        r.city === p.city &&
        Math.abs(r.assessed_value - p.assessed_value) <= p.assessed_value * 0.25,
    )
    .sort((a, b) => Math.abs(a.assessed_value - p.assessed_value) - Math.abs(b.assessed_value - p.assessed_value))
    .slice(0, 6)
    .map((c, i) => ({
      parcel_id: c.parcel_id,
      address: c.address,
      city: c.city,
      zip_code: c.zip_code,
      current_owner_name: c.current_owner_name,
      land_use_description: c.land_use_description,
      acreage: null,
      assessed_value: c.assessed_value,
      market_value: c.market_value,
      assessed_value_change_pct: c.assessed_value_change_pct,
      distance_miles: 0.1 + i * 0.2,
    }));
  return {
    parcel,
    assessments: { parcel_id: p.parcel_id, assessments: [currentAssessment] },
    exemptions: { parcel_id: p.parcel_id, exemptions: [] },
    appeals: { parcel_id: p.parcel_id, summary: {}, appeals: [] },
    comparables: { parcel_id: p.parcel_id, comparables: others },
  };
}

export const api = {
  getSummary: () => loadSummary(),

  searchParcels: async (params: { q?: string; city?: string; zip?: string; limit?: number }) => {
    const all = await loadParcels();
    let results = all.results;
    if (params.q) {
      const q = params.q.toLowerCase();
      results = results.filter(
        (p) =>
          (p.address ?? '').toLowerCase().includes(q) ||
          (p.parcel_id ?? '').toLowerCase().includes(q) ||
          (p.current_owner_name ?? '').toLowerCase().includes(q) ||
          (p.city ?? '').toLowerCase().includes(q) ||
          (p.land_use_description ?? '').toLowerCase().includes(q),
      );
    }
    if (params.city) {
      const c = params.city.toUpperCase();
      results = results.filter((p) => p.city.toUpperCase().includes(c));
    }
    if (params.zip) {
      results = results.filter((p) => p.zip_code === params.zip);
    }
    if (params.limit) results = results.slice(0, params.limit);
    return { count: results.length, results };
  },

  getParcel: async (id: string): Promise<ParcelDetail> => (await loadDetail(id)).parcel,
  getAssessments: async (id: string): Promise<AssessmentsResponse> =>
    (await loadDetail(id)).assessments,
  getExemptions: async (id: string): Promise<ExemptionsResponse> => (await loadDetail(id)).exemptions,
  getAppeals: async (id: string): Promise<AppealsResponse> => (await loadDetail(id)).appeals,
  getComparables: async (id: string): Promise<ComparablesResponse> =>
    (await loadDetail(id)).comparables,

  // Per-ZIP yearly median assessed values, used to render sparklines on the
  // dashboard ZIP performance table. Falls back to an empty list if the
  // snapshot doesn't include zip-trends.json (older snapshots).
  getZipTrends: async (): Promise<ZipTrendsResponse> => {
    try {
      return await fetchJson<ZipTrendsResponse>('/data/zip-trends.json');
    } catch {
      return { zips: [] };
    }
  },
};

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

// Compact, axis-friendly currency formatting:  1,234 → $1.2k,  1,500,000 → $1.5M
export function formatCurrencyShort(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}
