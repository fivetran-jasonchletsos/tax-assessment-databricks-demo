import { useEffect, useState } from 'react';

interface ConnectorStatus {
  id: string;
  schema: string;
  name: string;
  service: string | null;
  paused: boolean | null;
  sync_state: string | null;
  update_state: string | null;
  setup_state: string | null;
  is_historical_sync: boolean | null;
  succeeded_at: string | null;
  failed_at: string | null;
  sync_frequency_minutes: number | null;
  schedule_type: string | null;
  dashboard_url: string;
  error?: string | null;
}

interface DestinationStatus {
  id: string;
  name: string;
  service: string | null;
  region: string | null;
  setup_status: string | null;
  networking_method: string | null;
  host: string | null;
  http_path: string | null;
  catalog: string | null;
  auth_type: string | null;
  error?: string | null;
}

interface ProjectStatus {
  id: string;
  type: string | null;
  status: string | null;
  created_at: string | null;
  git_remote_url: string | null;
  folder_path: string | null;
  git_branch: string | null;
  default_schema: string | null;
  dbt_version: string | null;
}

interface TransformationStatus {
  id: string;
  name: string | null;
  project_id: string | null;
  type: string | null;
  status: string | null;
  paused: boolean | null;
  last_started_at: string | null;
  last_ended_at: string | null;
  schedule: { schedule_type?: string; connection_ids?: string[] } | null;
  output_model_names: string[] | null;
}

interface PagesStatus {
  html_url: string | null;
  status: string | null;
  build_type: string | null;
  https_enforced: boolean | null;
  last_deploy_at: string | null;
  last_deploy_sha: string | null;
  last_deploy_message: string | null;
  runs_url: string;
}

interface PipelineBundle {
  generated_at: string;
  fivetran: {
    connectors: ConnectorStatus[];
    destination: DestinationStatus;
    project: ProjectStatus | null;
    transformations: TransformationStatus[];
  };
  pages: PagesStatus;
}

export default function PipelinePage() {
  const [bundle, setBundle] = useState<PipelineBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${BASE}/data/pipeline.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setBundle)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Pipeline status unavailable</h1>
        <p className="mt-2 text-slate-500">{error}</p>
      </div>
    );
  }

  if (!bundle) {
    return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-slate-500">Loading…</div>;
  }

  const { fivetran, pages } = bundle;
  const overallStatus = computeOverallStatus(bundle);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
          Pipeline Health
        </div>
        <h1 className="text-3xl font-bold text-slate-900">End-to-end status</h1>
        <p className="text-sm text-slate-500 mt-1">
          Live snapshot of every layer in the stack: Fivetran connectors, the Databricks warehouse,
          the dbt transformation, and this site. Generated{' '}
          <strong>{relTime(bundle.generated_at)}</strong>.
        </p>
      </header>

      <OverallBanner status={overallStatus} />

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <LayerNum n={1} /> Fivetran connectors
          <span className="text-xs font-normal text-slate-500">
            ({fivetran.connectors.length} configured)
          </span>
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {fivetran.connectors.map((c) => (
            <ConnectorCard key={c.id} c={c} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <LayerNum n={2} /> Databricks warehouse
        </h2>
        <DestinationCard d={fivetran.destination} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <LayerNum n={3} /> dbt transformation
        </h2>
        <ProjectCard project={fivetran.project} transformations={fivetran.transformations} />
      </section>

      <section className="mt-8 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <LayerNum n={4} /> Website
        </h2>
        <PagesCard pages={pages} />
      </section>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        Refresh this view by re-running{' '}
        <code className="font-mono bg-slate-100 px-1 rounded">
          scripts/build_pipeline_status.py
        </code>{' '}
        with FIVETRAN_API_KEY/SECRET in your env, then committing the regenerated{' '}
        <code className="font-mono bg-slate-100 px-1 rounded">data/pipeline.json</code>.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OverallBanner({
  status,
}: {
  status: { tone: 'healthy' | 'warning' | 'error'; summary: string };
}) {
  const toneClass = {
    healthy: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    error: 'bg-rose-50 border-rose-200 text-rose-900',
  }[status.tone];
  const dot = {
    healthy: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-rose-500',
  }[status.tone];
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${toneClass}`}>
      <span className={`mt-1 inline-block h-3 w-3 rounded-full ${dot} animate-pulse`} />
      <div>
        <div className="font-semibold uppercase text-xs tracking-wider">
          {status.tone === 'healthy' ? 'All systems operational' : status.tone === 'warning' ? 'Degraded' : 'Action required'}
        </div>
        <div className="mt-1 text-sm">{status.summary}</div>
      </div>
    </div>
  );
}

function ConnectorCard({ c }: { c: ConnectorStatus }) {
  const ok = !c.failed_at && !c.error && c.sync_state !== 'failed';
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className={`px-4 py-3 border-b border-slate-100 flex items-start justify-between ${ok ? 'bg-emerald-50/50' : 'bg-rose-50/50'}`}>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            {c.service ?? 'connector'}
          </div>
          <div className="font-semibold text-slate-900">{c.name}</div>
          <div className="text-xs font-mono text-slate-500 mt-0.5">{c.schema}</div>
        </div>
        <StatusPill state={c.sync_state} paused={c.paused} ok={ok} />
      </header>
      <dl className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <DT>Setup</DT>
        <DD value={c.setup_state} />
        <DT>Schedule</DT>
        <DD value={c.sync_frequency_minutes ? `every ${c.sync_frequency_minutes / 60} hr · ${c.schedule_type}` : c.schedule_type} />
        <DT>Last success</DT>
        <DD value={c.succeeded_at ? relTime(c.succeeded_at) : '—'} />
        <DT>Last failure</DT>
        <DD value={c.failed_at ? relTime(c.failed_at) : 'none'} tone={c.failed_at ? 'error' : undefined} />
      </dl>
      <footer className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs flex items-center justify-between">
        <span className="text-slate-500">Connection ID: <code className="font-mono">{c.id}</code></span>
        <a
          href={c.dashboard_url}
          target="_blank"
          rel="noreferrer"
          className="text-primary-700 hover:text-primary-900 font-medium"
        >
          Fivetran dashboard ↗
        </a>
      </footer>
    </article>
  );
}

function DestinationCard({ d }: { d: DestinationStatus }) {
  const ok = d.setup_status === 'connected' && !d.error;
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className={`px-4 py-3 border-b border-slate-100 flex items-start justify-between ${ok ? 'bg-emerald-50/50' : 'bg-rose-50/50'}`}>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            {d.service ?? 'warehouse'}
          </div>
          <div className="font-semibold text-slate-900">{d.name}</div>
        </div>
        <span
          className={`text-xs font-medium rounded-full px-2.5 py-1 ${
            ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}
        >
          {d.setup_status ?? 'unknown'}
        </span>
      </header>
      <dl className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <DT>Host</DT>
        <DD value={d.host} mono />
        <DT>HTTP path</DT>
        <DD value={d.http_path} mono />
        <DT>Catalog</DT>
        <DD value={d.catalog} mono />
        <DT>Region</DT>
        <DD value={d.region} />
        <DT>Auth</DT>
        <DD value={d.auth_type} />
        <DT>Networking</DT>
        <DD value={d.networking_method} />
      </dl>
    </article>
  );
}

function ProjectCard({
  project,
  transformations,
}: {
  project: ProjectStatus | null;
  transformations: TransformationStatus[];
}) {
  if (!project) {
    return (
      <article className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        <div className="font-semibold mb-1">No dbt transformation project linked yet.</div>
        <div>
          The dbt models in <code className="font-mono bg-white/60 px-1 rounded">tax-assessment-app/dbt_project/jason_chletsos_tax_assessment</code> are ready
          but no Fivetran Transformation references them yet. See the project's README
          for the API calls.
        </div>
      </article>
    );
  }
  const correctRepo = (project.git_remote_url ?? '').includes('fivetran-sheetz-demo');
  const mostRecent = [...transformations].sort((a, b) =>
    (b.last_ended_at ?? '').localeCompare(a.last_ended_at ?? ''),
  )[0];
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className={`px-4 py-3 border-b border-slate-100 flex items-start justify-between ${correctRepo ? 'bg-emerald-50/50' : 'bg-amber-50/50'}`}>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">
            {project.type ?? 'project'} · {project.dbt_version ?? '?'}
          </div>
          <div className="font-semibold text-slate-900">{project.id}</div>
        </div>
        <span
          className={`text-xs font-medium rounded-full px-2.5 py-1 ${
            project.status === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {project.status}
        </span>
      </header>
      <dl className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <DT>Repo</DT>
        <DD value={project.git_remote_url} mono tone={correctRepo ? undefined : 'warning'} />
        <DT>Folder</DT>
        <DD value={project.folder_path} mono />
        <DT>Branch</DT>
        <DD value={project.git_branch} mono />
        <DT>Target schema</DT>
        <DD value={project.default_schema} mono />
      </dl>
      {!correctRepo && (
        <div className="mx-4 mb-4 rounded-md bg-amber-100 text-amber-900 text-xs p-3">
          ⚠️ This dbt project points at the <strong>{project.git_remote_url?.split('/').slice(-1)[0]}</strong> repo,
          not <strong>fivetran-sheetz-demo</strong>. Tax-assessment dbt runs won't fire from this transformation
          until the project is swapped.
        </div>
      )}
      {mostRecent && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-sm">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
            Latest run
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DT>Status</DT>
            <DD value={mostRecent.status} tone={mostRecent.status === 'SUCCEEDED' ? undefined : 'warning'} />
            <DT>Triggered by</DT>
            <DD
              value={
                mostRecent.schedule?.schedule_type === 'INTEGRATED' && mostRecent.schedule?.connection_ids?.length
                  ? `connector sync · ${mostRecent.schedule.connection_ids.join(', ')}`
                  : mostRecent.schedule?.schedule_type
              }
            />
            <DT>Last ended</DT>
            <DD value={mostRecent.last_ended_at ? relTime(mostRecent.last_ended_at) : '—'} />
            <DT>Models</DT>
            <DD value={mostRecent.output_model_names?.join(', ') || '—'} mono />
          </div>
        </div>
      )}
    </article>
  );
}

function PagesCard({ pages }: { pages: PagesStatus }) {
  const ok = pages.status === 'built' && !!pages.last_deploy_at;
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className={`px-4 py-3 border-b border-slate-100 flex items-start justify-between ${ok ? 'bg-emerald-50/50' : 'bg-amber-50/50'}`}>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">GitHub Pages</div>
          <a
            href={pages.html_url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary-700 hover:text-primary-900"
          >
            {pages.html_url ?? 'unknown URL'} ↗
          </a>
        </div>
        <span
          className={`text-xs font-medium rounded-full px-2.5 py-1 ${
            ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          {pages.status ?? 'unknown'}
        </span>
      </header>
      <dl className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <DT>HTTPS enforced</DT>
        <DD value={pages.https_enforced ? 'yes' : 'no'} />
        <DT>Build type</DT>
        <DD value={pages.build_type} />
        <DT>Last deploy</DT>
        <DD value={pages.last_deploy_at ? relTime(pages.last_deploy_at) : '—'} />
        <DT>Commit</DT>
        <DD value={pages.last_deploy_sha} mono />
      </dl>
      {pages.last_deploy_message && (
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-1">
            Latest commit
          </div>
          <div className="text-sm text-slate-700">{pages.last_deploy_message}</div>
        </div>
      )}
      <footer className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs">
        <a href={pages.runs_url} target="_blank" rel="noreferrer" className="text-primary-700 hover:text-primary-900 font-medium">
          View deploy history ↗
        </a>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------

function StatusPill({ state, paused, ok }: { state: string | null; paused: boolean | null; ok: boolean }) {
  if (paused) {
    return <span className="text-xs font-medium rounded-full bg-amber-100 text-amber-700 px-2.5 py-1">paused</span>;
  }
  const tone = ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  return <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${tone}`}>{state ?? 'unknown'}</span>;
}

function LayerNum({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-slate-900 text-white text-xs font-bold">
      {n}
    </span>
  );
}

function DT({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs uppercase tracking-wider text-slate-500 font-medium">{children}</dt>;
}

function DD({ value, mono, tone }: { value: any; mono?: boolean; tone?: 'error' | 'warning' }) {
  const display = value === null || value === undefined || value === '' ? '—' : String(value);
  const toneClass = tone === 'error' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-900';
  return (
    <dd className={`${toneClass} ${mono ? 'font-mono text-xs' : ''}`}>{display}</dd>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function computeOverallStatus(b: PipelineBundle): { tone: 'healthy' | 'warning' | 'error'; summary: string } {
  const issues: string[] = [];
  for (const c of b.fivetran.connectors) {
    if (c.failed_at) issues.push(`${c.schema} last failed ${relTime(c.failed_at)}`);
    if (c.paused) issues.push(`${c.schema} is paused`);
  }
  if (b.fivetran.destination.setup_status !== 'connected') {
    issues.push(`destination ${b.fivetran.destination.name} setup=${b.fivetran.destination.setup_status}`);
  }
  const projectMisaligned = b.fivetran.project && !(b.fivetran.project.git_remote_url ?? '').includes('fivetran-sheetz-demo');
  if (projectMisaligned) {
    issues.push('dbt project points at a different repo');
  }
  if (issues.length === 0) {
    const lastSyncs = b.fivetran.connectors
      .map((c) => c.succeeded_at)
      .filter(Boolean)
      .sort()
      .reverse();
    return {
      tone: 'healthy',
      summary: lastSyncs[0]
        ? `Latest connector sync succeeded ${relTime(lastSyncs[0]!)}; warehouse connected; site deployed.`
        : 'Everything green.',
    };
  }
  return {
    tone: issues.some((s) => s.includes('failed')) ? 'error' : 'warning',
    summary: issues.join(' · '),
  };
}
