// Types for the Activations live-sync playback experience.
// Mirrors the shape used across the sibling ODI demos (Clarity Health,
// Verity Insurance, Altavest Capital) but for an Allegheny County Tax
// Activations sync run instead of a dbt-wizard build. Content lives inline
// in ActivationLivePage.tsx as local consts — no fetch, no public/data JSON.

export type ActivationAgentId = 'segment' | 'mapper' | 'sync' | 'system';

export interface ActivationAgent {
  id: Exclude<ActivationAgentId, 'system'>;
  name: string;
  code: string;
  color: string;
  role: string;
  tools: string[];
}

export type ActivationCodeTarget = 'sql' | 'json';

export interface ActivationEvent {
  from: ActivationAgentId;
  step: number;               // 1..5
  step_label: string;
  body: string;                // narration, typed char-by-char
  side_effect?: string;
  code_target?: ActivationCodeTarget;
  code_append?: string;
}

export interface ActivationScenario {
  company: string;
  request_id: string;
  requested_by: string;
  requested_at: string;
  timezone_label: string;
  question: string;            // business trigger, framed as a request
  source_model: string;        // gold model queried
  destination_system: string;  // e.g. "Granicus GovDelivery"
  destination_object: string;  // e.g. "Assessment_Shock_Subscribers"
  sync_mode: 'upsert' | 'insert' | 'update';
  record_count: number;
  build_room_seconds: number;
}

export interface ActivationRecord {
  key: string;                              // primary match key (external id)
  fields: Record<string, string | number>;  // destination-object field values
  status: 'created' | 'updated' | 'skipped';
}
