// ============================================================
// "Property Insight" agent — small rule-based intent engine that
// answers natural-language questions over the snapshot bundle.
//
// Always runs offline. When the user has set an Anthropic API key
// (see AgentPage), an `askClaude()` helper is also available that
// hands the question + a small data summary to Claude for a richer
// answer. The Claude path is opt-in — nothing leaks by default.
// ============================================================

import type { ParcelSearchResult } from './types';
import {
  exemptionCoverage,
  groupByCity,
  groupByLandUse,
  groupByZip,
  outliers,
  quantile,
} from './analytics';

export interface AgentResponse {
  intent: string;
  summary: string;
  table?: { columns: string[]; rows: (string | number)[][] };
  chart?: { type: 'bar'; xKey: string; yKey: string; data: Record<string, string | number>[] };
  parcelIds?: string[];
  followUps?: string[];
  source: 'rules' | 'claude';
}

const intents: Array<{
  pattern: RegExp;
  name: string;
  handler: (m: RegExpMatchArray, parcels: ParcelSearchResult[]) => AgentResponse;
}> = [
  // ----- "biggest jumps / movers / changes"
  {
    name: 'top_movers',
    pattern: /\b(biggest|largest|top|highest)\b.+\b(jumps?|increases?|movers?|changes?|swings?|rises?)\b/i,
    handler: (_, parcels) => {
      const top = outliers(parcels, 0).slice(0, 10);
      return {
        intent: 'top_movers',
        source: 'rules',
        summary: `The ${top.length} parcels with the largest year-over-year assessment changes.`,
        table: {
          columns: ['Parcel', 'Address', 'City', 'Assessed', 'YoY %'],
          rows: top.map((p) => [
            p.parcel_id,
            p.address,
            p.city,
            `$${p.assessed_value.toLocaleString()}`,
            `${(p.assessed_value_change_pct ?? 0).toFixed(1)}%`,
          ]),
        },
        parcelIds: top.map((p) => p.parcel_id),
        followUps: [
          'Which city saw the largest rises?',
          'Show me the biggest declines',
          'How many had appeals filed?',
        ],
      };
    },
  },

  // ----- "biggest declines / drops"
  {
    name: 'top_decliners',
    pattern: /\b(biggest|largest|top|worst)\b.+\b(declines?|drops?|falls?|decreases?)\b/i,
    handler: (_, parcels) => {
      const top = [...parcels]
        .filter((p) => (p.assessed_value_change_pct ?? 0) < 0)
        .sort((a, b) => (a.assessed_value_change_pct ?? 0) - (b.assessed_value_change_pct ?? 0))
        .slice(0, 10);
      return {
        intent: 'top_decliners',
        source: 'rules',
        summary: top.length
          ? `${top.length} parcels with the steepest YoY assessment declines.`
          : 'No declining assessments in the snapshot.',
        table: top.length
          ? {
              columns: ['Parcel', 'Address', 'City', 'Assessed', 'YoY %'],
              rows: top.map((p) => [
                p.parcel_id,
                p.address,
                p.city,
                `$${p.assessed_value.toLocaleString()}`,
                `${(p.assessed_value_change_pct ?? 0).toFixed(1)}%`,
              ]),
            }
          : undefined,
        parcelIds: top.map((p) => p.parcel_id),
      };
    },
  },

  // ----- exemptions in <city/zip>
  {
    name: 'exemptions_filter',
    pattern: /\b(exempt(?:ed|ions?)?|homestead|senior|veteran|disability)\b/i,
    handler: (_, parcels) => {
      const cov = exemptionCoverage(parcels);
      const withEx = parcels.filter((p) => (p.total_exemption_amount ?? 0) > 0);
      return {
        intent: 'exemptions_filter',
        source: 'rules',
        summary: `${cov.with_exemption.toLocaleString()} of ${cov.total.toLocaleString()} parcels (${cov.coverage_pct.toFixed(1)}%) have at least one active exemption, totaling $${cov.total_exempted.toLocaleString()}.`,
        table: {
          columns: ['Parcel', 'Address', 'City', 'Exemption'],
          rows: withEx
            .slice(0, 10)
            .map((p) => [p.parcel_id, p.address, p.city, `$${(p.total_exemption_amount ?? 0).toLocaleString()}`]),
        },
        parcelIds: withEx.slice(0, 10).map((p) => p.parcel_id),
        followUps: ['Which city has the highest exemption coverage?', 'Show me appeals for these parcels'],
      };
    },
  },

  // ----- median / typical / average value [in city/zip]
  {
    name: 'typical_value',
    pattern: /\b(median|typical|average|avg|mean)\b.*\b(value|assess|price)/i,
    handler: (match, parcels) => {
      const cityMatch = match.input?.match(/\b(?:in|for|at|across)\s+([A-Z][\w\s\-']+?)(?:\s+pa)?[\s?.,]*$/i);
      const filtered = cityMatch
        ? parcels.filter((p) => p.city.toLowerCase().includes(cityMatch[1].toLowerCase().trim()))
        : parcels;
      const values = filtered.map((p) => p.assessed_value);
      const median = quantile(values, 0.5) ?? 0;
      const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
      return {
        intent: 'typical_value',
        source: 'rules',
        summary: cityMatch
          ? `Across ${filtered.length} parcels in ${cityMatch[1].trim()}: median $${median.toLocaleString()}, mean $${Math.round(mean).toLocaleString()}.`
          : `Across ${filtered.length} parcels: median $${median.toLocaleString()}, mean $${Math.round(mean).toLocaleString()}.`,
      };
    },
  },

  // ----- compare cities
  {
    name: 'compare_cities',
    pattern: /\b(compare|versus|vs\.?)\b/i,
    handler: (_, parcels) => {
      const byCity = groupByCity(parcels)
        .sort((a, b) => b.total_assessed - a.total_assessed)
        .slice(0, 8);
      return {
        intent: 'compare_cities',
        source: 'rules',
        summary: `Side-by-side comparison of the top ${byCity.length} cities by total assessed value.`,
        table: {
          columns: ['City', 'Parcels', 'Total assessed', 'Median', 'Avg YoY %', 'Exempt %'],
          rows: byCity.map((c) => [
            c.city,
            c.count,
            `$${Math.round(c.total_assessed).toLocaleString()}`,
            `$${Math.round(c.median_assessed).toLocaleString()}`,
            `${c.avg_change_pct.toFixed(2)}%`,
            `${(c.exemption_coverage * 100).toFixed(0)}%`,
          ]),
        },
        chart: {
          type: 'bar',
          xKey: 'city',
          yKey: 'median',
          data: byCity.map((c) => ({ city: c.city, median: Math.round(c.median_assessed) })),
        },
      };
    },
  },

  // ----- "land use breakdown" / "what kinds of properties"
  {
    name: 'land_use_mix',
    pattern: /\b(land use|property type|categor(?:y|ies)|mix|composition|breakdown)\b/i,
    handler: (_, parcels) => {
      const rows = groupByLandUse(parcels);
      return {
        intent: 'land_use_mix',
        source: 'rules',
        summary: `Snapshot covers ${rows.length} distinct land-use categories.`,
        table: {
          columns: ['Land use', 'Parcels', 'Total assessed', 'Median'],
          rows: rows.map((r) => [
            r.use,
            r.count,
            `$${Math.round(r.total_assessed).toLocaleString()}`,
            `$${Math.round(r.median_assessed).toLocaleString()}`,
          ]),
        },
        chart: {
          type: 'bar',
          xKey: 'use',
          yKey: 'count',
          data: rows.slice(0, 8).map((r) => ({ use: r.use, count: r.count })),
        },
      };
    },
  },

  // ----- "in zip 15217" / "ZIP 15217"
  {
    name: 'zip_filter',
    pattern: /\bzip\s*(?:code)?\s*(\d{5})/i,
    handler: (m, parcels) => {
      const zip = m[1];
      const rows = parcels.filter((p) => p.zip_code === zip);
      return {
        intent: 'zip_filter',
        source: 'rules',
        summary: rows.length
          ? `${rows.length} parcels in ZIP ${zip}. Median assessed: $${Math.round(quantile(rows.map((p) => p.assessed_value), 0.5) ?? 0).toLocaleString()}.`
          : `No parcels in ZIP ${zip} in the current snapshot.`,
        table: rows.length
          ? {
              columns: ['Parcel', 'Address', 'Owner', 'Assessed', 'YoY %'],
              rows: rows.slice(0, 25).map((p) => [
                p.parcel_id,
                p.address,
                p.current_owner_name ?? '—',
                `$${p.assessed_value.toLocaleString()}`,
                `${(p.assessed_value_change_pct ?? 0).toFixed(1)}%`,
              ]),
            }
          : undefined,
        parcelIds: rows.slice(0, 25).map((p) => p.parcel_id),
      };
    },
  },

  // ----- highest assessed properties
  {
    name: 'top_value',
    pattern: /\b(most expensive|highest valued?|priciest|biggest|largest|top)\b.*\b(properties|parcels|homes?|assessed?|values?)?\b/i,
    handler: (_, parcels) => {
      const top = [...parcels].sort((a, b) => b.assessed_value - a.assessed_value).slice(0, 10);
      return {
        intent: 'top_value',
        source: 'rules',
        summary: `Top ${top.length} parcels by assessed value in the snapshot.`,
        table: {
          columns: ['Parcel', 'Address', 'City', 'Owner', 'Assessed'],
          rows: top.map((p) => [
            p.parcel_id,
            p.address,
            p.city,
            p.current_owner_name ?? '—',
            `$${p.assessed_value.toLocaleString()}`,
          ]),
        },
        parcelIds: top.map((p) => p.parcel_id),
      };
    },
  },

  // ----- "owner: <name>" / "owned by <name>"
  {
    name: 'owner_search',
    pattern: /\b(?:owner|owned by|owner name|belongs to)\b[:\s]+([\w\s\-'&,.]+?)(?:[?.,]|$)/i,
    handler: (m, parcels) => {
      const q = m[1].trim().toLowerCase();
      const rows = parcels.filter((p) => (p.current_owner_name ?? '').toLowerCase().includes(q));
      return {
        intent: 'owner_search',
        source: 'rules',
        summary: rows.length
          ? `Found ${rows.length} parcel${rows.length === 1 ? '' : 's'} matching owner "${m[1].trim()}".`
          : `No parcels found for owner "${m[1].trim()}" in the snapshot.`,
        table: rows.length
          ? {
              columns: ['Parcel', 'Address', 'City', 'Owner', 'Assessed'],
              rows: rows.slice(0, 25).map((p) => [
                p.parcel_id,
                p.address,
                p.city,
                p.current_owner_name ?? '—',
                `$${p.assessed_value.toLocaleString()}`,
              ]),
            }
          : undefined,
        parcelIds: rows.slice(0, 25).map((p) => p.parcel_id),
      };
    },
  },
];

// ---------------------------------------------------------------------------

export function answer(question: string, parcels: ParcelSearchResult[]): AgentResponse {
  const q = question.trim();
  if (!q) {
    return {
      intent: 'empty',
      source: 'rules',
      summary: 'Ask me something — try one of the suggestions below.',
    };
  }

  for (const intent of intents) {
    const m = q.match(intent.pattern);
    if (m) return intent.handler(m, parcels);
  }

  // Free-text fallback: substring search across address/owner/parcel/city
  const lower = q.toLowerCase();
  const hits = parcels.filter(
    (p) =>
      p.address.toLowerCase().includes(lower) ||
      (p.current_owner_name ?? '').toLowerCase().includes(lower) ||
      p.parcel_id.toLowerCase().includes(lower) ||
      p.city.toLowerCase().includes(lower),
  );
  if (hits.length) {
    return {
      intent: 'substring_match',
      source: 'rules',
      summary: `${hits.length} parcels mention "${q}" in their address, owner, parcel ID, or city.`,
      table: {
        columns: ['Parcel', 'Address', 'City', 'Owner', 'Assessed'],
        rows: hits.slice(0, 25).map((p) => [
          p.parcel_id,
          p.address,
          p.city,
          p.current_owner_name ?? '—',
          `$${p.assessed_value.toLocaleString()}`,
        ]),
      },
      parcelIds: hits.slice(0, 25).map((p) => p.parcel_id),
    };
  }

  return {
    intent: 'no_match',
    source: 'rules',
    summary: `No local rule matched "${q}". Try one of the suggested questions, or enable Claude mode for richer reasoning.`,
  };
}

// ---------------------------------------------------------------------------
// Claude opt-in mode — calls Anthropic API directly from the browser.
// Requires the user's own key, stored in localStorage.
// ---------------------------------------------------------------------------

const KEY_STORAGE = 'tax-portal:anthropic-api-key';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setApiKey(key: string | null): void {
  try {
    if (key && key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // ignore
  }
}

// Concise summary of the snapshot we hand to Claude. Keep it small —
// the goal is interpretation, not raw recall.
function summariseForClaude(parcels: ParcelSearchResult[]) {
  const byCity = groupByCity(parcels)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((c) => ({
      city: c.city,
      count: c.count,
      median: Math.round(c.median_assessed),
      avg_change_pct: +c.avg_change_pct.toFixed(2),
      exempt_pct: +(c.exemption_coverage * 100).toFixed(1),
    }));
  const byZip = groupByZip(parcels)
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .map((z) => ({
      zip: z.zip,
      count: z.count,
      median: Math.round(z.median_assessed),
      avg_change_pct: +z.avg_change_pct.toFixed(2),
    }));
  return {
    parcel_count: parcels.length,
    median_assessed: Math.round(quantile(parcels.map((p) => p.assessed_value), 0.5) ?? 0),
    p90_assessed: Math.round(quantile(parcels.map((p) => p.assessed_value), 0.9) ?? 0),
    by_city: byCity,
    by_zip: byZip,
    land_use: groupByLandUse(parcels).slice(0, 8),
  };
}

const SYSTEM_PROMPT = `You are a property tax assessment analyst for Allegheny County, PA.
You answer questions about a snapshot of parcel-level data from Databricks marts.
Keep responses concise and grounded ONLY in the JSON summary provided.
If a question can't be answered from the summary, say so plainly; do not invent parcels, owners, or values.
Format dollar values like $1,245,000 and percentages like +4.8%.`;

export async function askClaude(question: string, parcels: ParcelSearchResult[]): Promise<AgentResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      intent: 'claude_no_key',
      source: 'claude',
      summary: 'Add your Anthropic API key in Settings (gear icon) to enable Claude mode.',
    };
  }

  const summary = summariseForClaude(parcels);

  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user' as const,
        content: `Snapshot summary (JSON):\n\`\`\`json\n${JSON.stringify(summary)}\n\`\`\`\n\nQuestion: ${question}`,
      },
    ],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();
  const text: string =
    payload?.content?.find((c: any) => c.type === 'text')?.text ?? '(no response)';

  return {
    intent: 'claude_response',
    source: 'claude',
    summary: text,
  };
}
