// ============================================================
// API helpers — reads static JSON snapshots written by
// scripts/build_snapshot.py. The snapshot is regenerated daily
// by .github/workflows/refresh-data.yml against Databricks.
//
// All data lives under <base>/data/, where <base> is the Vite
// public-base path (configured for the GitHub Pages subpath).
// ============================================================

import type {
  SummaryStats,
  ParcelSearchResponse,
  ParcelDetail,
  AssessmentsResponse,
  ExemptionsResponse,
  AppealsResponse,
  ComparablesResponse,
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
  const res = await fetch(url, { cache: 'no-cache' });
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
  parcelsCache = await fetchJson<ParcelSearchResponse>('/data/parcels.json');
  return parcelsCache;
}

async function loadDetail(parcelId: string) {
  const safe = parcelId.replace(/\//g, '_');
  return fetchJson<{
    parcel: ParcelDetail;
    assessments: AssessmentsResponse;
    exemptions: ExemptionsResponse;
    appeals: AppealsResponse;
    comparables: ComparablesResponse;
  }>(`/data/parcels/${encodeURIComponent(safe)}.json`);
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
          p.address.toLowerCase().includes(q) ||
          p.parcel_id.toLowerCase().includes(q) ||
          (p.current_owner_name ?? '').toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
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

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}
