/*
 * ActivationLivePage — NewCo Activations live-sync playback for Allegheny
 * County Tax.
 *
 * Terminal-styled step-by-step playback: Segment Definition -> Field
 * Mapping -> Sync Preview -> API Push -> Destination Confirmation. Content
 * lives inline as local consts (no fetch, no public/data JSON) — see spec
 * note in activationTypes.ts.
 *
 * Vertical scenario: the "assessment shock, no appeal, deadline
 * approaching" segment. The moment gold.fct_assessment_current flags a
 * parcel with a >20% YoY assessed-value jump, no matching row in
 * gold.fct_appeals for the current filing year, and the county's
 * appeal-filing deadline inside 30 days, Activations pushes that parcel
 * straight into Granicus GovDelivery as a segmented subscriber.
 */

import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  ActivationAgent,
  ActivationAgentId,
  ActivationEvent,
  ActivationRecord,
  ActivationScenario,
} from '../components/activationTypes';

// Timing constants — scale by speed control.
const NARR_TYPE_MS = 14;
const CODE_TYPE_MS = 4;
const POST_NARR_DELAY_MS = 550;
const POST_CODE_DELAY_MS = 350;
const SPEEDS = [1, 2, 4] as const;
const ACCENT = '#0e7490';

interface RevealState {
  cursor: number;
  narrTyped: number;
  codeTyped: number;
  sideEffects: string[];
}

const INITIAL: RevealState = {
  cursor: 0,
  narrTyped: 0,
  codeTyped: 0,
  sideEffects: [],
};

const STEP_DEFS = [
  { label: 'Segment Definition',       who: 'Segment', tools: 'gold query',       insight: '1 parcel matched' },
  { label: 'Field Mapping',            who: 'Mapper',  tools: 'schema map',       insight: '5 fields mapped' },
  { label: 'Sync Preview',             who: 'Mapper',  tools: 'diff preview',     insight: '1 insert · 6 unchanged' },
  { label: 'API Push',                 who: 'Sync',    tools: 'REST push',       insight: '1 subscriber sent' },
  { label: 'Destination Confirmation', who: 'Sync',    tools: 'destination read', insight: '1 landed · 0 errors' },
];

// ─── Vertical-specific scenario content (assessment shock → Granicus GovDelivery) ─

const ACTIVATION_SCENARIO: ActivationScenario = {
  company: 'Allegheny County',
  request_id: 'ACT-4417',
  requested_by: 'Assessment Shock Monitor',
  requested_at: '2026-07-09T08:15:00Z',
  timezone_label: 'ET',
  question: 'Get assessment-shock parcels onto the appeal-deadline reminder list before the filing window closes.',
  source_model: 'gold.fct_assessment_current',
  destination_system: 'Granicus GovDelivery',
  destination_object: 'Assessment_Shock_Subscribers',
  sync_mode: 'upsert',
  record_count: 7,
  build_room_seconds: 38,
};

const ACTIVATION_AGENTS: ActivationAgent[] = [
  { id: 'segment', name: 'Segment', code: 'SEG', color: '#0e7490', role: 'Defines the gold-layer trigger query', tools: ['gold query', 'threshold watch'] },
  { id: 'mapper',  name: 'Mapper',  code: 'MAP', color: '#b45309', role: 'Maps gold columns to destination fields', tools: ['schema map', 'diff preview'] },
  { id: 'sync',    name: 'Sync',    code: 'SYN', color: '#16a34a', role: 'Pushes the payload and confirms landing', tools: ['REST push', 'destination read'] },
];

const ACTIVATION_SCRIPT: ActivationEvent[] = [
  {
    from: 'segment',
    step: 1,
    step_label: 'Segment Definition',
    body: "Watching gold.fct_assessment_current for one condition: assessed value up more than 20% year over year, no matching row in gold.fct_appeals for the current filing year, and the county's appeal-filing deadline inside 30 days. Parcel 118824 — Highland Park — just crossed the threshold: value up 24.6%, no appeal on file, deadline in 22 days.",
    side_effect: 'gold.fct_assessment_current · shock flag = true · PARCEL-118824',
    code_target: 'sql',
    code_append:
      "select\n  a.parcel_id,\n  a.owner_email,\n  a.neighborhood,\n  a.assessed_value_change_pct,\n  a.appeal_deadline_date\nfrom gold.fct_assessment_current a\nleft join gold.fct_appeals ap\n  on ap.parcel_id = a.parcel_id\n  and ap.filing_year = a.tax_year\nwhere a.assessed_value_change_pct > 20\n  and ap.parcel_id is null\n  and datediff(day, current_date(), a.appeal_deadline_date) <= 30;",
  },
  {
    from: 'mapper',
    step: 2,
    step_label: 'Field Mapping',
    body: 'Field Mapping translates the governed gold columns straight into Granicus GovDelivery\'s subscriber schema — no analyst re-keying names and addresses by hand once a quarter.',
    side_effect: 'mapping · 5 fields → Assessment_Shock_Subscribers',
    code_target: 'json',
    code_append: JSON.stringify(
      {
        destination: 'Granicus GovDelivery',
        object: 'Assessment_Shock_Subscribers',
        field_map: {
          parcel_id: 'external_id',
          owner_email: 'subscriber_email',
          assessed_value_change_pct: 'merge_field.VALUE_CHANGE_PCT',
          appeal_deadline_date: 'merge_field.DEADLINE_DATE',
          neighborhood: 'topic_id',
        },
      },
      null,
      2,
    ),
  },
  {
    from: 'mapper',
    step: 3,
    step_label: 'Sync Preview',
    body: 'Sync Preview diffs against GovDelivery before anything pushes: 1 new subscriber to add, 6 already-segmented assessment-shock parcels unchanged.',
    side_effect: 'diff · 1 insert · 6 unchanged',
    code_target: 'json',
    code_append: JSON.stringify({ to_insert: 1, unchanged: 6, to_update: 0 }, null, 2),
  },
  {
    from: 'sync',
    step: 4,
    step_label: 'API Push',
    body: "API Push sends the payload straight into the citizen-outreach team's GovDelivery subscriber list — no quarterly CSV export, no re-keyed spreadsheet, zero code.",
    side_effect: 'POST /v1/subscribers · Granicus GovDelivery · 202 accepted',
    code_target: 'json',
    code_append: JSON.stringify(
      {
        topic_id: 'highland-park-appeal-deadline',
        external_id: 'PARCEL-118824',
        subscriber_email: 'owner-118824@ac-tax.example',
        'merge_field.VALUE_CHANGE_PCT': 24.6,
        'merge_field.DEADLINE_DATE': '2026-07-31',
      },
      null,
      2,
    ),
  },
  {
    from: 'sync',
    step: 5,
    step_label: 'Destination Confirmation',
    body: "Destination Confirmation: the subscriber landed in Granicus GovDelivery in under a minute. The outreach team's deadline-reminder campaign fires against a list that's minutes old, not weeks old. One governed flag, one sync, zero code.",
    side_effect: 'Granicus GovDelivery · subscriber synced · 0 errors',
  },
];

const ACTIVATION_RECORDS: ActivationRecord[] = [
  {
    key: 'PARCEL-118824',
    fields: {
      'External ID': 'PARCEL-118824',
      'Subscriber Email': 'owner-118824@ac-tax.example',
      Topic: 'Highland Park',
      'Value Change %': '24.6%',
      'Deadline Date': '2026-07-31',
    },
    status: 'created',
  },
  {
    key: 'PARCEL-114402',
    fields: {
      'External ID': 'PARCEL-114402',
      'Subscriber Email': 'owner-114402@ac-tax.example',
      Topic: 'Squirrel Hill',
      'Value Change %': '21.2%',
      'Deadline Date': '2026-08-02',
    },
    status: 'skipped',
  },
  {
    key: 'PARCEL-109981',
    fields: {
      'External ID': 'PARCEL-109981',
      'Subscriber Email': 'owner-109981@ac-tax.example',
      Topic: 'Shadyside',
      'Value Change %': '22.8%',
      'Deadline Date': '2026-08-04',
    },
    status: 'skipped',
  },
  {
    key: 'PARCEL-107765',
    fields: {
      'External ID': 'PARCEL-107765',
      'Subscriber Email': 'owner-107765@ac-tax.example',
      Topic: 'Lawrenceville',
      'Value Change %': '26.1%',
      'Deadline Date': '2026-07-29',
    },
    status: 'skipped',
  },
  {
    key: 'PARCEL-105311',
    fields: {
      'External ID': 'PARCEL-105311',
      'Subscriber Email': 'owner-105311@ac-tax.example',
      Topic: 'Bloomfield',
      'Value Change %': '20.4%',
      'Deadline Date': '2026-08-06',
    },
    status: 'skipped',
  },
  {
    key: 'PARCEL-103098',
    fields: {
      'External ID': 'PARCEL-103098',
      'Subscriber Email': 'owner-103098@ac-tax.example',
      Topic: 'Point Breeze',
      'Value Change %': '23.9%',
      'Deadline Date': '2026-08-01',
    },
    status: 'skipped',
  },
  {
    key: 'PARCEL-101822',
    fields: {
      'External ID': 'PARCEL-101822',
      'Subscriber Email': 'owner-101822@ac-tax.example',
      Topic: 'East Liberty',
      'Value Change %': '21.7%',
      'Deadline Date': '2026-08-05',
    },
    status: 'skipped',
  },
];

// ─── Destination confirmation payoff table ──────────────────────────────────

function DestinationConfirmationTable({
  scenario,
  records,
}: {
  scenario: ActivationScenario;
  records: ActivationRecord[];
}) {
  const cols = Object.keys(records[0]?.fields ?? {});
  return (
    <div className="mt-4 actv-card overflow-hidden" style={{ borderLeft: `4px solid ${ACCENT}` }}>
      <header className="px-5 py-3 border-b actv-line flex items-center justify-between">
        <div>
          <div className="actv-eyebrow" style={{ fontSize: 11, color: ACCENT }}>Landed in {scenario.destination_system}</div>
          <div className="font-mono text-[12px] actv-text-dim mt-0.5">{scenario.destination_object} · {scenario.sync_mode}</div>
        </div>
        <span className="font-mono text-[12px]" style={{ color: ACCENT }}>
          {records.filter((r) => r.status !== 'skipped').length} of {records.length} shown
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="actv-thead">
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider actv-text-soft">Key</th>
              {cols.map((c) => (
                <th key={c} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider actv-text-soft">{c}</th>
              ))}
              <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider actv-text-soft">Status</th>
            </tr>
          </thead>
          <tbody className="actv-tbody">
            {records.map((r) => (
              <tr key={r.key}>
                <td className="px-4 py-2 font-mono text-[12px] actv-text-strong">{r.key}</td>
                {cols.map((c) => (
                  <td key={c} className="px-4 py-2 text-[12px] actv-text">{r.fields[c]}</td>
                ))}
                <td className="px-4 py-2 text-right">
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: r.status === 'skipped' ? '#b45309' : '#16a34a' }}
                  >
                    {r.status === 'skipped' ? '● unchanged' : `● ${r.status}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Small agent avatar ──────────────────────────────────────────────────────

function AgentBadge({ agent, active, size = 40 }: { agent?: ActivationAgent; active?: boolean; size?: number }) {
  const color = agent?.color ?? ACCENT;
  const code = agent?.code ?? '??';
  return (
    <span
      className="actv-avatar"
      data-active={active ? 'true' : undefined}
      style={{
        color,
        height: size,
        width: size,
        minWidth: size,
        fontSize: Math.max(11, size * 0.36),
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
        border: `1.5px solid ${active ? color : 'rgba(148,163,184,0.4)'}`,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        fontWeight: 700,
        letterSpacing: '0.05em',
        transition: 'all 200ms ease',
        boxShadow: active ? `0 0 0 2px ${color}, 0 0 14px ${color}66` : undefined,
        flexShrink: 0,
      }}
      title={agent?.name ?? 'System'}
    >
      {code}
    </span>
  );
}

// ─── Syntax highlighting (regex-based, dark panel) — SQL + light JSON ───────

const SQL_KEYWORDS = new Set([
  'with', 'as', 'select', 'from', 'where', 'and', 'or', 'on', 'left', 'right',
  'inner', 'outer', 'join', 'group', 'by', 'order', 'desc', 'asc', 'when', 'then',
  'else', 'end', 'case', 'true', 'false', 'null', 'distinct', 'nullif', 'count',
  'sum', 'max', 'min', 'avg', 'dateadd', 'datediff', 'current_date', 'is', 'not',
]);

function tokenizeSqlLine(line: string): React.ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('--')) {
    return [<span key="c" className="atok-com">{line}</span>];
  }
  const parts: React.ReactNode[] = [];
  const re = /(\{\{[^}]*\}\})|('[^']*')|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)|(\s+)|([^\s'\w{]+)/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > idx) parts.push(line.slice(idx, m.index));
    if (m[1]) {
      parts.push(<span key={key++} className="atok-jinja">{m[1]}</span>);
    } else if (m[2]) {
      parts.push(<span key={key++} className="atok-str">{m[2]}</span>);
    } else if (m[3]) {
      parts.push(<span key={key++} className="atok-num">{m[3]}</span>);
    } else if (m[4]) {
      const word = m[4];
      if (SQL_KEYWORDS.has(word.toLowerCase())) {
        parts.push(<span key={key++} className="atok-kw">{word}</span>);
      } else {
        parts.push(word);
      }
    } else if (m[5]) {
      parts.push(m[5]);
    } else {
      parts.push(m[6] ?? '');
    }
    idx = re.lastIndex;
  }
  if (idx < line.length) parts.push(line.slice(idx));
  return parts;
}

function SyntaxSql({ text, cursor }: { text: string; cursor: boolean }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>{tokenizeSqlLine(line)}{li < lines.length - 1 && '\n'}</span>
      ))}
      {cursor && <span className="actv-code-cursor" />}
    </>
  );
}

function tokenizeJsonLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\b\d+(?:\.\d+)?\b)/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > idx) parts.push(line.slice(idx, m.index));
    if (m[1]) {
      const isKey = !!m[2];
      parts.push(<span key={key++} className={isKey ? 'atok-kw' : 'atok-str'}>{m[1]}</span>);
      if (m[2]) parts.push(m[2]);
    } else if (m[3]) {
      parts.push(<span key={key++} className="atok-jinja">{m[3]}</span>);
    } else if (m[4]) {
      parts.push(<span key={key++} className="atok-num">{m[4]}</span>);
    }
    idx = re.lastIndex;
  }
  if (idx < line.length) parts.push(line.slice(idx));
  return parts;
}

function SyntaxJson({ text, cursor }: { text: string; cursor: boolean }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <span key={li}>{tokenizeJsonLine(line)}{li < lines.length - 1 && '\n'}</span>
      ))}
      {cursor && <span className="actv-code-cursor" />}
    </>
  );
}

// =============================================================================
// Page
// =============================================================================

export default function ActivationLivePage() {
  const [events] = useState<ActivationEvent[]>(ACTIVATION_SCRIPT);
  const scenario = ACTIVATION_SCENARIO;
  const agents = ACTIVATION_AGENTS;

  const [state, setState] = useState<RevealState>(INITIAL);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [complete, setComplete] = useState(false);

  const narrPanelRef = useRef<HTMLDivElement | null>(null);
  const codePanelRef = useRef<HTMLPreElement | null>(null);
  const narrUserScrolled = useRef(false);
  const codeUserScrolled = useRef(false);

  const agentById = useMemo(() => {
    const m: Record<string, ActivationAgent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const currentEvent: ActivationEvent | undefined = events[state.cursor];
  const totalSteps = useMemo(() => {
    if (events.length === 0) return 5;
    return Math.max(...events.map((e) => e.step));
  }, [events]);

  // Phase machine: type narration → type code (if any) → advance
  useEffect(() => {
    if (!playing || !currentEvent) {
      if (events.length > 0 && state.cursor >= events.length && !complete) {
        setComplete(true);
      }
      return;
    }
    // Phase 1: type narration
    if (state.narrTyped < currentEvent.body.length) {
      const id = setTimeout(() => {
        setState((s) => ({ ...s, narrTyped: s.narrTyped + 1 }));
      }, Math.max(2, Math.floor(NARR_TYPE_MS / speed)));
      return () => clearTimeout(id);
    }
    // Phase 2: type code if any
    const code = currentEvent.code_append ?? '';
    if (code.length > 0 && state.codeTyped < code.length) {
      const id = setTimeout(() => {
        setState((s) => ({ ...s, codeTyped: s.codeTyped + 1 }));
      }, Math.max(1, Math.floor(CODE_TYPE_MS / speed)));
      return () => clearTimeout(id);
    }
    // Phase 3: commit side effect + advance cursor
    const postDelay = code.length > 0 ? POST_CODE_DELAY_MS : POST_NARR_DELAY_MS;
    const id = setTimeout(() => {
      setState((s) => {
        const next: RevealState = { ...s, cursor: s.cursor + 1, narrTyped: 0, codeTyped: 0 };
        if (currentEvent.side_effect) {
          next.sideEffects = [currentEvent.side_effect, ...s.sideEffects].slice(0, 8);
        }
        return next;
      });
    }, Math.max(80, Math.floor(postDelay / speed)));
    return () => clearTimeout(id);
  }, [playing, speed, currentEvent, state.narrTyped, state.codeTyped, state.cursor, events.length, complete]);

  useEffect(() => {
    const el = narrPanelRef.current;
    if (el && !narrUserScrolled.current) el.scrollTop = el.scrollHeight;
  }, [state.cursor, state.narrTyped]);
  useEffect(() => {
    const el = codePanelRef.current;
    if (el && !codeUserScrolled.current) el.scrollTop = el.scrollHeight;
  }, [state.codeTyped, state.cursor]);

  useEffect(() => {
    const NEAR_BOTTOM_PX = 32;
    const bind = (el: HTMLElement | null, flag: React.MutableRefObject<boolean>) => {
      if (!el) return () => {};
      const handler = () => {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        flag.current = distanceFromBottom > NEAR_BOTTOM_PX;
      };
      el.addEventListener('scroll', handler, { passive: true });
      return () => el.removeEventListener('scroll', handler);
    };
    const offs = [bind(narrPanelRef.current, narrUserScrolled), bind(codePanelRef.current, codeUserScrolled)];
    return () => { offs.forEach((off) => off()); };
  }, []);

  const reset = () => { setState(INITIAL); setComplete(false); setPlaying(true); };
  const cycleSpeed = () => { const i = SPEEDS.indexOf(speed); setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); };

  const currentStep = currentEvent?.step ?? totalSteps;
  const currentStepLabel = currentEvent?.step_label ?? 'Destination Confirmation';
  const activeAgentId: ActivationAgentId | undefined =
    currentEvent && state.narrTyped < currentEvent.body.length ? currentEvent.from : undefined;

  const visibleNarr = events.slice(0, Math.min(state.cursor + 1, events.length)).map((e, idx) => {
    const isCurrent = idx === state.cursor;
    const body = isCurrent ? e.body.slice(0, state.narrTyped) : e.body;
    return { e, body, isCurrent };
  });

  const codeSoFar = currentEvent?.code_append ? currentEvent.code_append.slice(0, state.codeTyped) : '';
  const codeLabel =
    currentEvent?.code_target === 'sql'
      ? 'models/gold/fct_assessment_current.sql'
      : 'activation_mapping.json';

  return (
    <div className="actv-terminal mx-auto max-w-[1640px] px-4 py-4 sm:px-6 lg:px-8">

      {/* ── Control bar ── */}
      <div
        className="mb-3 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-20 z-20 actv-card"
        style={{ borderLeft: `4px solid ${ACCENT}`, borderRadius: '0.25rem', boxShadow: '0 2px 8px rgba(11,39,68,0.08)' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="actv-pill"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: 12, padding: '4px 10px', fontWeight: 700,
              background: 'rgba(14,116,144,0.1)', color: ACCENT, border: '1px solid rgba(14,116,144,0.35)',
            }}
          >
            <span
              style={{
                display: 'inline-block', width: 8, height: 8, borderRadius: 999,
                background: ACCENT,
                animation: complete ? 'none' : 'actv-signal-pulse 1.8s ease-in-out infinite',
              }}
            />
            {complete ? 'Sync Complete' : 'Sync Active'}
          </span>
          <span className="actv-eyebrow" style={{ fontSize: 12 }}>{scenario.request_id}</span>
          <span className="font-mono actv-text-dim" style={{ fontSize: 13 }}>
            Step{' '}
            <span style={{ color: ACCENT, fontWeight: 700 }}>{currentStep}/{totalSteps}</span>
            <span className="mx-2 actv-text-soft">·</span>
            <span className="actv-text">{currentStepLabel}</span>
          </span>
          <div
            aria-hidden
            className="actv-progress-track"
            style={{ width: 160, height: 6, borderRadius: 999, overflow: 'hidden' }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, Math.round(((complete ? events.length : state.cursor) / Math.max(1, events.length)) * 100)))}%`,
                height: '100%',
                background: complete ? '#16a34a' : ACCENT,
                transition: 'width 220ms ease, background 200ms ease',
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="actv-btn" onClick={() => setPlaying((p) => !p)} disabled={complete}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="actv-btn" onClick={cycleSpeed}>
            {speed}x
          </button>
          <button className="actv-btn" onClick={reset}>
            Restart
          </button>
          <Link to="/architecture" className="actv-btn">
            Back
          </Link>
        </div>
      </div>

      {/* ── Question + trigger banner (compact single row) ── */}
      <div className="mb-3 px-4 py-2.5 actv-card border-l-4 flex items-center gap-5 flex-wrap" style={{ borderLeftColor: ACCENT }}>
        <div className="min-w-0 flex-shrink" style={{ flex: '1 1 460px' }}>
          <div className="actv-eyebrow" style={{ fontSize: 10, marginBottom: 2, color: ACCENT }}>
            Assessment Shock, No Appeal · {scenario.timezone_label} · {scenario.requested_by}
          </div>
          <p className="font-serif font-medium actv-text-strong leading-snug truncate" style={{ fontSize: 16 }} title={scenario.question}>
            &ldquo;{scenario.question}&rdquo;
          </p>
        </div>
        <div className="font-mono actv-text-dim shrink-0" style={{ fontSize: 11 }}>
          Source: <span style={{ color: ACCENT, fontWeight: 700 }}>{scenario.source_model}</span>
          <span className="mx-2 actv-text-soft">&rarr;</span>
          <span style={{ color: ACCENT, fontWeight: 700 }}>{scenario.destination_system}</span>
        </div>
      </div>

      {/* ── Step rail (5 columns) ── */}
      <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        {STEP_DEFS.map((s, idx) => {
          const num = idx + 1;
          const done = currentStep > num || (currentStep === num && complete);
          const active = currentStep === num && !complete;
          const accentColor = active ? ACCENT : done ? '#16a34a' : 'rgba(148,163,184,0.4)';
          return (
            <div
              key={s.label}
              className="actv-card px-2.5 py-2 flex flex-col gap-0.5"
              style={{
                borderLeft: `4px solid ${accentColor}`,
                background: active ? 'rgba(14,116,144,0.10)' : done ? 'rgba(74,222,128,0.10)' : undefined,
              }}
              title={`${s.who} · ${s.tools}`}
            >
              <div
                className="font-mono font-bold flex items-center gap-1.5"
                style={{ fontSize: 10, letterSpacing: '0.04em', color: active ? ACCENT : done ? '#4ade80' : 'rgba(148,163,184,0.7)' }}
              >
                <span>STEP {String(num).padStart(2, '0')}</span>
                <span style={{ opacity: 0.6 }}>·</span>
                <span>{done ? 'DONE' : active ? 'NOW' : 'WAIT'}</span>
              </div>
              <div className="font-semibold actv-text-strong truncate" style={{ fontSize: 13, lineHeight: 1.15 }}>
                {s.label}
              </div>
              <div
                className="font-mono truncate"
                style={{ fontSize: 10, lineHeight: 1.25, color: active ? ACCENT : done ? '#4ade80' : 'rgba(148,163,184,0.7)', opacity: done || active ? 0.95 : 0.55 }}
                title={s.insight}
              >
                {s.insight}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.25fr)' }}>

        {/* ── LEFT: Sub-agent narration ── */}
        <section className="actv-card flex flex-col min-h-[60vh] lg:min-h-[300px] lg:h-[calc(100dvh-440px)]">
          <header className="px-5 py-3 border-b actv-line flex items-center justify-between">
            <div>
              <div className="actv-eyebrow" style={{ fontSize: 11 }}>Sub-agent narration</div>
              <div className="font-mono mt-0.5 actv-text-dim" style={{ fontSize: 12 }}>
                {scenario.company} · Activations live sync
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agents.map((a) => (
                <AgentBadge key={a.id} agent={a} active={activeAgentId === a.id} size={36} />
              ))}
            </div>
          </header>

          <div
            ref={narrPanelRef}
            className="px-5 py-4 overflow-y-auto flex-1 actv-scroll-surface"
            style={{ overscrollBehavior: 'contain', fontSize: 14, lineHeight: 1.55 }}
          >
            {visibleNarr.map((m, idx) => {
              const a = agentById[m.e.from];
              const color = a?.color ?? ACCENT;
              const isTyping = m.isCurrent && playing && state.narrTyped < m.e.body.length;
              return (
                <div
                  key={idx}
                  className="actv-narr-card"
                  style={{
                    borderLeftColor: color,
                    borderLeftWidth: 3,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, padding: '12px 14px 12px 0' }}>
                    <div style={{ paddingTop: 2, flexShrink: 0 }}>
                      <AgentBadge agent={a} active={isTyping} size={40} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-mono font-semibold" style={{ color, fontSize: 13, letterSpacing: '0.02em' }}>
                          {a?.name ?? m.e.from}
                        </span>
                        <span
                          className="actv-pill"
                          style={{ fontSize: 10, padding: '2px 7px', fontWeight: 700, background: 'rgba(14,116,144,0.10)', color: ACCENT, border: '1px solid rgba(14,116,144,0.35)' }}
                        >
                          STEP {m.e.step}
                        </span>
                        <span className="font-mono actv-text-soft" style={{ fontSize: 11 }}>{m.e.step_label}</span>
                      </div>
                      <div className={isTyping ? 'actv-chat-bubble actv-chat-cursor' : 'actv-chat-bubble'}>
                        {m.body}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── RIGHT: Single live code panel (SQL or JSON, per step) ── */}
        <section className="flex flex-col gap-3 min-h-[60vh] lg:min-h-[300px] lg:h-[calc(100dvh-440px)]" style={{ minWidth: 0 }}>
          <div className="actv-card flex flex-col" style={{ flex: '1 1 0', minHeight: 0 }}>
            <header className="px-5 py-3 border-b actv-line flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <div className="actv-eyebrow font-mono" style={{ fontSize: 11, letterSpacing: '0.02em' }}>{codeLabel}</div>
                <span
                  className="actv-layer-chip"
                  style={{ color: ACCENT, background: 'rgba(14,116,144,0.07)', border: '1px solid rgba(14,116,144,0.3)', fontSize: 10, padding: '3px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  {currentEvent?.from ? `${agentById[currentEvent.from]?.name ?? currentEvent.from} authoring` : 'Awaiting sync'}
                </span>
              </div>
              <span className="font-mono actv-text-soft" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {codeSoFar.length.toLocaleString()} chars
              </span>
            </header>
            <pre
              ref={codePanelRef}
              className="flex-1 actv-code"
              style={{
                fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
                fontSize: 14, lineHeight: 1.6,
                border: 'none', margin: 0, padding: '1.25rem',
                overflowX: 'auto', overflowY: 'auto',
                whiteSpace: 'pre', tabSize: 2,
                overscrollBehavior: 'contain',
                borderBottomLeftRadius: '0.25rem',
                borderBottomRightRadius: '0.25rem',
                minHeight: 0,
              }}
            >
              {codeSoFar.length === 0 ? (
                <span style={{ color: '#5a7099' }}>{'-- waiting for the next stage to author...'}</span>
              ) : currentEvent?.code_target === 'sql' ? (
                <SyntaxSql text={codeSoFar} cursor={state.codeTyped > 0 && state.codeTyped < (currentEvent.code_append?.length ?? 0)} />
              ) : (
                <SyntaxJson text={codeSoFar} cursor={state.codeTyped > 0 && state.codeTyped < (currentEvent?.code_append?.length ?? 0)} />
              )}
            </pre>
          </div>
        </section>
      </div>

      {/* ── Full-width tool side effects ticker (compact) ── */}
      <div className="actv-card mt-3 px-3 py-2 flex items-center gap-3">
        <div className="actv-eyebrow shrink-0" style={{ fontSize: 10 }}>sync events</div>
        {state.sideEffects.length === 0 ? (
          <div className="font-mono actv-text-soft" style={{ fontSize: 11.5 }}>Awaiting first sync event...</div>
        ) : (
          <ul className="flex items-center gap-x-4 gap-y-1 flex-wrap min-w-0">
            {state.sideEffects.slice(0, 4).map((s, i) => (
              <li key={`${s}-${i}`} className="flex items-center gap-1.5 font-mono actv-text truncate" style={{ fontSize: 11.5, maxWidth: '32ch' }} title={s}>
                <span
                  style={{
                    display: 'inline-block', width: 7, height: 7, borderRadius: 999, flexShrink: 0,
                    background: i === 0 ? ACCENT : 'rgba(148,163,184,0.7)',
                    animation: i === 0 ? 'actv-signal-pulse 1.8s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="truncate">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Sync complete: destination confirmation payoff ── */}
      {complete && (
        <div className="mt-6 actv-card p-5" style={{ borderLeft: '5px solid #16a34a', background: 'rgba(74,222,128,0.08)' }}>
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className="actv-pill shrink-0"
                style={{ display: 'inline-flex', fontSize: 12, padding: '4px 10px', fontWeight: 700, background: 'rgba(20,94,54,0.12)', color: '#16a34a', border: '1px solid rgba(20,94,54,0.35)' }}
              >
                Sync Complete
              </div>
              <span className="actv-eyebrow" style={{ fontSize: 11 }}>{scenario.request_id} · {scenario.company}</span>
            </div>
            <Link
              to="/architecture"
              className="inline-flex items-center gap-2 rounded-sm font-semibold transition-colors"
              style={{ background: ACCENT, color: '#fff', padding: '10px 18px', fontSize: 13 }}
            >
              Back to architecture
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <DestinationConfirmationTable scenario={scenario} records={ACTIVATION_RECORDS} />
        </div>
      )}

      {/* Self-contained terminal aesthetic — scoped to this page, doesn't depend
          on any shared card class elsewhere in the app. */}
      <style>{`
        @keyframes actv-signal-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.28; }
        }

        .actv-terminal {
          --t-bg:       #0a1424;
          --t-surface:  #0f1f36;
          --t-elev:     #142844;
          --t-line:     #1f3559;
          --t-line-soft:#15294a;
          --t-text:     #e6edf8;
          --t-text-dim: #b6c6dd;
          --t-text-soft:#7a90b3;
          --t-text-strong: #ffffff;
          background: var(--t-bg);
          color: var(--t-text);
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          border-radius: 10px;
          border: 1px solid var(--t-line);
          padding-top: 28px;
          position: relative;
          margin-top: 4px;
          margin-bottom: 12px;
          box-shadow: 0 18px 40px -22px rgba(0, 0, 0, 0.55);
        }
        /* Window chrome — traffic lights + filename */
        .actv-terminal::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 28px;
          background: linear-gradient(180deg, #0d1c33, #0a1424);
          border-bottom: 1px solid var(--t-line);
          border-top-left-radius: 9px;
          border-top-right-radius: 9px;
        }
        .actv-terminal::after {
          content: 'allegheny-county-tax/activations-live · NewCo Activations';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 28px;
          display: flex;
          align-items: center;
          font-size: 11.5px;
          font-family: "IBM Plex Mono", monospace;
          background:
            radial-gradient(circle at 14px 14px, #ff5f57 5px, transparent 5.5px),
            radial-gradient(circle at 30px 14px, #febc2e 5px, transparent 5.5px),
            radial-gradient(circle at 46px 14px, #28c940 5px, transparent 5.5px);
          color: var(--t-text-dim);
          text-indent: 64px;
          letter-spacing: 0.02em;
          pointer-events: none;
        }
        .actv-terminal > * { position: relative; z-index: 1; }

        .actv-terminal .actv-card {
          background: var(--t-surface);
          border: 1px solid var(--t-line);
          color: var(--t-text);
          border-radius: 0.25rem;
        }
        .actv-terminal .actv-line { border-color: var(--t-line) !important; background: var(--t-elev); }
        .actv-terminal .actv-scroll-surface { background: var(--t-bg); }
        .actv-terminal .actv-narr-card {
          background: var(--t-elev);
          border: 1px solid var(--t-line-soft);
          color: var(--t-text);
          border-left-style: solid;
          border-top-right-radius: 4px;
          border-bottom-right-radius: 4px;
        }
        .actv-terminal .actv-text        { color: var(--t-text); }
        .actv-terminal .actv-text-strong { color: var(--t-text-strong); }
        .actv-terminal .actv-text-dim    { color: var(--t-text-dim); }
        .actv-terminal .actv-text-soft   { color: var(--t-text-soft); }

        .actv-terminal .actv-pill,
        .actv-terminal .actv-layer-chip {
          border-radius: 3px;
        }
        .actv-terminal .actv-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          border-radius: 0.125rem;
          font-weight: 600;
          border: 1px solid var(--t-line);
          background: var(--t-elev);
          color: var(--t-text);
          padding: 7px 14px;
          font-size: 13px;
          transition: all 150ms ease;
        }
        .actv-terminal .actv-btn:hover:not(:disabled) {
          background: var(--t-line);
          border-color: ${ACCENT};
        }
        .actv-terminal .actv-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .actv-terminal .actv-eyebrow {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: ${ACCENT};
          opacity: 0.9;
        }
        .actv-terminal .actv-progress-track {
          background: var(--t-elev);
          border: 1px solid var(--t-line);
        }
        .actv-terminal .actv-thead { background: var(--t-elev); border-bottom: 1px solid var(--t-line); }
        .actv-terminal .actv-tbody > tr { border-bottom: 1px solid var(--t-line-soft); }
        .actv-terminal .actv-avatar {
          background: rgba(10,20,36,0.6);
        }
        .actv-terminal .actv-avatar[data-active="true"] {
          background: var(--t-bg);
        }
        .actv-chat-bubble {
          font-family: "IBM Plex Mono", monospace;
          font-size: 14.5px;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .actv-chat-cursor::after {
          content: '▌';
          display: inline-block;
          margin-left: 2px;
          color: ${ACCENT};
          animation: actv-cursor-blink 0.9s steps(2, start) infinite;
        }
        @keyframes actv-cursor-blink {
          to { visibility: hidden; }
        }
        .actv-code-cursor::after {
          content: '▌';
          color: ${ACCENT};
          animation: actv-cursor-blink 0.9s steps(2, start) infinite;
        }
        .actv-terminal .actv-code {
          background: var(--t-bg);
          color: #d6e3f6;
          border-top: 1px solid var(--t-line);
        }
        .atok-kw    { color: #79b8ff; font-weight: 600; }
        .atok-str   { color: #4ade80; }
        .atok-com   { color: #7a8fa8; font-style: italic; }
        .atok-num   { color: #f59e0b; }
        .atok-jinja { color: #e879b8; font-weight: 600; }
      `}</style>
    </div>
  );
}
