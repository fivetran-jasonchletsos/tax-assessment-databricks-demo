// ============================================================
// Shared types mirroring the FastAPI backend response shapes
// (backend/main.py — Allegheny County Tax Assessment API)
// ============================================================

export interface SummaryStats {
  total_parcels: number;
  avg_assessed_value: number;
  total_exemptions: number;
  current_tax_year: number;
}

export interface ParcelSearchResult {
  parcel_id: string;
  address: string;
  city: string;
  zip_code: string;
  current_owner_name: string | null;
  land_use_description: string | null;
  tax_year: number;
  assessed_value: number;
  market_value: number;
  total_exemption_amount: number | null;
  assessed_value_change_pct: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ParcelSearchResponse {
  count: number;
  results: ParcelSearchResult[];
}

export interface ParcelDetail {
  parcel_id: string;
  address: string;
  city: string;
  zip_code: string;
  county: string;
  current_owner_name: string | null;
  current_mailing_address: string | null;
  current_ownership_type: string | null;
  land_use_code: string | null;
  land_use_description: string | null;
  acreage: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface AssessmentRow {
  tax_year: number;
  assessed_value: number;
  market_value: number;
  land_value: number;
  improvement_value: number;
  land_value_percentage: number | null;
  improvement_value_percentage: number | null;
  market_to_assessed_ratio: number | null;
  assessed_value_change: number | null;
  assessed_value_change_pct: number | null;
  total_exemption_amount: number | null;
  net_assessed_value: number | null;
  assessment_date: string | null;
}

export interface AssessmentsResponse {
  parcel_id: string;
  assessments: AssessmentRow[];
}

export interface ExemptionRow {
  tax_year: number;
  total_exemption_amount: number;
  total_exemption_count: number;
  homestead_exemption_amount: number;
  senior_exemption_amount: number;
  veteran_exemption_amount: number;
  disability_exemption_amount: number;
  homestead_count: number;
  senior_count: number;
  veteran_count: number;
  disability_count: number;
  active_exemptions: number;
  pending_exemptions: number;
  expired_exemptions: number;
  exemption_types: string | null;
}

export interface ExemptionsResponse {
  parcel_id: string;
  exemptions: ExemptionRow[];
}

export interface AppealRow {
  appeal_id: string;
  filed_date: string;
  hearing_date: string | null;
  appeal_status: string;
  original_value: number;
  requested_value: number;
  final_value: number | null;
  value_reduction: number | null;
  reduction_percentage: number | null;
  resolution_notes: string | null;
}

export interface AppealsSummary {
  total_appeals: number;
  approved_count: number;
  denied_count: number;
  success_rate_pct: number;
  avg_value_reduction: number;
  total_value_reduction: number;
  first_appeal_date: string;
  most_recent_appeal_date: string;
  latest_appeal_status: string;
}

export interface AppealsResponse {
  parcel_id: string;
  summary: Partial<AppealsSummary>;
  appeals: AppealRow[];
}

export interface ComparableRow {
  parcel_id: string;
  address: string;
  city: string;
  zip_code: string;
  current_owner_name: string | null;
  land_use_description: string | null;
  acreage: number | null;
  assessed_value: number;
  market_value: number;
  assessed_value_change_pct: number | null;
  distance_miles: number;
}

export interface ComparablesResponse {
  parcel_id: string;
  comparables: ComparableRow[];
}
