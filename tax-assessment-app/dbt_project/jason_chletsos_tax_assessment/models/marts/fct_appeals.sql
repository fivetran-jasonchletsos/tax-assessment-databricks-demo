{#
  ============================================================
  Owner: jason_chletsos
  Model: fct_appeals
  Description: Gold-layer fact table — one row per appeal.
               Materializes stg_appeals into the marts schema so
               downstream consumers (snapshot exporter, FastAPI)
               never reach into the staging schema.
  ============================================================
#}

select
    appeal_id,
    assessment_id,
    parcel_id,
    filed_date,
    hearing_date,
    appeal_status,
    original_value,
    requested_value,
    final_value,
    value_reduction,
    reduction_percentage,
    resolution_notes,
    created_at,
    updated_at
from {{ ref('stg_appeals') }}
