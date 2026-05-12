// ============================================================
// Demo fallback data — used when the FastAPI/Databricks backend
// is unreachable, so the showcase always renders something.
//
// Numbers reflect realistic Allegheny County (Pittsburgh) parcels.
// ============================================================

import type {
  SummaryStats,
  ParcelSearchResult,
  ParcelSearchResponse,
  ParcelDetail,
  AssessmentsResponse,
  ExemptionsResponse,
  AppealsResponse,
  ComparablesResponse,
} from '../types';

export const mockSummary: SummaryStats = {
  total_parcels: 583_412,
  avg_assessed_value: 187_450.32,
  total_exemptions: 412_300_000,
  current_tax_year: 2025,
};

const baseParcels: ParcelSearchResult[] = [
  {
    parcel_id: '0001-A-00150',
    address: '5527 Forbes Ave',
    city: 'PITTSBURGH',
    zip_code: '15217',
    current_owner_name: 'Greene, Margaret L',
    land_use_description: 'Single Family Residential',
    tax_year: 2025,
    assessed_value: 312_500,
    market_value: 405_000,
    total_exemption_amount: 18_000,
    assessed_value_change_pct: 4.8,
    latitude: 40.4378,
    longitude: -79.9301,
  },
  {
    parcel_id: '0001-A-00151',
    address: '5529 Forbes Ave',
    city: 'PITTSBURGH',
    zip_code: '15217',
    current_owner_name: 'Patel, Anil & Reshma',
    land_use_description: 'Single Family Residential',
    tax_year: 2025,
    assessed_value: 298_100,
    market_value: 388_400,
    total_exemption_amount: 0,
    assessed_value_change_pct: 6.2,
    latitude: 40.4380,
    longitude: -79.9295,
  },
  {
    parcel_id: '0014-D-00042',
    address: '1218 Liberty Ave',
    city: 'PITTSBURGH',
    zip_code: '15222',
    current_owner_name: 'Liberty Holdings LLC',
    land_use_description: 'Commercial — Mixed Use',
    tax_year: 2025,
    assessed_value: 1_245_000,
    market_value: 1_510_000,
    total_exemption_amount: 0,
    assessed_value_change_pct: 2.1,
    latitude: 40.4435,
    longitude: -79.9968,
  },
  {
    parcel_id: '0102-N-00007',
    address: '328 Beechwood Blvd',
    city: 'PITTSBURGH',
    zip_code: '15206',
    current_owner_name: 'Okonkwo, Daniel',
    land_use_description: 'Single Family Residential',
    tax_year: 2025,
    assessed_value: 425_700,
    market_value: 552_200,
    total_exemption_amount: 25_500,
    assessed_value_change_pct: 8.9,
    latitude: 40.4612,
    longitude: -79.9148,
  },
  {
    parcel_id: '0244-K-00091',
    address: '702 Cedar Ave',
    city: 'PITTSBURGH',
    zip_code: '15212',
    current_owner_name: 'Northside Community Trust',
    land_use_description: 'Multi-Family Residential',
    tax_year: 2025,
    assessed_value: 689_000,
    market_value: 802_000,
    total_exemption_amount: 0,
    assessed_value_change_pct: -1.4,
    latitude: 40.4543,
    longitude: -80.0078,
  },
  {
    parcel_id: '0517-G-00210',
    address: '14 Brilliant Ave',
    city: 'ASPINWALL',
    zip_code: '15215',
    current_owner_name: 'Hernandez, Sofia',
    land_use_description: 'Single Family Residential',
    tax_year: 2025,
    assessed_value: 358_900,
    market_value: 442_000,
    total_exemption_amount: 18_000,
    assessed_value_change_pct: 5.3,
    latitude: 40.4923,
    longitude: -79.9051,
  },
  {
    parcel_id: '0822-C-00038',
    address: '2010 Murray Ave',
    city: 'PITTSBURGH',
    zip_code: '15217',
    current_owner_name: 'Squirrel Hill Bakery Co',
    land_use_description: 'Commercial — Retail',
    tax_year: 2025,
    assessed_value: 545_000,
    market_value: 640_000,
    total_exemption_amount: 0,
    assessed_value_change_pct: 3.0,
    latitude: 40.4358,
    longitude: -79.9230,
  },
  {
    parcel_id: '1408-R-00012',
    address: '88 Highland Dr',
    city: 'MT LEBANON',
    zip_code: '15228',
    current_owner_name: 'Walsh, Robert & Linda',
    land_use_description: 'Single Family Residential',
    tax_year: 2025,
    assessed_value: 482_300,
    market_value: 598_400,
    total_exemption_amount: 43_500,
    assessed_value_change_pct: 7.1,
    latitude: 40.3756,
    longitude: -80.0509,
  },
];

export const mockSearchResponse: ParcelSearchResponse = {
  count: baseParcels.length,
  results: baseParcels,
};

export function mockParcelDetail(parcelId: string): ParcelDetail {
  const base = baseParcels.find((p) => p.parcel_id === parcelId) ?? baseParcels[0];
  return {
    parcel_id: base.parcel_id,
    address: base.address,
    city: base.city,
    zip_code: base.zip_code,
    county: 'Allegheny',
    current_owner_name: base.current_owner_name,
    current_mailing_address: `${base.address}, ${base.city}, PA ${base.zip_code}`,
    current_ownership_type: 'Individual',
    land_use_code: 'R-1',
    land_use_description: base.land_use_description,
    acreage: 0.18,
    latitude: base.latitude,
    longitude: base.longitude,
  };
}

export function mockAssessments(parcelId: string): AssessmentsResponse {
  const base = baseParcels.find((p) => p.parcel_id === parcelId) ?? baseParcels[0];
  const current = base.assessed_value;
  const years = [2025, 2024, 2023, 2022, 2021, 2020];
  let val = current;
  const rows = years.map((year, i) => {
    const prev = val;
    val = i === 0 ? current : Math.round(prev / (1 + (0.05 - i * 0.005)));
    const market = Math.round(val * 1.29);
    const land = Math.round(val * 0.22);
    const improvement = val - land;
    const change = i === years.length - 1 ? 0 : prev - val;
    return {
      tax_year: year,
      assessed_value: i === 0 ? current : val,
      market_value: market,
      land_value: land,
      improvement_value: improvement,
      land_value_percentage: 22,
      improvement_value_percentage: 78,
      market_to_assessed_ratio: 1.29,
      assessed_value_change: change,
      assessed_value_change_pct: i === years.length - 1 ? 0 : (change / val) * 100,
      total_exemption_amount: base.total_exemption_amount,
      net_assessed_value: val - (base.total_exemption_amount ?? 0),
      assessment_date: `${year}-01-15`,
    };
  });
  return { parcel_id: base.parcel_id, assessments: rows };
}

export function mockExemptions(parcelId: string): ExemptionsResponse {
  const base = baseParcels.find((p) => p.parcel_id === parcelId) ?? baseParcels[0];
  const hasExemptions = (base.total_exemption_amount ?? 0) > 0;
  if (!hasExemptions) return { parcel_id: base.parcel_id, exemptions: [] };

  const homestead = 18_000;
  const senior = Math.max(0, (base.total_exemption_amount ?? 0) - homestead);
  return {
    parcel_id: base.parcel_id,
    exemptions: [2025, 2024, 2023].map((year) => ({
      tax_year: year,
      total_exemption_amount: base.total_exemption_amount ?? 0,
      total_exemption_count: senior > 0 ? 2 : 1,
      homestead_exemption_amount: homestead,
      senior_exemption_amount: senior,
      veteran_exemption_amount: 0,
      disability_exemption_amount: 0,
      homestead_count: 1,
      senior_count: senior > 0 ? 1 : 0,
      veteran_count: 0,
      disability_count: 0,
      active_exemptions: senior > 0 ? 2 : 1,
      pending_exemptions: 0,
      expired_exemptions: 0,
      exemption_types: senior > 0 ? 'HOMESTEAD, SENIOR' : 'HOMESTEAD',
    })),
  };
}

export function mockAppeals(parcelId: string): AppealsResponse {
  const base = baseParcels.find((p) => p.parcel_id === parcelId) ?? baseParcels[0];
  // Only some parcels have appeals
  if (!['0001-A-00150', '0102-N-00007', '0014-D-00042'].includes(base.parcel_id)) {
    return { parcel_id: base.parcel_id, summary: {}, appeals: [] };
  }
  const appeals = [
    {
      appeal_id: `APP-${base.parcel_id}-2024-01`,
      filed_date: '2024-03-12',
      hearing_date: '2024-06-08',
      appeal_status: 'APPROVED',
      original_value: Math.round(base.assessed_value * 1.08),
      requested_value: Math.round(base.assessed_value * 0.95),
      final_value: base.assessed_value,
      value_reduction: Math.round(base.assessed_value * 0.08),
      reduction_percentage: 7.4,
      resolution_notes: 'Board of Property Assessment Appeals reduced based on comparable sales evidence.',
    },
  ];
  return {
    parcel_id: base.parcel_id,
    summary: {
      total_appeals: 1,
      approved_count: 1,
      denied_count: 0,
      success_rate_pct: 100,
      avg_value_reduction: appeals[0].value_reduction!,
      total_value_reduction: appeals[0].value_reduction!,
      first_appeal_date: appeals[0].filed_date,
      most_recent_appeal_date: appeals[0].filed_date,
      latest_appeal_status: 'APPROVED',
    },
    appeals,
  };
}

export function mockComparables(parcelId: string): ComparablesResponse {
  const base = baseParcels.find((p) => p.parcel_id === parcelId) ?? baseParcels[0];
  const others = baseParcels.filter((p) => p.parcel_id !== base.parcel_id).slice(0, 5);
  return {
    parcel_id: base.parcel_id,
    comparables: others.map((p, i) => ({
      parcel_id: p.parcel_id,
      address: p.address,
      city: p.city,
      zip_code: p.zip_code,
      current_owner_name: p.current_owner_name,
      land_use_description: p.land_use_description,
      acreage: 0.18 + i * 0.03,
      assessed_value: p.assessed_value,
      market_value: p.market_value,
      assessed_value_change_pct: p.assessed_value_change_pct,
      distance_miles: 0.3 + i * 0.4,
    })),
  };
}
