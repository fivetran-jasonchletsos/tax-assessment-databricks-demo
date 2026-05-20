import CortexAnalystPanel from '../components/CortexAnalystPanel';

export default function AskPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="mx-auto max-w-6xl mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-sky-700">
          Ask the data — Cortex Analyst
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-slate-900">
          One open lake. Databricks SQL <span className="text-sky-600">and</span> Snowflake Cortex.
        </h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-slate-600">
          This demo's primary engine is Databricks SQL, but the lake itself is open
          Iceberg in S3 — so Snowflake Cortex Analyst can attach to the same gold
          tables with no copy, no migration, and no separate AI data product. The
          questions below run against the same Iceberg files the Databricks
          workspace reads.
        </p>
      </div>
      <CortexAnalystPanel />
    </div>
  );
}
