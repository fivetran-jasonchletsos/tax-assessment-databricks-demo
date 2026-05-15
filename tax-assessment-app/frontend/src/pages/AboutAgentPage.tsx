import { Link, useNavigate } from 'react-router-dom';

const QUICK_ASKS = [
  'What are the biggest YoY assessment jumps?',
  'Show me parcels in ZIP 15217',
  'Which properties have homestead exemptions?',
  'Compare assessed values across municipalities',
  'Most expensive properties in the snapshot',
  "What's the typical assessment in Pittsburgh?",
];

export default function AboutAgentPage() {
  const navigate = useNavigate();
  const ask = (q: string) => navigate(`/agent?q=${encodeURIComponent(q)}`);

  return (
    <div className="bg-slate-50">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 text-white">
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-medium uppercase tracking-wider mb-5">
            <span aria-hidden>✨</span> Property Insight Agent
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight max-w-3xl">
            Skip the search form. Just ask.
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-primary-50 max-w-2xl">
            A natural-language layer on top of the same Allegheny County data the rest of the
            portal uses. Type a question — get back a table, a chart, and a short summary in
            under a second.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => navigate('/agent')}
              className="inline-flex items-center gap-2 rounded-md bg-white text-primary-700 px-6 py-3.5 text-base font-semibold shadow-lg hover:bg-primary-50 transition-colors"
            >
              Open the agent
              <span aria-hidden>→</span>
            </button>
            <button
              onClick={() => ask('What are the biggest YoY assessment jumps?')}
              className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/30 px-6 py-3.5 text-base font-medium transition-colors"
            >
              Try a sample question
            </button>
          </div>
        </div>
      </section>

      {/* THE 30-SECOND PITCH */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ValueCard
            icon="⚡"
            title="Instant answers"
            body="Local rules engine resolves common questions in milliseconds, entirely in your browser — no API call, no waiting on Databricks."
          />
          <ValueCard
            icon="🧠"
            title="Optional deep reasoning"
            body="Bring your own Anthropic API key and the same UI routes harder questions to Claude. The key lives only in your browser."
          />
          <ValueCard
            icon="🔒"
            title="Private by default"
            body="When Claude mode is on we send aggregated statistics, never individual parcels or owners. Local rules keep everything client-side."
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-white border-y border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl font-bold text-slate-900">How it works</h2>
          <p className="mt-2 text-slate-500 max-w-2xl">
            Two reasoning tiers stacked behind a single text input. The page tries the fast,
            local one first; the user can opt into the smarter, networked one when they want
            interpretation rather than retrieval.
          </p>

          <div className="mt-10 space-y-6">
            <TierCard
              tag="Tier 1"
              tone="primary"
              title="Local rules engine — always on"
              points={[
                'A small intent classifier in src/agent.ts recognizes about a dozen patterns: top movers, top decliners, exemption coverage, ZIP filters, owner search, comparisons, land-use mix, typical values, substring lookups.',
                'Each intent runs a SQL-like aggregation over the in-browser snapshot.',
                'Returns a structured response: a one-sentence summary, an optional table, an optional bar chart, and follow-up suggestions.',
                'Zero network calls, zero latency, zero data leaves the browser.',
              ]}
            />
            <TierCard
              tag="Tier 2"
              tone="accent"
              title="Claude opt-in — deeper reasoning"
              points={[
                'Toggle "Ask Claude" mode in the agent header. The page prompts for an Anthropic API key, stored only in localStorage.',
                'The agent sends Claude a small aggregated summary of the snapshot (per-municipality, per-ZIP, per-land-use roll-ups + P50/P90) plus the question — never the raw parcel list.',
                'Calls go direct from the browser using the anthropic-dangerous-direct-browser-access header. No middleware.',
                'If Claude errors or the key is missing, the page silently falls back to Tier 1 so the user always gets an answer.',
              ]}
            />
          </div>
        </div>
      </section>

      {/* SAMPLE QUESTIONS */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-slate-900">What you can ask</h2>
        <p className="mt-2 text-slate-500 max-w-2xl">
          Click any chip to jump straight into the agent with the question already asked.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_ASKS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              className="group text-left rounded-xl border border-slate-200 bg-white hover:border-primary-300 hover:shadow-md p-4 transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-800">{q}</span>
                <span className="text-primary-500 group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* WHY IT MATTERS / USE CASES */}
      <section className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-3xl font-bold text-slate-900">Why we built this</h2>
          <p className="mt-3 text-slate-600 max-w-3xl">
            A community tax portal isn't useful if it makes people learn its filter system to
            extract a single answer. Most of what a homeowner, journalist, or assessor wants is
            a one-line question with a one-paragraph answer.
          </p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <UseCase
              persona="Homeowner"
              quote="My assessment went up — how does my house compare to the rest of my ZIP?"
              outcome="Agent returns ZIP median, P90, the parcel's percentile, and YoY trend. One question, complete picture."
            />
            <UseCase
              persona="Journalist"
              quote="Which Pittsburgh neighborhoods saw the steepest assessment jumps this year?"
              outcome="Top-movers table grouped by municipality, with absolute and percentage change. Source-of-truth is the same dbt mart."
            />
            <UseCase
              persona="Assessor / analyst"
              quote="Show me homestead-exempt parcels with appeals in 15217."
              outcome="The rules engine stacks the filters automatically. No mental SQL needed."
            />
            <UseCase
              persona="Sales engineer"
              quote="Demo this to a prospect without setting up a sandbox."
              outcome="The agent works against the published snapshot, so live demos run anywhere with internet — even on a conference Wi-Fi."
            />
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-slate-900">The whole agent in three files</h2>
        <p className="mt-2 text-slate-500 max-w-2xl">
          No backend, no framework, no vendor. Three TypeScript modules deployed as part of the
          static SPA.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <FileCard
            path="src/agent.ts"
            role="Intent engine + Claude client"
            detail="Pattern matchers, in-browser aggregations, askClaude() helper that calls api.anthropic.com directly."
          />
          <FileCard
            path="src/analytics.ts"
            role="Shared aggregations"
            detail="quantile(), groupByCity(), groupByZip(), valueHistogram(), outliers() — used by both the agent and the dashboard."
          />
          <FileCard
            path="src/pages/AgentPage.tsx"
            role="The conversational UI"
            detail="Input + history list + settings drawer + response cards (summary, table, chart, follow-ups)."
          />
        </div>

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-5 text-sm">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-medium mb-2">
            Data flow
          </div>
          <div className="font-mono text-xs text-slate-700 leading-relaxed">
            <strong>question →</strong> intent classifier (agent.ts) <strong>→</strong>{' '}
            in-browser aggregation over snapshot <strong>→</strong> structured response{' '}
            <em className="text-slate-400">(default)</em>
            <br />
            <strong>question →</strong> aggregated summary + question <strong>→</strong>{' '}
            Anthropic API <strong>→</strong> Claude response{' '}
            <em className="text-slate-400">(when API key set)</em>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-gradient-to-br from-primary-800 to-primary-900 text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">Ready to try it?</h2>
          <p className="mt-3 text-primary-200 max-w-2xl mx-auto">
            No setup, no signup, no API key required for the local rules tier.
          </p>
          <button
            onClick={() => navigate('/agent')}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-white text-primary-800 px-7 py-4 text-base font-semibold shadow-lg hover:bg-slate-50 transition-colors"
          >
            <span aria-hidden>✨</span>
            Open the Property Insight Agent
            <span aria-hidden>→</span>
          </button>
          <div className="mt-6 text-sm text-primary-200">
            Or check the full project context in the{' '}
            <Link to="/about" className="underline hover:text-white">
              About page
            </Link>
            .
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ValueCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="text-3xl mb-3" aria-hidden>
        {icon}
      </div>
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function TierCard({
  tag,
  tone,
  title,
  points,
}: {
  tag: string;
  tone: 'primary' | 'accent';
  title: string;
  points: string[];
}) {
  const accent =
    tone === 'primary'
      ? 'bg-primary-100 text-primary-700'
      : 'bg-primary-50 text-primary-700';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${accent}`}>
        {tag}
      </div>
      <h3 className="mt-3 text-xl font-semibold text-slate-900">{title}</h3>
      <ul className="mt-4 space-y-2">
        {points.map((p, i) => (
          <li key={i} className="flex gap-3 text-sm text-slate-700">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UseCase({
  persona,
  quote,
  outcome,
}: {
  persona: string;
  quote: string;
  outcome: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
      <div className="text-xs uppercase tracking-wider text-slate-500 font-medium">{persona}</div>
      <blockquote className="mt-2 text-base font-medium text-slate-900 italic">
        “{quote}”
      </blockquote>
      <p className="mt-3 text-sm text-slate-600">{outcome}</p>
    </div>
  );
}

function FileCard({
  path,
  role,
  detail,
}: {
  path: string;
  role: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <code className="block text-xs font-mono text-primary-700">{path}</code>
      <div className="mt-2 font-semibold text-slate-900">{role}</div>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
