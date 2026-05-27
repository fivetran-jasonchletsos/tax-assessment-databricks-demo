// HelpTour — a floating "?" button + slide-style overlay that walks first-time
// visitors through the site's capabilities. Auto-opens on first visit (gated
// by localStorage); thereafter only opens on demand.
//
// Each step is a self-contained capability description with: a title, a short
// pitch, a CTA route (where to actually go try it), and an optional inline
// preview rendered with CSS so we don't ship image assets.

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const LS_KEY = 'helpTour:dismissed';

interface Step {
  title: string;
  pitch: string;
  cta: { label: string; to: string } | null;
  preview: () => ReactNode;
}

const STEPS: Step[] = [
  {
    title: 'Search 575,000 records in under a second',
    pitch:
      'Look up any property in Allegheny County by address, owner, parcel ID, or ZIP. Results stream from a Databricks-governed snapshot built daily by Fivetran.',
    cta: { label: 'Open Search', to: '/search' },
    preview: () => (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center px-3 text-xs text-slate-500">
          Search by address, owner, parcel ID…
        </div>
        <div className="mt-2 space-y-1">
          {['451 Beverly Rd · Mt. Lebanon · $312K', '227 Atwood St · Pittsburgh · $895K', '14 Forbes Ave · Wilkinsburg · $186K'].map((r, i) => (
            <div key={i} className="h-5 rounded bg-slate-50 border border-slate-100 px-2 text-[11px] flex items-center text-slate-600">
              {r}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'A cross-filtering dashboard at scale',
    pitch:
      'Click any bar, ZIP row, or land-use slice — every chart, table, and KPI re-aggregates against the same 575K-record set in milliseconds.',
    cta: { label: 'Open Dashboard', to: '/dashboard' },
    preview: () => (
      <div className="rounded-lg border border-slate-200 bg-white p-3 grid grid-cols-3 gap-2">
        {[60, 80, 45, 95, 70, 30].map((h, i) => (
          <div key={i} className="flex flex-col justify-end h-16">
            <div
              className="rounded-sm bg-primary-500"
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Pipeline observability you can show your board',
    pitch:
      'Every layer — Fivetran connectors, Databricks warehouse, dbt transformation, this site — reports live status. Simulate a failure to see how observability works in practice.',
    cta: { label: 'Open Pipeline', to: '/pipeline' },
    preview: () => (
      <div className="rounded-lg p-3" style={{ background: '#171717' }}>
        {[
          { name: 'orders_prod', status: '#22c55e' },
          { name: 'events_stream', status: '#f59e0b' },
          { name: 'users_dim', status: '#22c55e' },
        ].map((r) => (
          <div key={r.name} className="flex items-center justify-between py-1 text-xs">
            <span className="text-neutral-200 font-mono">{r.name}</span>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: r.status }} />
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Drill into any single parcel',
    pitch:
      'Click a result to see 6 years of assessment history, exemption breakdowns, appeal outcomes, neighborhood percentile, and comparables — all joined from six source tables, served as one page.',
    cta: { label: 'Browse parcels', to: '/search' },
    preview: () => (
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold text-slate-900">2024 · $312,500</div>
        <svg viewBox="0 0 120 30" className="w-full h-8">
          <polyline points="2,24 22,20 42,18 62,15 82,11 102,9 118,6" fill="none" stroke="#0284c7" strokeWidth="1.5" />
        </svg>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          {['Assessed', 'Market', 'Net'].map((l) => (
            <div key={l} className="rounded bg-slate-50 border border-slate-100 px-1.5 py-1 text-slate-600">{l}</div>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: 'Geospatial heatmap by ZIP',
    pitch:
      'Switch between assessed value, market value, year-over-year change, and assessment ratio. The same pattern works for site-selection, trade-area, or revenue-by-region analysis.',
    cta: { label: 'Open Map', to: '/map' },
    preview: () => (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-4 gap-1">
        {[0.2, 0.4, 0.6, 0.3, 0.8, 0.5, 0.9, 0.4, 0.3, 0.7, 0.6, 0.5].map((v, i) => (
          <div key={i} className="h-5 rounded-sm" style={{ background: `rgba(2,132,199,${v})` }} />
        ))}
      </div>
    ),
  },
  {
    title: 'Ask your data in plain English',
    pitch:
      'Skip the search form — type a question. A local rules layer handles the common asks for free; opt-in Claude integration handles the open-ended ones, with your API key stored only in your browser.',
    cta: { label: 'Try Ask AI', to: '/agent' },
    preview: () => (
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <div className="rounded bg-slate-50 border border-slate-100 px-2 py-1.5 text-[11px] text-slate-600">
          “Which ZIP had the biggest assessment jump last year?”
        </div>
        <div className="rounded bg-primary-50 border border-primary-100 px-2 py-1.5 text-[11px] text-primary-800">
          ZIP 15206 · +18.4% median · 3,842 parcels
        </div>
      </div>
    ),
  },
];

export default function HelpTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  // Auto-open on first visit only.
  useEffect(() => {
    try {
      if (!localStorage.getItem(LS_KEY)) {
        // Small delay so initial-load loading states settle before the modal pops.
        // Skip auto-open on narrow viewports — modal mocks crowd <=480px.
        if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 640px)').matches) {
          return;
        }
        const t = setTimeout(() => setOpen(true), 1200);
        return () => clearTimeout(t);
      }
    } catch {
      /* localStorage blocked — silently skip auto-open */
    }
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTour();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openTour() {
    setStep(0);
    setOpen(true);
  }

  function closeTour() {
    setOpen(false);
    try { localStorage.setItem(LS_KEY, '1'); } catch { /* noop */ }
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function prev() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function goToCta() {
    const cta = STEPS[step].cta;
    if (!cta) return;
    closeTour();
    navigate(cta.to);
  }

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Floating help launcher — always visible */}
      <button
        onClick={openTour}
        aria-label="Open product tour"
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="hidden sm:inline">Take the tour</span>
      </button>

      {/* Overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeTour(); }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden mx-4 sm:mx-0">
            {/* Progress dots */}
            <div className="flex items-center gap-1.5 px-6 pt-5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? 'w-8 bg-primary-600' : 'w-1.5 bg-slate-200 hover:bg-slate-300'
                  }`}
                />
              ))}
              <button
                onClick={closeTour}
                aria-label="Close tour"
                className="ml-auto text-slate-400 hover:text-slate-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 p-4 sm:p-6">
              <div className="sm:col-span-3">
                <div className="inline-flex items-center rounded-full bg-primary-50 text-primary-700 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider mb-3">
                  Capability {step + 1} of {STEPS.length}
                </div>
                <h2 id="tour-title" className="text-xl font-bold text-slate-900 leading-tight">
                  {s.title}
                </h2>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">{s.pitch}</p>
                {s.cta && (
                  <button
                    onClick={goToCta}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
                  >
                    {s.cta.label} →
                  </button>
                )}
              </div>
              <div className="sm:col-span-2 flex items-center">
                <div className="w-full">{s.preview()}</div>
              </div>
            </div>

            {/* Footer controls */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={prev}
                disabled={step === 0}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <Link
                to="/about"
                onClick={closeTour}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Read the full overview
              </Link>
              <button
                onClick={isLast ? closeTour : next}
                className="rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2"
              >
                {isLast ? 'Done' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
