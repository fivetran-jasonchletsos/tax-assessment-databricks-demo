import { useMemo, useState } from 'react';
import { formatCurrency } from '../api/queries';

interface Props {
  assessedValue: number;
  exemptionAmount: number;
  municipalityHint?: string | null;
}

// Allegheny County's 2026 millage is 4.73 mills. School + municipal vary
// widely (~14–24 / ~1–10), so these are reasonable demo defaults the
// user can override.
const DEFAULTS = {
  county: 4.73,
  school: 19.0,
  municipality: 4.0,
};

export default function TaxEstimator({ assessedValue, exemptionAmount, municipalityHint }: Props) {
  const [county, setCounty] = useState(DEFAULTS.county);
  const [school, setSchool] = useState(DEFAULTS.school);
  const [muni, setMuni] = useState(DEFAULTS.municipality);
  const [advanced, setAdvanced] = useState(false);

  const taxableValue = Math.max(0, assessedValue - (exemptionAmount || 0));
  const totalMills = county + school + muni;

  const tax = useMemo(
    () => ({
      county: (taxableValue * county) / 1000,
      school: (taxableValue * school) / 1000,
      muni: (taxableValue * muni) / 1000,
      total: (taxableValue * totalMills) / 1000,
    }),
    [taxableValue, county, school, muni, totalMills],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Estimated annual tax</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Based on assessed value minus exemptions × millage / 1000. Adjust rates to match{' '}
            {municipalityHint ? <strong>{municipalityHint}</strong> : 'your municipality'}.
          </p>
        </div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="text-xs text-primary-700 hover:text-primary-900 font-medium"
        >
          {advanced ? 'Hide rates' : 'Adjust rates'}
        </button>
      </div>

      <div className="rounded-lg bg-gradient-to-br from-primary-700 to-primary-900 text-white p-5 mb-4">
        <div className="text-[11px] uppercase tracking-wider text-primary-200 font-medium">
          Annual estimate
        </div>
        <div className="mt-1 text-3xl sm:text-4xl font-bold tabular-nums">
          {formatCurrency(tax.total)}
        </div>
        <div className="mt-1 text-xs text-primary-200">
          On {formatCurrency(taxableValue)} taxable · {totalMills.toFixed(2)} total mills
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <Slice label="County" amount={tax.county} mills={county} accent="bg-primary-100 text-primary-700" />
        <Slice label="School" amount={tax.school} mills={school} accent="bg-amber-100 text-amber-700" />
        <Slice label="Municipality" amount={tax.muni} mills={muni} accent="bg-emerald-100 text-emerald-700" />
      </div>

      {advanced && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100">
          <MillInput label="County mills" value={county} onChange={setCounty} />
          <MillInput label="School mills" value={school} onChange={setSchool} />
          <MillInput label="Municipal mills" value={muni} onChange={setMuni} />
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400 leading-snug">
        Estimate only. Actual bills depend on the parcel's exact taxing district, abatements, and
        special assessments. Verify with the Allegheny County Treasurer.
      </p>
    </section>
  );
}

function Slice({
  label,
  amount,
  mills,
  accent,
}: {
  label: string;
  amount: number;
  mills: number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className={`inline-flex text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5 ${accent}`}>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900 tabular-nums">
        {formatCurrency(amount)}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">{mills.toFixed(2)} mills</div>
    </div>
  );
}

function MillInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">{label}</span>
      <input
        type="number"
        step="0.1"
        min="0"
        max="50"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:outline-2 focus:outline-primary-300"
      />
    </label>
  );
}
