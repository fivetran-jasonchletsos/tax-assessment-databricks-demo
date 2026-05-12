{#
  ============================================================
  Owner: jason_chletsos
  Model: dim_parcels
  Description: Parcel dimension with current owner information
  ============================================================
#}

with parcels as (
    select * from {{ ref('stg_parcels') }}
),

owners as (
    select * from {{ ref('stg_owners') }}
),

-- Get most recent owner per parcel
current_owners as (
    select
        parcel_id,
        owner_name,
        mailing_address,
        ownership_type,
        effective_date,
        row_number() over (partition by parcel_id order by effective_date desc, updated_at desc) as rn
    from owners
),

final as (
    select
        -- Surrogate key
        md5(concat(coalesce(p.parcel_id, ''))) as parcel_key,
        
        -- Natural key
        p.parcel_id,
        
        -- Address
        p.address,
        p.city,
        p.zip_code,
        p.county,
        
        -- Property characteristics
        p.land_use_code,
        case 
            when p.land_use_code = 'RES' then 'Residential'
            when p.land_use_code = 'COM' then 'Commercial'
            when p.land_use_code = 'IND' then 'Industrial'
            when p.land_use_code = 'AGR' then 'Agricultural'
            else 'Other'
        end as land_use_description,
        p.acreage,
        
        -- Geolocation
        p.latitude,
        p.longitude,
        
        -- Current owner information
        coalesce(o.owner_name, 'UNKNOWN') as current_owner_name,
        coalesce(o.mailing_address, '') as current_mailing_address,
        coalesce(o.ownership_type, 'unknown') as current_ownership_type,
        o.effective_date as ownership_effective_date,
        
        -- Metadata
        p.created_at,
        p.updated_at,
        current_timestamp() as dbt_updated_at
        
    from parcels p
    left join current_owners o
        on p.parcel_id = o.parcel_id
        and o.rn = 1
)

select * from final
