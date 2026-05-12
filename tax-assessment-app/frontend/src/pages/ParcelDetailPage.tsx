import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { MapContainer, Marker, Popup, TileLayer, Circle } from 'react-leaflet';
import L from 'leaflet';
import { api, formatCurrency, formatPercent } from '../api/queries';
import TaxEstimator from '../components/TaxEstimator';
import WatchlistButton from '../components/WatchlistButton';
import type {
  AppealsResponse,
  AssessmentsResponse,
  ComparablesResponse,
  ExemptionsResponse,
  ParcelDetail,
} from '../types';

// Fix Leaflet default marker icon paths (Vite would otherwise 404)
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
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

  useEffect(() => {
    setLoading(true);
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
      .finally(() => setLoading(false));
  }, [parcelId]);

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

      <header className="rounded-2xl bg-gradient-to-br from-primary-700 to-primary-900 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-primary-200 font-mono">
              Parcel {parcel.parcel_id}
            </div>
            <h1 className="mt-1 text-3xl sm:text-4xl font-bold">{parcel.address}</h1>
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
        <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Assessment history</h2>
              <p className="text-sm text-slate-500">
                Assessed vs. market value across the past {sortedAssessments.length} tax years.
              </p>
            </div>
            {totalGrowth !== null && (
              <div className="text-right">
                <div className="text-xs text-slate-500">Total change</div>
                <div
                  className={`text-lg font-semibold ${
                    totalGrowth >= 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {formatPercent(totalGrowth)}
                </div>
              </div>
            )}
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={sortedAssessments}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="tax_year" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: any) => formatCurrency(value)}
                  labelFormatter={(label) => `Tax year ${label}`}
                  contentStyle={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="assessed_value" name="Assessed" fill="#0284c7" radius={[6, 6, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="market_value"
                  name="Market"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Location</h2>
          <p className="text-sm text-slate-500 mb-3">
            Coordinates from <code className="font-mono text-xs bg-slate-100 px-1 rounded">dim_parcels</code>.
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
          <h2 className="text-lg font-semibold text-slate-900 mb-3">
            Value breakdown — {latest.tax_year}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Land', value: latest.land_value },
                      { name: 'Improvements', value: latest.improvement_value },
                    ]}
                    dataKey="value"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    <Cell fill="#0ea5e9" />
                    <Cell fill="#0c4a6e" />
                  </Pie>
                  <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 text-sm">
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
                        ? 'text-rose-600 font-semibold'
                        : 'text-emerald-600 font-semibold'
                    }
                  >
                    {formatPercent(latest.assessed_value_change_pct ?? 0)}
                  </span>
                }
              />
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6">
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
              Aggregated from{' '}
              <code className="font-mono text-xs bg-slate-100 px-1 rounded">fct_exemptions_summary</code>.
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
