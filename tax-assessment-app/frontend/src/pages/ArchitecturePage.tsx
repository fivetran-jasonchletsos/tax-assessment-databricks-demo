// Lakeview County — Open Data Infrastructure architecture page.
//
// Ported from Clarity Health's ArchitecturePage. Databricks is the
// primary engine (this demo lives on Databricks SQL + Delta/Iceberg);
// Snowflake, Athena, DuckDB, Trino stay listed as the same open-lake
// reads. County tax flavour: parcel records (SQL Server) + assessment
// history (Oracle) + USPS address stream + Census ACS annual pull.

import { useState, useEffect } from 'react';
import { AliveMedallion, type SourceNode, type EngineNode } from '../components/AliveMedallion';

const TAX_SOURCES: SourceNode[] = [
  { id: 'parcel', label: 'Parcel Records',      sub: 'SQL Server log-CDC',     logo: 'sqlserver', freshness: '52s lag',  status: 'healthy' },
  { id: 'assess', label: 'Assessment History',  sub: 'Oracle LogMiner',         logo: 'oracle',    freshness: '5 min lag', status: 'healthy' },
  { id: 'usps',   label: 'USPS Address Stream', sub: 'Daily NCOA updates',      logo: 'hl7',       freshness: 'live',      status: 'healthy', streaming: true },
  { id: 'census', label: 'Census ACS',          sub: 'Annual federal pull',     logo: 'cms',       freshness: '90d lag',  status: 'healthy' },
];

const TAX_ENGINES: EngineNode[] = [
  { name: 'Databricks', active: true,  logo: 'databricks' },
  { name: 'Snowflake',                 logo: 'snowflake' },
  { name: 'Athena',                    logo: 'athena' },
  { name: 'DuckDB',                    logo: 'duckdb' },
  { name: 'Trino',                     logo: 'trino' },
];

// ─── Types (local) ──────────────────────────────────────────────────────────

interface IcebergTable {
  database: 'bronze' | 'silver' | 'gold';
  table: string;
  source_system: string;
  rows: number;
  bytes: number;
  schema_columns: number;
  partitions: string[];
  last_updated_at: string;
}

interface QueryEngine {
  name: 'Databricks' | 'Snowflake' | 'Athena' | 'DuckDB' | 'Trino';
  status: 'active' | 'available' | 'demo';
  description: string;
  sample_query: string;
}

const TABLES: IcebergTable[] = [
  { database: 'bronze', table: 'bronze.cama__parcel',              source_system: 'sql_server · CAMA',         rows: 582_140,    bytes: 412_000_000,   schema_columns: 124, partitions: ['ingest_date'],     last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.cama__parcel_owner',        source_system: 'sql_server · CAMA',         rows: 612_840,    bytes: 184_000_000,   schema_columns: 38,  partitions: ['ingest_date'],     last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.cama__improvement',         source_system: 'sql_server · CAMA',         rows: 1_842_220,  bytes: 740_000_000,   schema_columns: 86,  partitions: ['ingest_date'],     last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.cama__sales_history',       source_system: 'sql_server · CAMA',         rows: 2_414_380,  bytes: 612_000_000,   schema_columns: 42,  partitions: ['ingest_date'],     last_updated_at: '2026-05-24T07:14:00Z' },
  { database: 'bronze', table: 'bronze.assess__history',           source_system: 'oracle · Assessment DB',    rows: 4_182_200,  bytes: 1_120_000_000, schema_columns: 64,  partitions: ['tax_year'],        last_updated_at: '2026-05-24T07:11:00Z' },
  { database: 'bronze', table: 'bronze.assess__appeals',           source_system: 'oracle · Assessment DB',    rows: 184_220,    bytes: 96_000_000,    schema_columns: 38,  partitions: ['filing_year'],     last_updated_at: '2026-05-24T07:11:00Z' },
  { database: 'bronze', table: 'bronze.assess__exemptions',        source_system: 'oracle · Assessment DB',    rows: 246_180,    bytes: 84_000_000,    schema_columns: 28,  partitions: ['tax_year'],        last_updated_at: '2026-05-24T07:11:00Z' },
  { database: 'bronze', table: 'bronze.usps__ncoa_updates',        source_system: 'http · USPS NCOA',          rows: 38_400,     bytes: 14_200_000,    schema_columns: 22,  partitions: ['ingest_date'],     last_updated_at: '2026-05-24T07:12:00Z' },
  { database: 'bronze', table: 'bronze.census__acs_tract',         source_system: 'http · Census ACS',         rows: 84_220,     bytes: 62_000_000,    schema_columns: 184, partitions: ['acs_year'],        last_updated_at: '2026-02-15T03:00:00Z' },

  { database: 'silver', table: 'silver.int_parcel_spine',          source_system: 'dbt · merged',              rows: 582_140,    bytes: 318_000_000,   schema_columns: 64,  partitions: [],                  last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_assessment_current',    source_system: 'dbt · merged',              rows: 582_140,    bytes: 264_000_000,   schema_columns: 42,  partitions: ['tax_year'],        last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_sales_comps',           source_system: 'dbt · merged',              rows: 2_414_380,  bytes: 540_000_000,   schema_columns: 38,  partitions: ['sale_year'],       last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_improvements_rolled',   source_system: 'dbt · merged',              rows: 1_842_220,  bytes: 620_000_000,   schema_columns: 31,  partitions: [],                  last_updated_at: '2026-05-24T07:18:00Z' },
  { database: 'silver', table: 'silver.int_owner_normalized',      source_system: 'dbt · merged',              rows: 612_840,    bytes: 142_000_000,   schema_columns: 24,  partitions: [],                  last_updated_at: '2026-05-24T07:18:00Z' },

  { database: 'gold',   table: 'gold.dim_parcels',                 source_system: 'dbt mart',                  rows: 582_140,    bytes: 224_000_000,   schema_columns: 48,  partitions: [],                  last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.dim_neighborhoods',           source_system: 'dbt mart',                  rows: 642,        bytes: 380_000,       schema_columns: 22,  partitions: [],                  last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.dim_owners',                  source_system: 'dbt mart',                  rows: 612_840,    bytes: 142_000_000,   schema_columns: 28,  partitions: [],                  last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_assessment_current',      source_system: 'dbt mart',                  rows: 582_140,    bytes: 184_000_000,   schema_columns: 38,  partitions: ['tax_year'],        last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_sales_comps',             source_system: 'dbt mart',                  rows: 612_220,    bytes: 240_000_000,   schema_columns: 36,  partitions: ['sale_year'],       last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_appeals',                 source_system: 'dbt mart',                  rows: 184_220,    bytes: 84_000_000,    schema_columns: 32,  partitions: ['filing_year'],     last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_tax_revenue',             source_system: 'dbt mart',                  rows: 582_140,    bytes: 142_000_000,   schema_columns: 24,  partitions: ['tax_year'],        last_updated_at: '2026-05-24T07:22:00Z' },
  { database: 'gold',   table: 'gold.fct_exemption_summary',       source_system: 'dbt mart',                  rows: 246_180,    bytes: 62_000_000,    schema_columns: 18,  partitions: ['tax_year'],        last_updated_at: '2026-05-24T07:22:00Z' },
];

const ENGINES: QueryEngine[] = [
  {
    name: 'Databricks',
    status: 'active',
    description: 'Primary engine for the Lakeview gold layer. Databricks SQL warehouses read Iceberg/Delta tables through Unity Catalog; auto-stop between queries. Where the public portal, the assessor workbench, and the appeals dashboard all land.',
    sample_query: `SELECT
  p.parcel_id, p.address, p.neighborhood,
  a.assessed_value, a.tax_year,
  s.last_sale_price, s.last_sale_date
FROM gold.dim_parcels             p
JOIN gold.fct_assessment_current  a USING (parcel_id)
LEFT JOIN gold.fct_sales_comps    s USING (parcel_id)
WHERE p.neighborhood = 'Highland Park'
  AND a.tax_year = 2026
ORDER BY a.assessed_value DESC
LIMIT 50;`,
  },
  {
    name: 'Snowflake',
    status: 'available',
    description: 'Snowflake Cortex attaches to the same Iceberg gold tables via Snowflake Open Catalog. Useful for ad-hoc analyst workloads and any team already in Snowflake — no copy, no extract.',
    sample_query: `SELECT neighborhood, COUNT(*) AS parcels,
       AVG(assessed_value) AS avg_value,
       SUM(tax_due) AS revenue
FROM gold.fct_tax_revenue
WHERE tax_year = 2026
GROUP BY neighborhood
ORDER BY revenue DESC;`,
  },
  {
    name: 'Athena',
    status: 'available',
    description: 'Serverless reads against the same Iceberg gold tables via Glue. Useful for public-records FOIA queries and ad-hoc audits that don\'t need to spin up a warehouse.',
    sample_query: `SELECT tax_year, COUNT(*) AS appeals,
       AVG(reduction_pct) AS avg_reduction
FROM gold.fct_appeals
WHERE filing_year >= 2024
GROUP BY tax_year
ORDER BY tax_year;`,
  },
  {
    name: 'DuckDB',
    status: 'available',
    description: 'Auditor\'s laptop. Same Iceberg tables, queried directly from S3 with the iceberg extension. Tiny ad-hoc joins without spinning up anything.',
    sample_query: `INSTALL iceberg;
LOAD iceberg;

SELECT *
FROM iceberg_scan('s3://lakeview-odi-lake/gold/fct_exemption_summary/')
WHERE exemption_type IN ('HOMESTEAD','SENIOR')
LIMIT 100;`,
  },
  {
    name: 'Trino',
    status: 'available',
    description: 'Federated engine that joins the lake to other county systems (treasurer\'s collection ledger, building permits) without copying data first.',
    sample_query: `SELECT p.neighborhood,
       SUM(t.payment_amount) AS collected,
       SUM(a.tax_due) AS billed
FROM iceberg.gold.dim_parcels         p
JOIN iceberg.gold.fct_tax_revenue     a USING (parcel_id)
JOIN postgres.treasurer.payments      t ON t.parcel_id = p.parcel_id
WHERE a.tax_year = 2026
GROUP BY p.neighborhood;`,
  },
];

const ENGINE_COLORS: Record<QueryEngine['name'], string> = {
  Databricks: '#ff3621',
  Snowflake:  '#29b5e8',
  Athena:     '#f59e0b',
  DuckDB:     '#111c38',
  Trino:      '#1d4e89',
};

// ─── Number formatters ──────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(b: number): string {
  if (b >= 1_000_000_000) return `${(b / 1_000_000_000).toFixed(2)} GB`;
  if (b >= 1_000_000)     return `${(b / 1_000_000).toFixed(1)} MB`;
  if (b >= 1_000)         return `${(b / 1_000).toFixed(1)} KB`;
  return `${b} B`;
}

// =============================================================================
// Page
// =============================================================================

export default function ArchitecturePage() {
  const [activeEngine, setActiveEngine] = useState<QueryEngine>(ENGINES[0]);

  const byLayer = (l: 'bronze' | 'silver' | 'gold') => TABLES.filter((t) => t.database === l);
  const layerStats = (l: 'bronze' | 'silver' | 'gold') => {
    const t = byLayer(l);
    return { tables: t.length, rows: t.reduce((s, r) => s + r.rows, 0), bytes: t.reduce((s, r) => s + r.bytes, 0) };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-gray-200 pb-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 mb-1">Open Data Infrastructure</div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-ink-900">
          One lake. Every engine. 580,000 parcels.
        </h1>
        <p className="mt-3 text-slate-600 max-w-3xl leading-relaxed">
          Lakeview County treats <em>storage</em>, <em>catalog</em>, and <em>compute</em> as three
          independently swappable layers. Iceberg is the storage spec. Glue is the catalog.
          Databricks, Snowflake, Athena, DuckDB, and Trino can all read the same tables &mdash; no copy,
          no extract, no proprietary format between the CAMA system and the public portal.
        </p>
      </header>

      <ThroughputHero />

      <section className="bg-white border border-gray-200 rounded-sm p-6 sm:p-8 mb-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 mb-1">Data Flow</div>
        <h2 className="font-serif text-2xl font-semibold text-ink-900 mb-6">
          From CAMA + four open sources to one governed gold layer
        </h2>

        <AliveMedallion
          sources={TAX_SOURCES}
          bronze={{ ...layerStats('bronze'), trend: [180, 195, 210, 222, 240, 255, 270] }}
          silver={{ ...layerStats('silver'), trend: [120, 130, 142, 155, 168, 180, 192] }}
          gold={{   ...layerStats('gold'),   trend: [80, 88, 95, 104, 112, 124, 138] }}
          engines={TAX_ENGINES}
          accent="#f59e0b"
          enginesCaption="Five engines read the same data — Databricks SQL primary, Snowflake Cortex attaches; no copies."
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
          <LayerDetail layer="bronze" stats={layerStats('bronze')} desc="Raw rows landed by Fivetran. 1:1 with source. CDC kept current within five minutes." />
          <LayerDetail layer="silver" stats={layerStats('silver')} desc="Conformed dims and facts. Parcels joined to owners, sales, improvements, and current assessment." />
          <LayerDetail layer="gold"   stats={layerStats('gold')}   desc="Business-ready marts. What every assessor surface, appeals workbench, and the public portal reads." />
        </div>
      </section>

      <SchemaEvolutionTicker />

      <CostPanel />

      <FailureRecoveryPanel />

      <DataContractsPanel />

      <LineagePanel />

      {/* ── Multi-engine showcase ────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-sm overflow-hidden mb-8">
        <header className="px-5 py-5 border-b border-gray-200">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Compute is a choice</div>
          <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
            Same Iceberg tables. Five engines. One query at a time.
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Pick a query engine &mdash; the SQL barely changes, but the operational, cost, and
            governance profile shifts dramatically. That choice belongs to the county, not the vendor.
          </p>
        </header>

        <div className="px-5 pt-4 flex flex-wrap gap-2">
          {ENGINES.map((e) => (
            <button
              key={e.name}
              onClick={() => setActiveEngine(e)}
              className="px-3 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider border transition-all"
              style={
                activeEngine.name === e.name
                  ? { background: ENGINE_COLORS[e.name], borderColor: ENGINE_COLORS[e.name], color: '#ffffff' }
                  : { background: '#ffffff', color: '#475569', borderColor: '#d4c9b0' }
              }
            >
              {e.name}
              {e.status === 'active' && <span className="ml-1.5 text-[9px] opacity-80">● ACTIVE</span>}
            </button>
          ))}
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Query</div>
            <pre className="rounded-sm p-4 text-[11.5px] leading-relaxed overflow-x-auto font-mono" style={{ background: '#111c38', color: '#fefaf3' }}>
              <code>{activeEngine.sample_query}</code>
            </pre>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Why this engine</div>
            <p className="text-sm text-slate-800 leading-relaxed">{activeEngine.description}</p>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Status</div>
              <div className="text-sm font-semibold" style={{ color: activeEngine.status === 'active' ? '#16a34a' : '#6b7280' }}>
                {activeEngine.status === 'active' ? '● Primary engine — powers this site' : 'Compatible and ready to wire in'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Iceberg catalog ──────────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-sm overflow-hidden mb-8">
        <header className="px-5 py-5 border-b border-gray-200">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Iceberg Catalog</div>
          <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
            Every table on the lake, registered in AWS Glue
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Open metadata. Every engine reads the same schema, the same partition layout, the same
            row counts &mdash; without anyone owning the "source of truth" exclusively.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <Th>Layer</Th>
                <Th>Table</Th>
                <Th>Source</Th>
                <Th align="right">Rows</Th>
                <Th align="right">Size</Th>
                <Th align="right">Columns</Th>
                <Th>Partitions</Th>
                <Th align="right">Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TABLES.map((t) => (
                <tr key={`${t.database}.${t.table}`} className="hover:bg-gray-50 cursor-default">
                  <td className="px-4 py-2.5"><LayerChip layer={t.database} /></td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-ink-900">{t.table}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{t.source_system}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-ink-900">{formatNumber(t.rows)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800">{formatBytes(t.bytes)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{t.schema_columns}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">
                    {t.partitions.length ? t.partitions.join(', ') : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-slate-600 font-mono">
                    {new Date(t.last_updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Data Quality — dbt Labs ──────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-sm overflow-hidden mb-8">
        <header className="px-5 py-5 border-b border-gray-200 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#FF694A' }}>Data Quality · dbt Labs</div>
            <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
              Every table tested. Every run. Same lake.
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Tests defined in dbt Labs run on every build against the same Iceberg tables every engine reads.
              Failures block promotion to the next layer &mdash; bad data never reaches the public portal.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          {[
            { layer: 'bronze' as const, tests: 24, passing: 24, monitors: ['freshness', 'volume', 'schema drift'],                                  color: '#b45309' },
            { layer: 'silver' as const, tests: 62, passing: 61, monitors: ['nulls', 'uniqueness', 'referential', 'accepted values'],                color: '#6b7280' },
            { layer: 'gold'   as const, tests: 44, passing: 44, monitors: ['parcel uniqueness', 'tax-year consistency', 'exemption reconciliation'], color: '#f59e0b' },
          ].map((q) => {
            const ok = q.passing === q.tests;
            return (
              <div key={q.layer} className="p-5">
                <div className="flex items-center justify-between">
                  <LayerChip layer={q.layer} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ok ? '#16a34a' : '#dc2626' }}>
                    {ok ? '● all passing' : `● ${q.tests - q.passing} warn`}
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <div className="font-serif text-3xl font-semibold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {q.passing}<span className="text-slate-400">/{q.tests}</span>
                  </div>
                  <div className="text-xs text-slate-600">tests · last run 12m ago</div>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                  {q.monitors.map((m) => (
                    <li key={m} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: q.color }} />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-slate-500 bg-gray-50">
          <span className="font-mono">130 tests · 129 passing · 1 warn · 0 errors</span>
          <span className="uppercase tracking-wider font-semibold">dbt build · scheduled by Fivetran</span>
        </div>
      </section>

      <BeforeAfterPanel />
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function LayerChip({ layer }: { layer: 'bronze' | 'silver' | 'gold' }) {
  const styles: Record<typeof layer, { bg: string; fg: string; border: string }> = {
    bronze: { bg: '#fef3c7', fg: '#92400e', border: '#b45309' },
    silver: { bg: '#f3f4f6', fg: '#374151', border: '#6b7280' },
    gold:   { bg: '#faf3e1', fg: '#7a5e2d', border: '#f59e0b' },
  };
  const s = styles[layer];
  return (
    <span className="inline-block text-[9px] font-bold uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm border"
          style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
      {layer}
    </span>
  );
}

function LayerDetail({ layer, stats, desc }: { layer: 'bronze' | 'silver' | 'gold'; stats: { tables: number; rows: number; bytes: number }; desc: string }) {
  return (
    <div className="border border-gray-200 rounded-sm p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <LayerChip layer={layer} />
        <span className="text-[10px] text-slate-500 font-mono">{stats.tables} table{stats.tables === 1 ? '' : 's'}</span>
      </div>
      <div className="text-sm font-bold text-ink-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatNumber(stats.rows)} rows · {formatBytes(stats.bytes)}
      </div>
      <div className="text-[11px] text-slate-600 mt-1 leading-snug">{desc}</div>
    </div>
  );
}

// =============================================================================
// ThroughputHero
// =============================================================================
function ThroughputHero() {
  const [rowsToday, setRowsToday] = useState(2_412_017);
  useEffect(() => {
    const id = setInterval(() => setRowsToday((n) => n + 6 + Math.floor(Math.random() * 9)), 600);
    return () => clearInterval(id);
  }, []);
  const trend = [1.8, 2.0, 2.2, 2.1, 2.3, 2.35, 2.41];
  return (
    <section className="mb-8 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 sm:gap-4">
      <div className="bg-white border border-gray-200 rounded-sm p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(200,144,42,0.14), transparent 60%)' }} />
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#16a34a' }}>● Live</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
            Rows in motion today
          </div>
          <div className="mt-2 font-serif font-semibold leading-none text-ink-900"
               style={{ fontSize: 44, fontVariantNumeric: 'tabular-nums' }}>
            {rowsToday.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-slate-600">across 4 sources · 22 Iceberg tables · CDC + streaming</div>
        </div>
      </div>
      <Kpi label="CDC freshness · p50" value="52s" sub="SQL Server source" />
      <Kpi label="Bronze → Gold lag · p99" value="6 min" sub="Within 10-min SLO" />
      <Kpi label="Connector uptime · 90d" value="99.97%" sub={<Sparklike values={trend} />} />
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-sm p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-1.5 font-serif font-semibold leading-none text-ink-900"
           style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="mt-2 text-xs text-slate-600">{sub}</div>
    </div>
  );
}

function Sparklike({ values }: { values: number[] }) {
  const max = Math.max(...values), min = Math.min(...values);
  const rng = max - min || 1;
  const w = 80, h = 18;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / rng) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// =============================================================================
// SchemaEvolutionTicker
// =============================================================================
const EVO_EVENTS = [
  { ts: '2026-05-24 06:14', op: 'ADD COLUMN solar_panel_kw',          table: 'bronze.cama__improvement',   ms: 38, models: 4 },
  { ts: '2026-05-23 22:01', op: 'RENAME COLUMN own_name → owner_name', table: 'bronze.cama__parcel_owner', ms: 22, models: 6 },
  { ts: '2026-05-22 14:47', op: 'WIDEN INT → BIGINT assessed_value',   table: 'silver.int_assessment_current', ms: 41, models: 3 },
  { ts: '2026-05-21 09:30', op: 'ADD COLUMN appeal_outcome_class',     table: 'gold.fct_appeals',          ms: 19, models: 5 },
  { ts: '2026-05-20 18:09', op: 'DROP COLUMN legacy_exempt_flag',      table: 'bronze.assess__exemptions', ms: 28, models: 2 },
];
function SchemaEvolutionTicker() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((n) => (n + 1) % EVO_EVENTS.length), 4200);
    return () => clearInterval(id);
  }, []);
  const e = EVO_EVENTS[idx];
  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-sm p-5 overflow-hidden relative" style={{ background: 'linear-gradient(90deg, #fff 0%, #f8fafc 100%)' }}>
      <div className="absolute top-0 right-0 bottom-0 w-1.5" style={{ background: 'linear-gradient(180deg, #5fb3a1, #1d4e89)' }} />
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#1d4e89' }}>Iceberg · Schema evolution</div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm" style={{ color: '#0d9488', background: '#ecfeff', border: '1px solid #99f6e4' }}>
            ● Live feed
          </span>
        </div>
        <div className="font-mono text-[10px] text-slate-500">last 5 schema changes</div>
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span className="font-mono text-[11px] text-slate-500">{e.ts}</span>
        <span className="font-mono text-[13px] font-semibold text-ink-900">{e.op}</span>
        <span className="font-mono text-[12px] text-slate-600">on {e.table}</span>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[12px] text-slate-600 flex-wrap">
        <span><strong className="text-ink-900">{e.ms} ms</strong> · metadata-only operation</span>
        <span>•</span>
        <span>0 data rewritten · 0 downtime</span>
        <span>•</span>
        <span><strong className="text-ink-900">{e.models}</strong> downstream dbt models auto-revalidated</span>
      </div>
      <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        Apache Iceberg treats schema changes as table metadata, not file rewrites. The legacy MDS equivalent —
        an Oracle <code className="font-mono">ALTER TABLE ADD COLUMN</code> on a 582K-parcel CAMA table — locks the
        table for ~6 minutes during the rewrite. Same change in Iceberg: <strong>milliseconds, no lock</strong>.
      </div>
    </section>
  );
}

// =============================================================================
// CostPanel
// =============================================================================
function CostPanel() {
  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-sm overflow-hidden">
      <header className="px-5 py-5 border-b border-gray-200">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#16a34a' }}>FinOps</div>
            <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
              What this costs the county to run, every day
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              Storage and compute billed separately. Storage is essentially free at this scale; compute scales
              with workload because Databricks SQL warehouses auto-stop when no one is reading.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#16a34a' }}>
            −71% vs legacy
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <CostTile label="Storage · per day"   value="$0.62"  sub="1.8 TB across bronze/silver/gold · S3 Standard-IA"   color="#16a34a" />
        <CostTile label="Compute · per day"   value="$3.84"  sub="Databricks SQL serverless · dbt build · Athena ad-hoc" color="#ff3621" />
        <CostTile label="Per-1k rows landed"  value="$0.0009" sub="All-in CDC + transform + serve"                     color="#1d4e89" />
        <CostTile label="Equivalent MDS"      value="$15.40"  sub="Internal benchmark · same data, warehouse-resident" color="#dc2626" />
      </div>
      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-slate-500 bg-gray-50">
        <span>Compute curve: 68% of spend is the 8 AM–10 AM assessor window. Idle hours bill at zero.</span>
        <span className="uppercase tracking-wider font-semibold">Cost-attribution: per-warehouse + per-dbt-model</span>
      </div>
    </section>
  );
}

function CostTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-2 font-serif font-semibold leading-none" style={{ fontSize: 30, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div className="mt-2 text-xs text-slate-600 leading-snug">{sub}</div>
    </div>
  );
}

// =============================================================================
// FailureRecoveryPanel
// =============================================================================
function FailureRecoveryPanel() {
  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-sm overflow-hidden">
      <header className="px-5 py-5 border-b border-gray-200">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#b45309' }}>Resilience · Recovery</div>
        <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
          What happens when a connector fails
        </h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Every Fivetran connector has automatic retry with exponential backoff; failed rows land in a
          dead-letter queue for replay; dbt builds gate gold on green silver. Below: the last 30 days.
        </p>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-y-0 md:divide-x divide-gray-100">
        <RecoveryTile label="Retry policy"          big="exp 5×"  sub="2s · 8s · 30s · 2m · 8m, then DLQ" />
        <RecoveryTile label="Dead-letter · current" big="9"        sub="rows held · 6 NCOA, 3 ACS dupe-key" color="#b45309" />
        <RecoveryTile label="MTTR · last 30d"       big="4 min"    sub="median · max 18 min during USPS cert rotation" />
        <RecoveryTile label="Last incident"         big="6 d ago"  sub="Replayed automatically in 2 min, zero data loss" color="#16a34a" />
      </div>
    </section>
  );
}

function RecoveryTile({ label, big, sub, color = '#111c38' }: { label: string; big: string; sub: string; color?: string }) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold">{label}</div>
      <div className="mt-1.5 font-serif font-semibold leading-none" style={{ fontSize: 26, color, fontVariantNumeric: 'tabular-nums' }}>
        {big}
      </div>
      <div className="mt-2 text-xs text-slate-600 leading-snug">{sub}</div>
    </div>
  );
}

// =============================================================================
// DataContractsPanel — county-specific (SOC 2 / CJIS, taxpayer PII)
// =============================================================================
function DataContractsPanel() {
  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-sm overflow-hidden">
      <header className="px-5 py-5 border-b border-gray-200 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#5b21b6' }}>Data Contracts · Civic Governance</div>
          <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
            Taxpayer PII never leaves the lake without a policy
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Every column with taxpayer PII is tagged at ingest. Row-level access scopes by
            district. Column masking on SSN, DOB, owner phone. Every read goes to an audit log.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#5b21b6' }}>
          SOC 2 · CJIS
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-3">Policy coverage</div>
          <ul className="space-y-2 text-sm">
            <Policy label="PII columns tagged"        value="24 columns across 8 tables" />
            <Policy label="Row-level access policy"   value="assessment_district scoped per role" />
            <Policy label="Column masking on read"    value="ssn · dob · owner_phone · owner_email" />
            <Policy label="Audit log destination"     value="CloudTrail → S3 (90d) → Iceberg audit table" />
            <Policy label="Public-portal de-id path"  value="gold.public_parcels publishes only non-PII fields" />
          </ul>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 font-semibold mb-3">Sample contract · gold.dim_owners</div>
          <pre className="font-mono text-[11.5px] leading-relaxed overflow-x-auto rounded-sm p-3" style={{ background: '#111c38', color: '#e6e9f0' }}><code>{`columns:
  - name: owner_id
    tests: [unique, not_null]
    meta: { contains_pii: true, mask_policy: "tokenise" }
  - name: ssn_last4
    tests: [not_null]
    meta: { contains_pii: true, mask_policy: "redact_full" }
  - name: owner_phone
    meta: { contains_pii: true, mask_policy: "redact_full" }
  - name: assessment_district
    tests: [relationships: dim_neighborhoods]
    meta: { rls_partition_key: true }`}</code></pre>
        </div>
      </div>
    </section>
  );
}

function Policy({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#5b21b6' }} />
      <div className="flex-1">
        <span className="text-ink-900 font-semibold">{label}</span>
        <span className="text-slate-600"> · {value}</span>
      </div>
    </li>
  );
}

// =============================================================================
// BeforeAfterPanel
// =============================================================================
function BeforeAfterPanel() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="bg-white border border-gray-200 rounded-sm p-6 border-l-4" style={{ borderLeftColor: '#dc2626' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#dc2626' }}>Before · Modern Data Stack</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-ink-900">14 hops · 3 copies of the bytes</h3>
        <pre className="font-mono text-[10.5px] leading-relaxed mt-4 p-3 rounded-sm overflow-x-auto" style={{ background: '#fef2f2', color: '#7f1d1d', border: '1px solid #fecaca' }}>{`CAMA → SFTP → Stitch → Warehouse (raw)
     → dbt → Warehouse (silver) → Warehouse (gold)
     → Census reverse-ETL → Hightouch → 3rd-party portal
     → Tableau materialised view → BI extract → assessor laptop`}</pre>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-slate-500 text-xs">Copies of the data</div><div className="font-serif text-2xl font-semibold text-ink-900">3</div></div>
          <div><div className="text-slate-500 text-xs">Avg end-to-end latency</div><div className="font-serif text-2xl font-semibold text-ink-900">14 hr</div></div>
          <div><div className="text-slate-500 text-xs">Daily run-rate</div><div className="font-serif text-2xl font-semibold text-ink-900">$15.40</div></div>
          <div><div className="text-slate-500 text-xs">Schema change</div><div className="font-serif text-lg font-semibold text-ink-900">6-min lock</div></div>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-sm p-6 border-l-4" style={{ borderLeftColor: '#16a34a' }}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#16a34a' }}>After · Open Data Infrastructure</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-ink-900">5 hops · 1 copy of the bytes</h3>
        <pre className="font-mono text-[10.5px] leading-relaxed mt-4 p-3 rounded-sm overflow-x-auto" style={{ background: '#ecfdf5', color: '#064e3b', border: '1px solid #a7f3d0' }}>{`Source → Fivetran CDC → Iceberg bronze
     → dbt → Iceberg silver
     → dbt → Iceberg gold
     ↳ Databricks · Snowflake · Athena · DuckDB · Trino
       (all reading the same bytes, no copies)`}</pre>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><div className="text-slate-500 text-xs">Copies of the data</div><div className="font-serif text-2xl font-semibold" style={{ color: '#16a34a' }}>1</div></div>
          <div><div className="text-slate-500 text-xs">Avg end-to-end latency</div><div className="font-serif text-2xl font-semibold" style={{ color: '#16a34a' }}>6 min</div></div>
          <div><div className="text-slate-500 text-xs">Daily run-rate</div><div className="font-serif text-2xl font-semibold" style={{ color: '#16a34a' }}>$4.46</div></div>
          <div><div className="text-slate-500 text-xs">Schema change</div><div className="font-serif text-lg font-semibold" style={{ color: '#16a34a' }}>milliseconds</div></div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// LineagePanel
// =============================================================================
type LineageEdge = { from: string; to: string; tests?: string[] };

const LINEAGE_MAP: Record<string, { silver: string[]; bronze: string[]; edges: LineageEdge[]; story: string }> = {
  'gold.fct_assessment_current': {
    silver: ['silver.int_parcel_spine', 'silver.int_assessment_current'],
    bronze: ['bronze.cama__parcel', 'bronze.assess__history'],
    story:  'Current-year assessed value joined to parcel master. Used by the assessor workbench and public portal.',
    edges: [
      { from: 'bronze.cama__parcel',      to: 'silver.int_parcel_spine',       tests: ['unique parcel_id'] },
      { from: 'bronze.assess__history',   to: 'silver.int_assessment_current', tests: ['tax_year filter'] },
      { from: 'silver.int_parcel_spine',  to: 'gold.fct_assessment_current' },
      { from: 'silver.int_assessment_current', to: 'gold.fct_assessment_current' },
    ],
  },
  'gold.fct_sales_comps': {
    silver: ['silver.int_parcel_spine', 'silver.int_sales_comps'],
    bronze: ['bronze.cama__parcel', 'bronze.cama__sales_history'],
    story:  'Sales comps drive the appeals review process and the neighborhood-percentile widget.',
    edges: [
      { from: 'bronze.cama__parcel',         to: 'silver.int_parcel_spine' },
      { from: 'bronze.cama__sales_history',  to: 'silver.int_sales_comps', tests: ['arm\'s-length filter'] },
      { from: 'silver.int_parcel_spine',     to: 'gold.fct_sales_comps' },
      { from: 'silver.int_sales_comps',      to: 'gold.fct_sales_comps' },
    ],
  },
  'gold.fct_appeals': {
    silver: ['silver.int_assessment_current', 'silver.int_sales_comps'],
    bronze: ['bronze.assess__appeals', 'bronze.assess__history'],
    story:  'Appeals workbench: filings joined to current assessment and the comp set. Drives the hearing calendar.',
    edges: [
      { from: 'bronze.assess__appeals',         to: 'silver.int_assessment_current' },
      { from: 'bronze.assess__history',         to: 'silver.int_assessment_current' },
      { from: 'silver.int_assessment_current',  to: 'gold.fct_appeals' },
      { from: 'silver.int_sales_comps',         to: 'gold.fct_appeals' },
    ],
  },
  'gold.dim_parcels': {
    silver: ['silver.int_parcel_spine', 'silver.int_owner_normalized'],
    bronze: ['bronze.cama__parcel', 'bronze.cama__parcel_owner'],
    story:  'Master parcel dimension. PII-tagged owner fields are masked on read by role.',
    edges: [
      { from: 'bronze.cama__parcel',          to: 'silver.int_parcel_spine' },
      { from: 'bronze.cama__parcel_owner',    to: 'silver.int_owner_normalized' },
      { from: 'silver.int_parcel_spine',      to: 'gold.dim_parcels' },
      { from: 'silver.int_owner_normalized',  to: 'gold.dim_parcels' },
    ],
  },
};

function LineagePanel() {
  const goldOptions = Object.keys(LINEAGE_MAP);
  const [selected, setSelected] = useState<string>(goldOptions[0]);
  const lin = LINEAGE_MAP[selected];

  const BX = 20, MX = 320, RX = 620;
  const COL_W = 280;
  const ROW_H = 38, ROW_GAP = 8;
  const maxRows = Math.max(lin.bronze.length, lin.silver.length, 1);
  const HEIGHT = Math.max(maxRows * (ROW_H + ROW_GAP) + 40, 240);

  const bronzeY = (i: number) => 30 + i * (ROW_H + ROW_GAP);
  const silverY = (i: number) => 30 + i * (ROW_H + ROW_GAP);
  const goldY = (HEIGHT - ROW_H) / 2;

  const nodeOf = (name: string): { x: number; y: number; w: number; h: number } | null => {
    const bi = lin.bronze.indexOf(name);
    if (bi >= 0) return { x: BX, y: bronzeY(bi), w: COL_W, h: ROW_H };
    const si = lin.silver.indexOf(name);
    if (si >= 0) return { x: MX, y: silverY(si), w: COL_W, h: ROW_H };
    if (name === selected) return { x: RX, y: goldY, w: COL_W, h: ROW_H };
    return null;
  };

  return (
    <section className="mb-8 bg-white border border-gray-200 rounded-sm overflow-hidden">
      <header className="px-5 py-5 border-b border-gray-200">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#FF694A' }}>dbt · Column-level lineage</div>
            <h2 className="font-serif text-xl font-semibold text-ink-900 mt-0.5">
              Pick any gold model. See exactly where its bytes come from.
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl">
              dbt emits lineage as a side-effect of build. Every join, every transformation, every test
              is documented automatically. Click a gold model below to trace upstream &mdash; bronze
              landings to silver intermediates to the gold mart.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shrink-0" style={{ background: '#FF694A' }}>
            dbt Labs
          </div>
        </div>
      </header>

      <div className="px-5 pt-4 flex flex-wrap gap-2">
        {goldOptions.map((g) => (
          <button
            key={g}
            onClick={() => setSelected(g)}
            className="px-3 py-2 rounded-sm text-[11.5px] font-mono border transition-all"
            style={
              selected === g
                ? { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }
                : { background: '#fff', borderColor: '#d4c9b0', color: '#475569' }
            }
          >
            {g}
          </button>
        ))}
      </div>

      <div className="p-5">
        <p className="text-sm text-slate-800 mb-4 italic">{lin.story}</p>

        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${RX + COL_W + 20} ${HEIGHT}`} className="w-full" style={{ minWidth: 880, maxHeight: 360 }}>
            <defs>
              <marker id="lin-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill="#FF694A" />
              </marker>
            </defs>

            <text x={BX} y={18} fontSize="10" fontWeight="700" fill="#826b3f" letterSpacing="1.6">BRONZE · raw</text>
            <text x={MX} y={18} fontSize="10" fontWeight="700" fill="#374151" letterSpacing="1.6">SILVER · conformed</text>
            <text x={RX} y={18} fontSize="10" fontWeight="700" fill="#7a5e2d" letterSpacing="1.6">GOLD · selected</text>

            {lin.edges.map((e, i) => {
              const a = nodeOf(e.from);
              const b = nodeOf(e.to);
              if (!a || !b) return null;
              const x1 = a.x + a.w, y1 = a.y + a.h / 2;
              const x2 = b.x,       y2 = b.y + b.h / 2;
              const mid = (x1 + x2) / 2;
              const d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#FF694A" strokeWidth="1.6" strokeLinecap="round" markerEnd="url(#lin-arrow)" opacity="0.75" />
                  <circle r="2.5" fill="#FF694A">
                    <animateMotion dur={`${2.0 + i * 0.18}s`} repeatCount="indefinite" path={d} />
                    <animate attributeName="opacity" values="0;1;1;0" dur={`${2.0 + i * 0.18}s`} repeatCount="indefinite" />
                  </circle>
                  {e.tests && (
                    <g transform={`translate(${mid - 38}, ${(y1 + y2) / 2 - 8})`}>
                      <rect width="76" height="14" rx="3" fill="#FF694A" />
                      <text x="38" y="10" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" letterSpacing="0.4">
                        {e.tests[0]}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {lin.bronze.map((t, i) => (
              <g key={t} transform={`translate(${BX}, ${bronzeY(i)})`}>
                <rect width={COL_W} height={ROW_H} rx="4" fill="#fef3c7" stroke="#b45309" strokeWidth="1" />
                <text x="12" y="14" fontSize="9" fontWeight="800" fill="#826b3f" letterSpacing="1.4">BRONZE</text>
                <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{t}</text>
              </g>
            ))}

            {lin.silver.map((t, i) => (
              <g key={t} transform={`translate(${MX}, ${silverY(i)})`}>
                <rect width={COL_W} height={ROW_H} rx="4" fill="#f3f4f6" stroke="#6b7280" strokeWidth="1" />
                <text x="12" y="14" fontSize="9" fontWeight="800" fill="#374151" letterSpacing="1.4">SILVER</text>
                <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{t}</text>
              </g>
            ))}

            <g transform={`translate(${RX}, ${goldY})`}>
              <rect width={COL_W} height={ROW_H} rx="4" fill="#faf3e1" stroke="#f59e0b" strokeWidth="2" />
              <text x="12" y="14" fontSize="9" fontWeight="800" fill="#7a5e2d" letterSpacing="1.4">GOLD</text>
              <text x="12" y="28" fontSize="11" fontWeight="700" fill="#0b1220" fontFamily="ui-monospace, monospace">{selected}</text>
            </g>
          </svg>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ background: '#FF694A' }} /> dbt transformation (auto-emitted)</span>
          <span>•</span>
          <span><strong className="text-ink-900">{lin.edges.length}</strong> column-level edges traced</span>
          <span>•</span>
          <span><strong className="text-ink-900">{lin.bronze.length + lin.silver.length + 1}</strong> dbt models in the lineage graph</span>
          <span>•</span>
          <span>Lineage runs at every build · zero manual upkeep</span>
        </div>
      </div>
    </section>
  );
}
