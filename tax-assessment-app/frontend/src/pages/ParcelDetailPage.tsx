import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MapContainer, Marker, Popup, TileLayer, Circle } from 'react-leaflet';
import L from 'leaflet';
import { api, formatCurrency, formatPercent } from '../api/queries';
import TaxEstimator from '../components/TaxEstimator';
import WatchlistButton from '../components/WatchlistButton';
import NeighborhoodPercentile from '../components/NeighborhoodPercentile';
import type {
  AppealsResponse,
  AssessmentRow,
  AssessmentsResponse,
  ComparablesResponse,
  ExemptionsResponse,
  ParcelDetail,
} from '../types';

// Fix Leaflet default marker icon paths (Vite would otherwise 404).
// Served locally from public/leaflet so we don't hot-link unpkg.
const LEAFLET_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/leaflet`;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_BASE}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_BASE}/marker-icon.png`,
  shadowUrl: `${LEAFLET_BASE}/marker-shadow.png`,
});

export default function ParcelDetailPage() {
  const { parcelId = '' } = useParams();
  const navigate = useNavigate();
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [assessments, setAssessments] = useState<AssessmentsResponse | null>(null);
  const [exemptions, setExemptions] = useState<ExemptionsResponse | null>(null);
  const [appeals, setAppeals] = useState<AppealsResponse | null>(null);
  const [comparables, setComparables] = useState<ComparablesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getParcel(parcelId),
      api.getAssessments(parcelId),
      api.getExemptions(parcelId),
      api.getAppeals(parcelId),
      api.getComparables(parcelId),
    ])
      .then(([p, a, e, ap, c]) => {
        setParcel(p);
        setAssessments(a);
        setExemptions(e);
        setAppeals(ap);
        setComparables(c);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load parcel');
      })
      .finally(() => setLoading(false));
  }, [parcelId]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Couldn't load this parcel</h1>
        <p className="mt-2 text-sm text-slate-500">{loadError}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => navigate(0)}
            className="rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2"
          >
            Try again
          </button>
          <button
            onClick={() => navigate('/search')}
            className="rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-4 py-2"
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  if (loading || !parcel || !assessments) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center text-slate-500">
        Loading parcel...
      </div>
    );
  }

  const sortedAssessments = [...assessments.assessments].sort((a, b) => a.tax_year - b.tax_year);
  const latest = sortedAssessments[sortedAssessments.length - 1];
  const earliest = sortedAssessments[0];
  const totalGrowth =
    earliest && latest && earliest.assessed_value > 0
      ? ((latest.assessed_value - earliest.assessed_value) / earliest.assessed_value) * 100
      : null;

  const currentExemption = exemptions?.exemptions[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="text-sm text-slate-500 mb-4">
        <Link to="/" className="hover:text-primary-700">
          Home
        </Link>
        {' / '}
        <Link to="/search" className="hover:text-primary-700">
          Properties
        </Link>
        {' / '}
        <span className="text-slate-700">{parcel.parcel_id}</span>
      </nav>

      <header className="rounded-2xl text-white p-6 sm:p-8 shadow-lg" style={{ background: 'linear-gradient(135deg, #111827 0%, #1f2937 70%, #111827 100%)' }}>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider font-mono" style={{ color: '#f59e0b' }}>
              Parcel {parcel.parcel_id}
            </div>
            <h1 className="mt-1 text-3xl sm:text-4xl font-display font-bold">{parcel.address}</h1>
            <div className="mt-1 text-primary-100">
              {parcel.city}, PA {parcel.zip_code} · {parcel.county} County
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Pill>{parcel.land_use_description ?? 'Unspecified use'}</Pill>
              {parcel.acreage && <Pill>{parcel.acreage} acres</Pill>}
              {parcel.current_ownership_type && <Pill>{parcel.current_ownership_type}</Pill>}
              <WatchlistButton parcelId={parcel.parcel_id} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:gap-4">
            <HeroStat label={`${latest.tax_year} Assessed`} value={formatCurrency(latest.assessed_value)} />
            <HeroStat label="Market Value" value={formatCurrency(latest.market_value)} />
            <HeroStat
              label="Net of Exemptions"
              value={formatCurrency(latest.net_assessed_value ?? latest.assessed_value)}
            />
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AssessmentHistorySection sortedAssessments={sortedAssessments} totalGrowth={totalGrowth} />

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Location</h2>
          <p className="text-sm text-slate-500 mb-3">
            Approximate location (ZIP centroid) — WPRDC's public assessment dataset doesn't ship
            parcel-level geometry.
          </p>
          <div className="h-72 overflow-hidden rounded-lg border border-slate-200">
            {parcel.latitude && parcel.longitude ? (
              <MapContainer
                center={[parcel.latitude, parcel.longitude]}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Circle
                  center={[parcel.latitude, parcel.longitude]}
                  radius={80}
                  pathOptions={{ color: '#0284c7', fillColor: '#0ea5e9', fillOpacity: 0.2 }}
                />
                <Marker position={[parcel.latitude, parcel.longitude]}>
                  <Popup>
                    <strong>{parcel.address}</strong>
                    <br />
                    {parcel.city}, PA {parcel.zip_code}
                  </Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No coordinates available
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Owner</h2>
          <div className="space-y-3 text-sm">
            <Field label="Current owner" value={parcel.current_owner_name ?? '—'} />
            <Field label="Mailing address" value={parcel.current_mailing_address ?? '—'} />
            <Field label="Ownership type" value={parcel.current_ownership_type ?? '—'} />
            <Field label="Land use code" value={parcel.land_use_code ?? '—'} />
            <Field label="Acreage" value={parcel.acreage ? `${parcel.acreage} acres` : '—'} />
          </div>
        </section>

        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Value breakdown — {latest.tax_year}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            How the assessed value splits between land and improvements
          </p>
          <ValueComposition
            land={latest.land_value}
            improvement={latest.improvement_value}
            total={latest.assessed_value}
          />
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="Land value" value={formatCurrency(latest.land_value)} />
            <Field label="Improvement value" value={formatCurrency(latest.improvement_value)} />
            <Field
              label="Market : assessed ratio"
              value={latest.market_to_assessed_ratio?.toFixed(2) ?? '—'}
            />
            <Field
              label="YoY change"
              value={
                <span
                  className={
                    latest.assessed_value_change_pct && latest.assessed_value_change_pct >= 0
                      ? 'text-rose-700 font-semibold'
                      : 'text-emerald-700 font-semibold'
                  }
                >
                  {formatPercent(latest.assessed_value_change_pct ?? 0)}
                </span>
              }
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeighborhoodPercentile
          parcelId={parcel.parcel_id}
          zipCode={parcel.zip_code}
          assessedValue={latest.assessed_value}
        />
        <TaxEstimator
          assessedValue={latest.assessed_value}
          exemptionAmount={latest.total_exemption_amount ?? 0}
          municipalityHint={parcel.city}
        />
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Exemptions</h2>
            <p className="text-sm text-slate-500">
              Per-year exemption totals for this parcel — homestead, senior, veteran, disability.
            </p>
          </div>
          {currentExemption && (
            <div className="text-right">
              <div className="text-xs text-slate-500">{currentExemption.tax_year} total exempted</div>
              <div className="text-xl font-bold text-primary-700">
                {formatCurrency(currentExemption.total_exemption_amount)}
              </div>
            </div>
          )}
        </div>

        {currentExemption ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ExemptionTile
              label="Homestead"
              amount={currentExemption.homestead_exemption_amount}
              count={currentExemption.homestead_count}
              color="bg-emerald-50 text-emerald-700 border-emerald-200"
            />
            <ExemptionTile
              label="Senior"
              amount={currentExemption.senior_exemption_amount}
              count={currentExemption.senior_count}
              color="bg-amber-50 text-amber-700 border-amber-200"
            />
            <ExemptionTile
              label="Veteran"
              amount={currentExemption.veteran_exemption_amount}
              count={currentExemption.veteran_count}
              color="bg-sky-50 text-sky-700 border-sky-200"
            />
            <ExemptionTile
              label="Disability"
              amount={currentExemption.disability_exemption_amount}
              count={currentExemption.disability_count}
              color="bg-violet-50 text-violet-700 border-violet-200"
            />
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
            No exemptions on file for this parcel.
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Appeals</h2>
            <p className="text-sm text-slate-500">
              History of assessment challenges filed with the Board of Property Assessment Appeals.
            </p>
          </div>
          {appeals?.summary?.total_appeals !== undefined &&
            (appeals.summary.total_appeals ?? 0) > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <Badge>
                  {appeals.summary.approved_count ?? 0} approved · {appeals.summary.denied_count ?? 0} denied
                </Badge>
                <Badge tone="success">
                  {(appeals.summary.success_rate_pct ?? 0).toFixed(0)}% success
                </Badge>
              </div>
            )}
        </div>

        {appeals && appeals.appeals.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Filed</th>
                  <th className="px-4 py-2 text-left">Hearing</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Original</th>
                  <th className="px-4 py-2 text-right">Final</th>
                  <th className="px-4 py-2 text-right">Reduction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {appeals.appeals.map((a) => (
                  <tr key={a.appeal_id}>
                    <td className="px-4 py-3 text-slate-700">{a.filed_date}</td>
                    <td className="px-4 py-3 text-slate-700">{a.hearing_date ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.appeal_status} />
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(a.original_value)}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(a.final_value ?? a.requested_value)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700 font-medium">
                      {a.value_reduction ? formatCurrency(a.value_reduction) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
            No appeals filed for this parcel.
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Comparable properties</h2>
            <p className="text-sm text-slate-500">
              Same land use, same city, ±20% assessed value — sorted by proximity.
            </p>
          </div>
        </div>

        {comparables && comparables.comparables.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {comparables.comparables.map((c) => (
              <button
                key={c.parcel_id}
                onClick={() => navigate(`/parcels/${encodeURIComponent(c.parcel_id)}`)}
                className="text-left rounded-lg border border-slate-200 p-4 hover:border-primary-300 hover:shadow-md transition-all"
              >
                <div className="text-xs font-mono text-slate-500">{c.parcel_id}</div>
                <div className="mt-1 font-medium text-slate-900">{c.address}</div>
                <div className="text-xs text-slate-500">
                  {c.city}, PA {c.zip_code} · {c.distance_miles.toFixed(2)} mi
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold text-primary-700">
                    {formatCurrency(c.assessed_value)}
                  </span>
                  <span className="text-xs text-slate-500">{c.land_use_description}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
            No comparables in range.
          </div>
        )}
      </section>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-white">
      {children}
    </span>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/10 backdrop-blur-sm p-3">
      <div className="text-[10px] sm:text-xs uppercase tracking-wider text-primary-200">{label}</div>
      <div className="mt-1 text-base sm:text-lg lg:text-xl font-bold leading-tight">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 text-right">{value}</span>
    </div>
  );
}

function ValueComposition({
  land,
  improvement,
  total,
}: {
  land: number;
  improvement: number;
  total: number;
}) {
  const denom = total > 0 ? total : land + improvement;
  if (denom <= 0) {
    return <div className="text-sm text-slate-400">No value breakdown on file.</div>;
  }
  const landPct = (land / denom) * 100;
  const impPct = (improvement / denom) * 100;
  return (
    <div>
      <div className="flex h-6 w-full overflow-hidden rounded border border-slate-200">
        <div
          className="bg-amber-400"
          style={{ width: `${landPct}%` }}
          title={`Land · ${formatCurrency(land)}`}
        />
        <div
          className="bg-primary-700"
          style={{ width: `${impPct}%` }}
          title={`Improvements · ${formatCurrency(improvement)}`}
        />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums">
        <span className="text-slate-700">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400 mr-1.5 align-middle" />
          Land {landPct.toFixed(0)}%
        </span>
        <span className="text-slate-700">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary-700 mr-1.5 align-middle" />
          Improvements {impPct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function ExemptionTile({
  label,
  amount,
  count,
  color,
}: {
  label: string;
  amount: number;
  count: number;
  color: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="text-xs font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-bold">{formatCurrency(amount)}</div>
      <div className="mt-1 text-xs opacity-75">
        {count} {count === 1 ? 'exemption' : 'exemptions'}
      </div>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'success' }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 ${
        tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const tone =
    s === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700'
      : s === 'DENIED'
      ? 'bg-rose-50 text-rose-700'
      : 'bg-amber-50 text-amber-700';
  return <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${tone}`}>{s}</span>;
}

// ============================================================
// Assessment History — KPI-driven redesign
// ============================================================

function AssessmentHistorySection({
  sortedAssessments,
  totalGrowth,
}: {
  sortedAssessments: AssessmentRow[];
  totalGrowth: number | null;
}) {
  const n = sortedAssessments.length;
  const latest = sortedAssessments[n - 1];
  const prior = n > 1 ? sortedAssessments[n - 2] : null;
  const earliest = sortedAssessments[0];

  // Year-over-year deltas
  const assessedDelta = prior ? latest.assessed_value - prior.assessed_value : null;
  const assessedPct = prior && prior.assessed_value > 0
    ? ((latest.assessed_value - prior.assessed_value) / prior.assessed_value) * 100
    : null;
  const marketDelta = prior ? latest.market_value - prior.market_value : null;
  const marketPct = prior && prior.market_value > 0
    ? ((latest.market_value - prior.market_value) / prior.market_value) * 100
    : null;
  const netLatest = latest.net_assessed_value ?? latest.assessed_value;
  const netPrior = prior ? (prior.net_assessed_value ?? prior.assessed_value) : null;
  const netDelta = netPrior !== null ? netLatest - netPrior : null;
  const netPct = netPrior !== null && netPrior > 0 ? ((netLatest - netPrior) / netPrior) * 100 : null;
  const ratio = latest.market_to_assessed_ratio;
  const priorRatio = prior?.market_to_assessed_ratio ?? null;
  const ratioDelta = ratio !== null && priorRatio !== null ? ratio - priorRatio : null;

  // Peak / trough
  const peak = sortedAssessments.reduce((p, c) => (c.assessed_value > p.assessed_value ? c : p), sortedAssessments[0]);
  const trough = sortedAssessments.reduce((p, c) => (c.assessed_value < p.assessed_value ? c : p), sortedAssessments[0]);
  const years = latest && earliest && latest.tax_year !== earliest.tax_year ? latest.tax_year - earliest.tax_year : 0;
  const cagr = years > 0 && earliest.assessed_value > 0
    ? (Math.pow(latest.assessed_value / earliest.assessed_value, 1 / years) - 1) * 100
    : null;

  // Land vs improvement breakdown (latest)
  const landPct = latest.land_value_percentage ?? (latest.assessed_value > 0 ? (latest.land_value / latest.assessed_value) * 100 : null);

  return (
    <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 bg-gradient-to-b from-white to-slate-50">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-semibold text-primary-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary-600 animate-pulse" />
            Tax Roll History
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900 tracking-tight">Valuation trend</h2>
          <p className="text-sm text-slate-500">
            {n > 1
              ? `${n} tax years on record · ${earliest.tax_year}–${latest.tax_year}`
              : `Single tax year on record · ${latest.tax_year}`}
          </p>
        </div>
        {totalGrowth !== null && n > 1 && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              {earliest.tax_year}→{latest.tax_year}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${totalGrowth >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {totalGrowth >= 0 ? '▲' : '▼'} {Math.abs(totalGrowth).toFixed(1)}%
            </div>
            {cagr !== null && (
              <div className="text-[11px] text-slate-500">CAGR {cagr.toFixed(2)}%/yr</div>
            )}
          </div>
        )}
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-100">
        <KpiTile
          accent="primary"
          label="Assessed"
          value={formatCurrency(latest.assessed_value)}
          delta={assessedDelta}
          pct={assessedPct}
          sparkValues={sortedAssessments.map((a) => a.assessed_value)}
          sparkColor="#0284c7"
        />
        <KpiTile
          accent="gold"
          label="Market"
          value={formatCurrency(latest.market_value)}
          delta={marketDelta}
          pct={marketPct}
          sparkValues={sortedAssessments.map((a) => a.market_value)}
          sparkColor="#f59e0b"
        />
        <KpiTile
          accent="emerald"
          label="Net of Exemptions"
          value={formatCurrency(netLatest)}
          delta={netDelta}
          pct={netPct}
          sparkValues={sortedAssessments.map((a) => a.net_assessed_value ?? a.assessed_value)}
          sparkColor="#059669"
        />
        <RatioTile
          ratio={ratio}
          delta={ratioDelta}
          landPct={landPct}
        />
      </div>

      {/* Chart */}
      <div className="p-6 pt-5">
        {n === 1 ? (
          <SingleYearLadder row={latest} />
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sortedAssessments} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAssessed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0284c7" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="gradMarket" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="tax_year"
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(2,132,199,0.05)' }}
                  content={<TrendTooltip />}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="rect"
                />
                <Area
                  type="monotone"
                  dataKey="market_value"
                  name="Market value"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fill="url(#gradMarket)"
                />
                <Bar
                  dataKey="assessed_value"
                  name="Assessed value"
                  fill="url(#gradAssessed)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
                <Line
                  type="monotone"
                  dataKey="net_assessed_value"
                  name="Net assessed"
                  stroke="#059669"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#059669' }}
                />
                <ReferenceDot
                  x={peak.tax_year}
                  y={peak.assessed_value}
                  r={6}
                  fill="#0284c7"
                  stroke="#fff"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stats strip */}
      {n > 1 && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-600">
          <StripStat label="Peak" value={`${formatCurrency(peak.assessed_value)} · ${peak.tax_year}`} color="primary" />
          <StripStat label="Trough" value={`${formatCurrency(trough.assessed_value)} · ${trough.tax_year}`} color="muted" />
          {cagr !== null && (
            <StripStat label="CAGR" value={`${cagr >= 0 ? '+' : ''}${cagr.toFixed(2)}% / yr`} color={cagr >= 0 ? 'rose' : 'emerald'} />
          )}
          {assessedPct !== null && prior && (
            <StripStat label={`${prior.tax_year}→${latest.tax_year}`} value={`${assessedPct >= 0 ? '+' : ''}${assessedPct.toFixed(1)}%`} color={assessedPct >= 0 ? 'rose' : 'emerald'} />
          )}
        </div>
      )}
    </section>
  );
}

function KpiTile({
  accent, label, value, delta, pct, sparkValues, sparkColor,
}: {
  accent: 'primary' | 'gold' | 'emerald';
  label: string;
  value: string;
  delta: number | null;
  pct: number | null;
  sparkValues: number[];
  sparkColor: string;
}) {
  const accentBorder = accent === 'primary' ? 'before:bg-primary-500' : accent === 'gold' ? 'before:bg-amber-500' : 'before:bg-emerald-500';
  const up = (pct ?? 0) >= 0;
  return (
    <div className={`relative bg-white p-4 sm:p-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${accentBorder}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl sm:text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {pct !== null ? (
            <>
              <span className={`inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${up ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
              </span>
              {delta !== null && (
                <span className={`text-[11px] tabular-nums ${up ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">First year</span>
          )}
        </div>
        {sparkValues.length > 1 && (
          <MiniSpark values={sparkValues} color={sparkColor} />
        )}
      </div>
    </div>
  );
}

function RatioTile({ ratio, delta, landPct }: { ratio: number | null; delta: number | null; landPct: number | null }) {
  const value = ratio !== null ? `${ratio.toFixed(2)}×` : '—';
  const overUnder = ratio !== null && ratio !== 1 ? (ratio > 1 ? 'Market over assessed' : 'Assessed over market') : null;
  return (
    <div className="relative bg-white p-4 sm:p-5 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-slate-400">
      <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-slate-500">Market / Assessed</div>
      <div className="mt-1.5 text-2xl sm:text-[26px] font-bold text-slate-900 tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {delta !== null ? (
            <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${delta >= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}
            </span>
          ) : null}
          {overUnder && <span className="text-[10px] text-slate-500 uppercase tracking-wider">{overUnder}</span>}
        </div>
        {landPct !== null && (
          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
            <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, landPct))}%` }} />
            </div>
            <span className="tabular-nums">{landPct.toFixed(0)}% land</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniSpark({ values, color }: { values: number[]; color: string }) {
  const w = 56, h = 20;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / range) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1].split(',')[0]} cy={pts[pts.length - 1].split(',')[1]} r="2" fill={color} />
      )}
    </svg>
  );
}

function StripStat({ label, value, color }: { label: string; value: string; color: 'primary' | 'muted' | 'rose' | 'emerald' }) {
  const colorClass =
    color === 'primary' ? 'text-primary-700' :
    color === 'rose' ? 'text-rose-600' :
    color === 'emerald' ? 'text-emerald-600' :
    'text-slate-700';
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-slate-400">{label}</span>
      <span className={`font-semibold tabular-nums ${colorClass}`}>{value}</span>
    </div>
  );
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const byKey: Record<string, any> = {};
  for (const p of payload) byKey[p.dataKey] = p.value;
  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-lg px-3 py-2 text-xs min-w-[160px]">
      <div className="font-semibold text-slate-900 mb-1.5">Tax year {label}</div>
      {byKey.assessed_value !== undefined && (
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Assessed</span>
          <span className="font-semibold text-primary-700 tabular-nums">{formatCurrency(byKey.assessed_value)}</span>
        </div>
      )}
      {byKey.market_value !== undefined && (
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Market</span>
          <span className="font-semibold text-amber-600 tabular-nums">{formatCurrency(byKey.market_value)}</span>
        </div>
      )}
      {byKey.net_assessed_value !== undefined && byKey.net_assessed_value !== null && (
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Net</span>
          <span className="font-semibold text-emerald-600 tabular-nums">{formatCurrency(byKey.net_assessed_value)}</span>
        </div>
      )}
    </div>
  );
}

function SingleYearLadder({ row }: { row: AssessmentRow }) {
  // Horizontal bar comparison: assessed / market / net + land / improvement breakdown
  const max = Math.max(row.assessed_value, row.market_value, row.net_assessed_value ?? row.assessed_value);
  const bar = (label: string, value: number, color: string, sub?: string) => (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="tabular-nums font-bold text-slate-900">{formatCurrency(value)} {sub && <span className="text-[10px] font-medium text-slate-500 ml-1">{sub}</span>}</span>
      </div>
      <div className="h-3 bg-slate-100 rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all"
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      </div>
    </div>
  );
  const netVal = row.net_assessed_value ?? row.assessed_value;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Only one tax year on record so far — here's how this year's values stack against each other.
      </p>
      {bar('Market value', row.market_value, 'linear-gradient(90deg, #f59e0b, #fbbf24)')}
      {bar('Assessed value', row.assessed_value, 'linear-gradient(90deg, #0284c7, #38bdf8)')}
      {bar('Net of exemptions', netVal, 'linear-gradient(90deg, #059669, #10b981)')}
      {(row.land_value || row.improvement_value) && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Composition</div>
          <div className="flex h-5 rounded-md overflow-hidden border border-slate-200">
            <div
              className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-amber-900"
              style={{ width: `${row.land_value_percentage ?? (row.land_value / row.assessed_value * 100)}%` }}
              title={`Land ${formatCurrency(row.land_value)}`}
            >
              LAND
            </div>
            <div
              className="bg-primary-500 flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${row.improvement_value_percentage ?? (row.improvement_value / row.assessed_value * 100)}%` }}
              title={`Improvements ${formatCurrency(row.improvement_value)}`}
            >
              IMPROVEMENTS
            </div>
          </div>
          <div className="flex justify-between text-[11px] mt-1.5 text-slate-600 tabular-nums">
            <span>Land · {formatCurrency(row.land_value)}</span>
            <span>Improvements · {formatCurrency(row.improvement_value)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
