import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/queries';
import { answer, askClaude, getApiKey, setApiKey, type AgentResponse } from '../agent';
import type { ParcelSearchResult } from '../types';

const SUGGESTED = [
  "What are the biggest YoY assessment jumps?",
  "Compare assessed values across cities",
  "Show me parcels in ZIP 15217",
  "Which properties have homestead exemptions?",
  "Most expensive properties in the snapshot",
  "What's the typical assessment in Pittsburgh?",
  "Show me the biggest declines",
  "Land use breakdown",
];

export default function AgentPage() {
  const [parcels, setParcels] = useState<ParcelSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<{ q: string; r: AgentResponse; pending?: boolean; error?: string }[]>([]);
  const [useClaude, setUseClaude] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoAskedRef = useRef<string | null>(null);

  useEffect(() => {
    api
      .searchParcels({ limit: 5000 })
      .then((r) => setParcels(r.results))
      .finally(() => setLoading(false));
    setHasKey(!!getApiKey());
  }, []);

  // Auto-ask when arriving with ?q=...  (e.g. from the homepage spotlight)
  useEffect(() => {
    const preset = searchParams.get('q');
    if (!preset || loading || autoAskedRef.current === preset) return;
    autoAskedRef.current = preset;
    ask(preset);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || loading) return;
    setQ('');
    if (useClaude && hasKey) {
      const idx = history.length;
      setHistory((h) => [...h, { q: text, r: { intent: 'pending', source: 'claude', summary: 'Asking Claude…' }, pending: true }]);
      try {
        const r = await askClaude(text, parcels);
        setHistory((h) => h.map((e, i) => (i === idx ? { q: text, r } : e)));
      } catch (err: any) {
        const localFallback = answer(text, parcels);
        const message = err?.message ?? String(err);
        setHistory((h) =>
          h.map((entry, i) =>
            i === idx ? { q: text, r: localFallback, error: message } : entry,
          ),
        );
      }
    } else {
      const r = answer(text, parcels);
      setHistory((h) => [...h, { q: text, r }]);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(q);
  };

  const saveKey = () => {
    setApiKey(apiKeyInput || null);
    setHasKey(!!apiKeyInput);
    setShowSettings(false);
    setApiKeyInput('');
  };

  const clearKey = () => {
    setApiKey(null);
    setHasKey(false);
    setUseClaude(false);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="inline-flex items-center rounded-full bg-primary-50 text-primary-700 px-3 py-1 text-xs font-medium uppercase tracking-wider mb-3">
          Property Insight Agent
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold text-slate-900">Ask anything about the data</h1>
          <Link
            to="/about-agent"
            className="hidden sm:inline-flex shrink-0 items-center gap-1 text-sm text-primary-700 hover:text-primary-900 font-medium"
          >
            How it works <span aria-hidden>→</span>
          </Link>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Type a question in plain English. The agent answers from the published snapshot —
          aggregations, comparisons, filters, lookups. Optionally route through Claude for richer
          reasoning.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">Mode:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!useClaude}
                onChange={() => setUseClaude(false)}
                className="accent-primary-600"
              />
              <span className="font-medium">Local rules</span>
              <span className="text-xs text-slate-400">(always on)</span>
            </label>
            <label className={`flex items-center gap-2 cursor-pointer ${!hasKey ? 'opacity-50' : ''}`}>
              <input
                type="radio"
                checked={useClaude}
                onChange={() => hasKey && setUseClaude(true)}
                disabled={!hasKey}
                className="accent-primary-600"
              />
              <span className="font-medium">Ask Claude</span>
              {!hasKey && <span className="text-xs text-slate-400">(needs API key)</span>}
            </label>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
            title="Configure Claude"
          >
            ⚙ Settings
          </button>
        </div>

        {showSettings && (
          <div className="border-b border-slate-100 px-4 py-4 bg-amber-50 text-sm">
            <p className="text-amber-900 mb-3">
              Paste your Anthropic API key to enable Claude mode. Stored only in this browser's localStorage.
              Never sent to GitHub or anyone but Anthropic's API.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={hasKey ? '••••••••••••••• (key saved)' : 'sk-ant-api03-...'}
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={saveKey}
                className="rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2"
              >
                Save
              </button>
              {hasKey && (
                <button
                  onClick={clearKey}
                  className="rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-sm px-3 py-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="px-4 py-4 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              loading
                ? 'Loading snapshot…'
                : useClaude
                ? 'Ask Claude — e.g. "Which Squirrel Hill parcels look over-assessed?"'
                : 'Ask in plain English — e.g. "What are the biggest YoY jumps?"'
            }
            className="flex-1 rounded-md border border-slate-300 px-4 py-3 text-sm focus:outline-2 focus:outline-primary-300"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !q.trim()}
            className="rounded-md bg-primary-700 hover:bg-primary-800 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-3"
          >
            Ask
          </button>
        </form>

        <div className="px-4 pb-4 flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={loading}
              className="text-xs rounded-full bg-slate-100 hover:bg-primary-100 hover:text-primary-700 text-slate-700 px-3 py-1.5 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {history.length === 0 && !loading && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Ask a question to see how the agent reasons over the snapshot.
          </div>
        )}
        {[...history].reverse().map((h, i) => (
          <ResponseCard key={history.length - i} entry={h} onParcel={(id) => navigate(`/parcels/${encodeURIComponent(id)}`)} />
        ))}
      </div>

      <div className="mt-8 text-xs text-slate-400">
        The local rules engine ships with the site and works offline. The Claude path sends a small
        aggregated summary of the snapshot (not individual parcels) plus your question to
        Anthropic's API using <code className="font-mono">claude-haiku-4-5</code>.
      </div>
    </div>
  );
}

function ResponseCard({
  entry,
  onParcel,
}: {
  entry: { q: string; r: AgentResponse; pending?: boolean; error?: string };
  onParcel: (id: string) => void;
}) {
  const { q, r, pending, error } = entry;
  const isClaude = r.source === 'claude';
  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Question</div>
          <div className="font-medium text-slate-900">{q}</div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isClaude ? 'bg-primary-50 text-primary-700' : 'bg-primary-100 text-primary-700'
          }`}
        >
          {isClaude ? 'Claude' : 'Rules'}
        </span>
      </header>
      <div className="p-4 text-sm">
        {error && (
          <div className="mb-3 rounded-md bg-rose-50 text-rose-700 px-3 py-2 text-xs">
            Claude error — falling back to local rules. {error}
          </div>
        )}
        <p className={`whitespace-pre-wrap ${pending ? 'text-slate-400 animate-pulse' : 'text-slate-800'}`}>
          {r.summary}
        </p>

        {r.chart && (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.chart.data}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey={r.chart.xKey} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey={r.chart.yKey} fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {r.table && r.table.rows.length > 0 && (
          <div className="mt-4 overflow-x-auto -mx-2 px-2">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 uppercase tracking-wider text-slate-500">
                <tr>
                  {r.table.columns.map((c) => (
                    <th key={c} className="px-3 py-2 text-left whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.table.rows.map((row, i) => (
                  <tr
                    key={i}
                    className={r.parcelIds?.[i] ? 'cursor-pointer hover:bg-primary-50/40' : ''}
                    onClick={() => {
                      const id = r.parcelIds?.[i];
                      if (id) onParcel(id);
                    }}
                  >
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {r.parcelIds && r.parcelIds.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-400">Tip: click any row to open the parcel.</div>
            )}
          </div>
        )}

        {r.followUps && r.followUps.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium self-center">
              Follow-ups:
            </span>
            {r.followUps.map((f) => (
              <span
                key={f}
                className="text-xs rounded-full bg-slate-100 text-slate-600 px-3 py-1"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
