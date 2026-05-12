{#
  ============================================================
  Owner: jason_chletsos
  Test: test_no_negative_assessed_values
  Description: Singular test to verify assessed values are never negative
  ============================================================
#}

select
    assessment_id,
    parcel_id,
    tax_year,
    assessed_value
from {{ ref('fct_assessments') }}
where assessed_value < 0
