{#
  ============================================================
  Owner: jason_chletsos
  Model: stg_parcels
  Description: Staging model for parcel data - clean and type
  ============================================================
#}

with source as (
    select * from {{ source('jason_chletsos_wprdc', 'parcels') }}
),

cleaned as (
    select
        -- Primary key
        parcel_id,
        
        -- Address fields - trim and uppercase
        trim(upper(address)) as address,
        trim(upper(city)) as city,
        trim(zip) as zip_code,
        trim(upper(county)) as county,
        
        -- Property characteristics
        trim(upper(land_use_code)) as land_use_code,
        cast(acreage as decimal(10,2)) as acreage,
        
        -- Geolocation
        cast(latitude as decimal(10,6)) as latitude,
        cast(longitude as decimal(10,6)) as longitude,
        
        -- Metadata
        cast(created_at as timestamp) as created_at,
        cast(updated_at as timestamp) as updated_at
        
    from source
    where parcel_id is not null
)

select * from cleaned
