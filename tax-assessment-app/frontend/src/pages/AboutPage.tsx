export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">About this portal</h1>
      <p className="mt-3 text-slate-600">
        A reference build that demonstrates an end-to-end public records pipeline using a modern
        data stack — without sacrificing the polish a community-facing site needs.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 mb-1">Data sources</h2>
        <p className="text-sm text-slate-500 mb-4">
          Every parcel value on this site traces back to public, attributed data published by the
          county and made available through WPRDC's open data portal.
        </p>
        <div className="space-y-3">
          {DATA_SOURCES.map((s) => (
            <article key={s.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{s.description}</p>
                </div>
                {s.publisher && (
                  <span className="shrink-0 inline-flex items-center rounded-full bg-primary-100 text-primary-700 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider">
                    {s.publisher}
                  </span>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {s.links.map((link) => (
                  <div key={link.label} className="flex flex-col">
                    <dt className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                      {link.label}
                    </dt>
                    <dd className="mt-0.5">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-primary-700 hover:text-primary-900 break-all"
                      >
                        {link.display ?? link.url}
                      </a>
                    </dd>
                  </div>
                ))}
              </dl>
              {s.resource_id && (
                <div className="mt-3 text-[11px] text-slate-400">
                  CKAN resource id:{' '}
                  <code className="font-mono bg-slate-100 px-1 rounded">{s.resource_id}</code>
                </div>
              )}
            </article>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          WPRDC datasets are queryable via{' '}
          <a
            href="https://docs.ckan.org/en/latest/maintaining/datastore.html"
            target="_blank"
            rel="noreferrer"
            className="text-primary-700 hover:text-primary-900"
          >
            CKAN's datastore API
          </a>{' '}
          — see{' '}
          <code className="font-mono bg-slate-100 px-1 rounded">
            scripts/build_wprdc_snapshot.py
          </code>{' '}
          for the SQL we run.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-slate-900 mb-3">Architecture</h2>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <div key={s.name} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center font-bold shrink-0">
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

      <section className="mt-10 rounded-xl bg-amber-50 border border-amber-200 p-5 text-sm text-amber-900">
        <strong>Disclaimer:</strong> Data is provided for informational purposes only. For official
        records, contact the{' '}
        <a
          href="https://www.alleghenycounty.us/Government/Departments/Office-of-Property-Assessments"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-amber-700"
        >
          Allegheny County Office of Property Assessments
        </a>
        .
      </section>
    </div>
  );
}

const DATA_SOURCES: {
  title: string;
  description: string;
  publisher?: string;
  resource_id?: string;
  links: { label: string; url: string; display?: string }[];
}[] = [
  {
    title: 'Allegheny County Property Assessments',
    description:
      "WPRDC's mirror of the county's monthly residential and commercial parcel roll. Source for assessed value, market value, owner mailing, exemptions, lot area, building characteristics, and sale history.",
    publisher: 'WPRDC',
    resource_id: '9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5',
    links: [
      {
        label: 'Dataset page',
        url: 'https://data.wprdc.org/dataset/property-assessments',
      },
      {
        label: 'CKAN datastore API',
        url: 'https://data.wprdc.org/api/3/action/datastore_search_sql?resource_id=9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5',
        display: 'datastore_search_sql?resource_id=9a1c60bd-…',
      },
    ],
  },
  {
    title: 'Allegheny County Finished Property Assessment Appeals',
    description:
      'Historical record of every finished real-estate appeal (filed → scheduled → approved / denied / withdrawn) — with original, hearing, and result values. Powers the appeals section on each parcel.',
    publisher: 'WPRDC',
    resource_id: '8a7607fb-c93e-4d7a-9b23-528b5c25b1de',
    links: [
      {
        label: 'Dataset page',
        url: 'https://data.wprdc.org/dataset/allegheny-county-finished-real-estate-tax-appeals',
      },
      {
        label: 'CKAN datastore API',
        url: 'https://data.wprdc.org/api/3/action/datastore_search_sql?resource_id=8a7607fb-c93e-4d7a-9b23-528b5c25b1de',
        display: 'datastore_search_sql?resource_id=8a7607fb-…',
      },
    ],
  },
  {
    title: 'Allegheny County Filed Property Assessment Appeals',
    description:
      'Pending / in-progress appeals filed each year. Complement to the finished-appeals dataset above.',
    publisher: 'WPRDC',
    links: [
      {
        label: 'Dataset page',
        url: 'https://data.wprdc.org/dataset/filed-property-assessment-appeals',
      },
    ],
  },
  {
    title: 'Allegheny County Property Sale Transactions',
    description:
      "Historical residential and commercial sales, including sale price, sale date, deed book/page. Used to validate market-value calibration and for the parcel's sale-history section.",
    publisher: 'WPRDC',
    resource_id: '5bbe6c55-bce6-4edb-9d04-68edeb6bf7b1',
    links: [
      {
        label: 'Dataset page',
        url: 'https://data.wprdc.org/dataset/allegheny-county-property-sale-transactions',
      },
      {
        label: 'CKAN datastore API',
        url: 'https://data.wprdc.org/api/3/action/datastore_search_sql?resource_id=5bbe6c55-bce6-4edb-9d04-68edeb6bf7b1',
        display: 'datastore_search_sql?resource_id=5bbe6c55-…',
      },
    ],
  },
  {
    title: 'WPRDC — Western Pennsylvania Regional Data Center',
    description:
      'The organization that hosts, normalizes, and publishes the datasets above on behalf of Allegheny County and partner agencies.',
    links: [
      { label: 'Portal homepage', url: 'https://data.wprdc.org/' },
      { label: 'About WPRDC', url: 'https://www.wprdc.org/' },
    ],
  },
];

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
    name: 'React + Recharts — Public portal',
    desc: 'A static React SPA reads daily JSON snapshots of the marts and renders the parcel detail, dashboard, and Property Insight Agent.',
    tags: ['React 19', 'Recharts', 'Leaflet', 'Tailwind v4'],
  },
];
