import { useState } from 'react';

// Cortex Analyst panel — Allegheny County Tax Assessment edition.
// Special framing: this is the *Databricks* demo of the family. Adding
// Snowflake Cortex Analyst is the strongest possible ODI proof — the same
// Iceberg lake is queryable by Databricks SQL AND Snowflake Cortex, with
// no copy and no migration.

type Token = { text: string; color?: string };

function tokenizeSQL(sql: string): Token[] {
  const combined = new RegExp(
    [
      `(?<comment>--[^\\n]*)`,
      `(?<string>'[^']*')`,
      `(?<schema>\\b(?:gold|silver|bronze)\\.[a-z_]+)`,
      `(?<keyword>\\b(?:SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|INNER JOIN|JOIN|ON|AND|OR|NOT|AS|WITH|CASE|WHEN|THEN|ELSE|END|BY|ASC|DESC|DISTINCT|COUNT|SUM|AVG|MEDIAN|ROUND|COALESCE|CAST|FLOOR|IN|IS|NULL|TRUE|FALSE|PARTITION|OVER|BETWEEN|DATE_TRUNC|INTERVAL|PERCENTILE_CONT|WITHIN GROUP)\\b)`,
      `(?<number>\\b\\d+(?:\\.\\d+)?\\b)`,
    ].join('|'),
    'gi'
  );
  const tokens: Token[] = [];
  let lastIndex = 0;
  for (const m of sql.matchAll(combined)) {
    if (m.index === undefined) continue;
    if (m.index > lastIndex) tokens.push({ text: sql.slice(lastIndex, m.index) });
    const g = m.groups ?? {};
    if      (g.comment) tokens.push({ text: g.comment, color: '#64748b' });
    else if (g.string)  tokens.push({ text: g.string,  color: '#16a34a' });
    else if (g.schema)  tokens.push({ text: g.schema,  color: '#075985' });
    else if (g.keyword) tokens.push({ text: g.keyword, color: '#0284c7' });
    else if (g.number)  tokens.push({ text: g.number,  color: '#b45309' });
    else                tokens.push({ text: m[0] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < sql.length) tokens.push({ text: sql.slice(lastIndex) });
  return tokens;
}

function SQLBlock({ sql }: { sql: string }) {
  const tokens = tokenizeSQL(sql);
  return (
    <pre
      className="overflow-x-auto text-xs leading-relaxed"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        padding: '1rem 1.25rem',
        color: '#0f172a',
        whiteSpace: 'pre',
      }}
    >
      <code>
        {tokens.map((t, i) => t.color
          ? <span key={i} style={{ color: t.color }}>{t.text}</span>
          : <span key={i}>{t.text}</span>)}
      </code>
    </pre>
  );
}

type Q = { id: string; question: string; sql: string; narrative: string; data: { label: string; value: string }[] };

const QUESTIONS: Q[] = [
  {
    id: 'yoy-changes',
    question: 'Properties with the largest year-over-year assessed-value change.',
    sql: `SELECT
    parcel_id,
    address,
    municipality,
    prior_year_assessment,
    current_year_assessment,
    current_year_assessment - prior_year_assessment       AS yoy_dollar_change,
    ROUND(100.0 * (current_year_assessment - prior_year_assessment)
                / NULLIF(prior_year_assessment, 0), 1)      AS yoy_pct_change
FROM   gold.fct_parcel_assessments
WHERE  prior_year_assessment > 0
ORDER  BY yoy_dollar_change DESC
LIMIT  20;`,
    narrative: `12 parcels saw assessment increases over $500K — mostly downtown commercial properties where a single sale comp re-baselined the block. The same fct_parcel_assessments is read by /dashboard, by Databricks SQL Workbench, and now by Cortex — same Iceberg files, three engines.`,
    data: [
      { label: 'Parcels with >$500K increase',  value: '12' },
      { label: 'Median YoY change',              value: '+3.2%' },
      { label: 'Parcels with no change',         value: '78%' },
    ],
  },
  {
    id: 'class-by-neighborhood',
    question: 'Distribution of property class by neighborhood.',
    sql: `SELECT
    neighborhood,
    property_class,
    COUNT(*)                                AS parcel_count,
    SUM(current_year_assessment)            AS total_assessed_value,
    ROUND(100.0 * COUNT(*) /
          SUM(COUNT(*)) OVER (PARTITION BY neighborhood), 1) AS share_in_neighborhood
FROM   gold.fct_parcel_assessments
GROUP  BY 1, 2
ORDER  BY 1 ASC, parcel_count DESC;`,
    narrative: `Residential dominates in most neighborhoods (>85%), but six neighborhoods have unusually high commercial/industrial mix — clustered around the Strip District and downtown. The mix profile is the foundation of zoning decisions; Cortex surfaces it without exporting a CSV.`,
    data: [
      { label: 'Residential-dominant neighborhoods', value: '38' },
      { label: 'Mixed-use neighborhoods',            value: '6' },
      { label: 'Total neighborhoods',                value: '44' },
    ],
  },
  {
    id: 'appeals-reasons',
    question: 'Top reasons for properties currently under assessment appeal.',
    sql: `SELECT
    appeal_reason,
    COUNT(*)                                AS open_appeals,
    AVG(disputed_value_delta)               AS avg_disputed_delta,
    AVG(DATE_DIFF('day', appeal_filed_at, CURRENT_DATE))  AS avg_age_days
FROM   gold.fct_assessment_appeals
WHERE  status = 'open'
GROUP  BY 1
ORDER  BY open_appeals DESC;`,
    narrative: `"Comparable-sale evidence" leads at 437 open appeals, with an average disputed delta of $42K and average age of 67 days. The appeals backlog drives operational planning for the Board of Property Assessment Appeals — the same fct_assessment_appeals backs that workflow.`,
    data: [
      { label: 'Open appeals',         value: '1,212' },
      { label: 'Top reason',           value: 'Comparable sales' },
      { label: 'Median appeal age',    value: '54 days' },
    ],
  },
  {
    id: 'revenue-by-neighborhood',
    question: 'Projected tax revenue by neighborhood at current millage.',
    sql: `SELECT
    neighborhood,
    COUNT(*)                                  AS parcel_count,
    SUM(current_year_assessment)              AS aggregate_assessed_value,
    SUM(current_year_assessment) * 0.00473    AS projected_county_tax,
    SUM(current_year_assessment) * 0.01156    AS projected_school_tax
FROM   gold.fct_parcel_assessments
WHERE  current_year_assessment > 0
GROUP  BY 1
ORDER  BY projected_county_tax DESC
LIMIT  15;`,
    narrative: `Downtown contributes $34.2M in projected county tax, more than the next three neighborhoods combined. School-district millage at 11.56 mills is ~2.4× county millage — the share-of-burden conversation Cortex surfaces in one query.`,
    data: [
      { label: 'Top neighborhood revenue', value: '$34.2M (Downtown)' },
      { label: 'County millage',           value: '4.73 mills' },
      { label: 'School millage',           value: '11.56 mills' },
    ],
  },
  {
    id: 'owner-occupied-share',
    question: 'Owner-occupied vs investor-owned share by zip code.',
    sql: `SELECT
    zip_code,
    SUM(CASE WHEN homestead_exemption THEN 1 ELSE 0 END) AS owner_occupied,
    SUM(CASE WHEN NOT homestead_exemption THEN 1 ELSE 0 END) AS investor_or_other,
    ROUND(100.0 * SUM(CASE WHEN homestead_exemption THEN 1 ELSE 0 END)
                / COUNT(*), 1)              AS owner_occupied_pct
FROM   gold.fct_parcel_assessments
GROUP  BY 1
HAVING COUNT(*) >= 100
ORDER  BY owner_occupied_pct ASC
LIMIT  15;`,
    narrative: `Five zip codes have owner-occupied share below 40% — concentrated in transitional neighborhoods near university campuses. The shift over five years signals neighborhood-character change Cortex can quantify but doesn't get to opine on.`,
    data: [
      { label: 'Low-OO zip codes (<40%)', value: '5' },
      { label: 'Countywide OO rate',      value: '64.2%' },
      { label: 'Homestead exemptions',    value: '218,419' },
    ],
  },
  {
    id: 'median-trend',
    question: 'Median assessment value trend by year.',
    sql: `SELECT
    assessment_year,
    MEDIAN(assessed_value)                AS median_assessed,
    COUNT(*)                              AS parcel_count
FROM   gold.fct_parcel_assessment_history
WHERE  assessment_year >= 2018
GROUP  BY 1
ORDER  BY 1 ASC;`,
    narrative: `Median single-family-residential assessment has risen from $124K (2018) to $168K (2026) — a 35% increase over 8 years, compounding to ~3.8% annualized. The same gold table Databricks reads for /insights backs Cortex's answer here.`,
    data: [
      { label: 'Median (2018)',  value: '$124K' },
      { label: 'Median (2026)',  value: '$168K' },
      { label: 'CAGR',           value: '3.8%' },
    ],
  },
];

const KICKER = 'font-mono text-[10px] uppercase tracking-[0.3em]';

export default function CortexAnalystPanel() {
  const [activeId, setActiveId] = useState<string>(QUESTIONS[0].id);
  const active = QUESTIONS.find((q) => q.id === activeId) ?? QUESTIONS[0];

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className={`${KICKER}`} style={{ color: '#0284c7' }}>Snowflake · Cortex Analyst</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl text-slate-900">
            Ask the lake.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed italic md:text-right text-slate-600">
          Natural-language questions resolved to SQL against the dbt-modeled gold layer —
          the same Iceberg tables Databricks SQL and the rest of this dashboard read.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row bg-white border border-slate-200">
        <aside className="shrink-0 lg:w-72 xl:w-80 border-r border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200">
            <p className={`${KICKER} text-slate-500`}>Example questions</p>
          </div>
          <ul>
            {QUESTIONS.map((q) => {
              const isActive = q.id === activeId;
              return (
                <li key={q.id} className="border-b border-slate-100">
                  <button
                    onClick={() => setActiveId(q.id)}
                    className="w-full text-left px-4 py-4 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                    style={{
                      background: isActive ? '#e0f2fe' : 'transparent',
                      borderLeft: isActive ? '2px solid #0284c7' : '2px solid transparent',
                      color: isActive ? '#0c4a6e' : '#475569',
                    }}
                  >
                    <span className="text-sm leading-snug">{q.question}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 flex items-start gap-3 border-b border-slate-200 bg-slate-50">
            <span aria-hidden="true" className="shrink-0" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0284c7', marginTop: '6px' }} />
            <p className="text-base leading-snug text-slate-900">{active.question}</p>
          </div>

          <div className="px-5 pt-5 pb-0 border-b border-slate-200">
            <p className={`${KICKER} text-slate-500 mb-3`}>Generated SQL</p>
            <div className="pb-5"><SQLBlock sql={active.sql} /></div>
          </div>

          <div className="flex-1 px-5 py-5">
            <p className={`${KICKER} text-slate-500 mb-4`}>Cortex Analyst response</p>
            <div className="p-4 mb-4 bg-slate-50 border border-slate-200">
              <p className="text-sm leading-relaxed text-slate-900">{active.narrative}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.data.map(({ label, value }) => (
                <div key={label} className="p-3" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                  <p className={`${KICKER} text-slate-500 mb-1`}>{label}</p>
                  <p className="text-base leading-snug text-slate-900">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-3 flex items-center gap-3 border-t border-slate-200 bg-slate-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="Snowflake" style={{ opacity: 0.7 }}>
              <line x1="12" y1="2"    x2="12" y2="22"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="2"  y1="12"   x2="22" y2="12"    stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="4.93"  y1="4.93"  x2="19.07" y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
              <line x1="19.07" y1="4.93"  x2="4.93"  y2="19.07" stroke="#29b5e8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className={`${KICKER} text-slate-400`}>Powered by Snowflake Cortex Analyst — same lake as Databricks SQL</p>
          </div>
        </div>
      </div>
    </section>
  );
}
