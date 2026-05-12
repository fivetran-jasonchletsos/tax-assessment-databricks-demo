{#
  ============================================================
  Owner: jason_chletsos
  Model: stg_assessments
  Description: Staging model for assessment data
  ============================================================
#}

with source as (
    select * from {{ source('jason_chletsos_raw_wprdc', 'assessments') }}
),

cleaned as (
    select
        -- Primary key
        assessment_id,
        
        -- Foreign key
        parcel_id,
        
        -- Tax year
        cast(tax_year as integer) as tax_year,
        
        -- Values (stored in cents, keep as integer)
        cast(assessed_value as bigint) as assessed_value_cents,
        cast(market_value as bigint) as market_value_cents,
        cast(land_value as bigint) as land_value_cents,
        cast(improvement_value as bigint) as improvement_value_cents,
        
        -- Convert to dollars for convenience
        {{ cents_to_dollars('assessed_value') }} as assessed_value,
        {{ cents_to_dollars('market_value') }} as market_value,
        {{ cents_to_dollars('land_value') }} as land_value,
        {{ cents_to_dollars('improvement_value') }} as improvement_value,
        
        -- Dates
        cast(assessment_date as date) as assessment_date,
        
        -- Assessor
        trim(assessor_id) as assessor_id,
        
        -- Metadata
        cast(created_at as timestamp) as created_at,
        cast(updated_at as timestamp) as updated_at
        
    from source
    where assessment_id is not null
      and tax_year >= 2000  -- Reasonable lower bound
      and tax_year <= year(current_date()) + 1
)

select * from cleaned
