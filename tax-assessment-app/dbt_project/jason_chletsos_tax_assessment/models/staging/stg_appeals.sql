{#
  ============================================================
  Owner: jason_chletsos
  Model: stg_appeals
  Description: Staging model for appeal data with status validation
  ============================================================
#}

with source as (
    select * from {{ source('jason_chletsos_raw_wprdc', 'appeals') }}
),

cleaned as (
    select
        -- Primary key
        appeal_id,
        
        -- Foreign keys
        assessment_id,
        parcel_id,
        
        -- Dates
        cast(filed_date as date) as filed_date,
        cast(hearing_date as date) as hearing_date,
        
        -- Status - validate against allowed values
        trim(lower(appeal_status)) as appeal_status,
        
        -- Values (stored in cents)
        cast(original_value as bigint) as original_value_cents,
        cast(requested_value as bigint) as requested_value_cents,
        cast(final_value as bigint) as final_value_cents,
        
        -- Convert to dollars
        {{ cents_to_dollars('original_value') }} as original_value,
        {{ cents_to_dollars('requested_value') }} as requested_value,
        {{ cents_to_dollars('final_value') }} as final_value,
        
        -- Calculate reduction amount and percentage
        {{ cents_to_dollars('original_value - coalesce(final_value, original_value)') }} as value_reduction,
        case 
            when original_value > 0 then
                round(((original_value - coalesce(final_value, original_value)) / original_value::float) * 100, 2)
            else 0
        end as reduction_percentage,
        
        -- Notes
        trim(resolution_notes) as resolution_notes,
        
        -- Metadata
        cast(created_at as timestamp) as created_at,
        cast(updated_at as timestamp) as updated_at
        
    from source
    where appeal_id is not null
      -- Validate status
      and trim(lower(appeal_status)) in ('filed', 'scheduled', 'approved', 'denied', 'withdrawn')
)

select * from cleaned
