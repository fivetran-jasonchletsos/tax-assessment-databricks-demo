{#
  ============================================================
  Owner: jason_chletsos
  Model: fct_exemptions_summary
  Description: Exemption summary by parcel and year
  ============================================================
#}

with exemptions as (
    select * from {{ ref('stg_exemptions') }}
),

final as (
    select
        parcel_id,
        tax_year,
        
        -- Total exemptions
        sum(exemption_amount) as total_exemption_amount,
        count(*) as total_exemption_count,
        
        -- By type
        sum(case when exemption_type = 'homestead' then exemption_amount else 0 end) as homestead_exemption_amount,
        sum(case when exemption_type = 'senior' then exemption_amount else 0 end) as senior_exemption_amount,
        sum(case when exemption_type = 'veteran' then exemption_amount else 0 end) as veteran_exemption_amount,
        sum(case when exemption_type = 'disability' then exemption_amount else 0 end) as disability_exemption_amount,
        
        -- Counts by type
        sum(case when exemption_type = 'homestead' then 1 else 0 end) as homestead_count,
        sum(case when exemption_type = 'senior' then 1 else 0 end) as senior_count,
        sum(case when exemption_type = 'veteran' then 1 else 0 end) as veteran_count,
        sum(case when exemption_type = 'disability' then 1 else 0 end) as disability_count,
        
        -- Status breakdown
        sum(case when status = 'active' then 1 else 0 end) as active_exemptions,
        sum(case when status = 'pending' then 1 else 0 end) as pending_exemptions,
        sum(case when status = 'expired' then 1 else 0 end) as expired_exemptions,
        
        -- List of exemption types
        concat_ws(', ', collect_list(distinct exemption_type)) as exemption_types,
        
        -- Metadata
        current_timestamp() as dbt_updated_at
        
    from exemptions
    group by parcel_id, tax_year
)

select * from final
