{#
  ============================================================
  Owner: jason_chletsos
  Model: stg_owners
  Description: Staging model for owner data
  ============================================================
#}

with source as (
    select * from {{ source('jason_chletsos_wprdc', 'owners') }}
),

cleaned as (
    select
        -- Primary key
        owner_id,
        
        -- Foreign key
        parcel_id,
        
        -- Owner information - normalize names
        trim(upper(coalesce(owner_name, 'UNKNOWN'))) as owner_name,
        trim(upper(coalesce(mailing_address, ''))) as mailing_address,
        
        -- Ownership type
        trim(lower(coalesce(ownership_type, 'unknown'))) as ownership_type,
        
        -- Dates
        cast(effective_date as date) as effective_date,
        
        -- Metadata
        cast(created_at as timestamp) as created_at,
        cast(updated_at as timestamp) as updated_at
        
    from source
    where owner_id is not null
)

select * from cleaned
