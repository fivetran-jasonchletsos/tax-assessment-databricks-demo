{#
  ============================================================
  Owner: jason_chletsos
  Model: stg_exemptions
  Description: Staging model for exemption data with validation
  ============================================================
#}

with source as (
    select * from {{ source('jason_chletsos_wprdc', 'exemptions') }}
),

cleaned as (
    select
        -- Primary key
        exemption_id,
        
        -- Foreign key
        parcel_id,
        
        -- Exemption type - validate against allowed list
        trim(lower(exemption_type)) as exemption_type,
        
        -- Amount (stored in cents)
        cast(exemption_amount as bigint) as exemption_amount_cents,
        {{ cents_to_dollars('exemption_amount') }} as exemption_amount,
        
        -- Tax year
        cast(tax_year as integer) as tax_year,
        
        -- Status
        trim(lower(coalesce(status, 'unknown'))) as status,
        
        -- Metadata
        cast(created_at as timestamp) as created_at,
        cast(updated_at as timestamp) as updated_at
        
    from source
    where exemption_id is not null
      -- Validate exemption type
      and trim(lower(exemption_type)) in ('homestead', 'senior', 'veteran', 'disability')
)

select * from cleaned
