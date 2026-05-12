export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">About this portal</h1>
      <p className="mt-3 text-slate-600">
        A reference build that demonstrates an end-to-end public records pipeline using a modern
        data stack — without sacrificing the polish a community-facing site needs.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 mb-3">Architecture</h2>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <div key={s.name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                  {s.icon}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{s.name}</div>
                  <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] font-medium uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 mb-3">Data sources</h2>
        <ul className="space-y-2 text-sm text-slate-700 list-disc list-inside">
          <li>
            <strong>WPRDC</strong> — Western Pennsylvania Regional Data Center open property
            records.
          </li>
          <li>
            <strong>Allegheny County Real Estate</strong> — Assessment, appeals, and exemption
            registries.
          </li>
        </ul>
      </section>

      <section className="mt-10 rounded-xl bg-amber-50 border border-amber-200 p-5 text-sm text-amber-900">
        <strong>Disclaimer:</strong> Data is provided for informational purposes only. For official
        records, contact the Allegheny County Office of Property Assessments.
      </section>
    </div>
  );
}

const STEPS = [
  {
    icon: '1',
    name: 'Fivetran — Ingestion',
    desc: 'A custom Python SDK connector pulls daily snapshots of parcels, assessments, owners, exemptions, and appeals into Databricks.',
    tags: ['Python SDK', 'Incremental sync', 'Schema discovery'],
  },
  {
    icon: '2',
    name: 'Databricks Unity Catalog — Storage & governance',
    desc: 'Raw tables land in dedicated schemas, governed by least-privilege service principals.',
    tags: ['Delta Lake', 'Unity Catalog', 'Service principals'],
  },
  {
    icon: '3',
    name: 'dbt — Transformation',
    desc: 'Tested staging views feed mart tables: dim_parcels, fct_assessments, fct_exemptions_summary, fct_appeals_summary.',
    tags: ['Dimensional model', 'dbt tests', 'Documentation'],
  },
  {
    icon: '4',
    name: 'FastAPI + React — Public portal',
    desc: 'A FastAPI service queries the marts schema and a React frontend renders it for community members.',
    tags: ['FastAPI', 'React 19', 'Recharts', 'Leaflet'],
  },
];
