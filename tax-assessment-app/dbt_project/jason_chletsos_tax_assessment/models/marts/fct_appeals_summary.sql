{#
  ============================================================
  Owner: jason_chletsos
  Model: fct_appeals_summary
  Description: Appeal summary metrics by parcel
  ============================================================
#}

with appeals as (
    select * from {{ ref('stg_appeals') }}
),

final as (
    select
        parcel_id,
        
        -- Total appeals
        count(*) as total_appeals,
        
        -- By status
        sum(case when appeal_status = 'filed' then 1 else 0 end) as filed_count,
        sum(case when appeal_status = 'scheduled' then 1 else 0 end) as scheduled_count,
        sum(case when appeal_status = 'approved' then 1 else 0 end) as approved_count,
        sum(case when appeal_status = 'denied' then 1 else 0 end) as denied_count,
        sum(case when appeal_status = 'withdrawn' then 1 else 0 end) as withdrawn_count,
        
        -- Success metrics
        case 
            when count(*) > 0 then
                round((sum(case when appeal_status = 'approved' then 1 else 0 end) / count(*)) * 100, 2)
            else 0
        end as success_rate_pct,
        
        -- Value reductions
        avg(value_reduction) as avg_value_reduction,
        sum(value_reduction) as total_value_reduction,
        max(value_reduction) as max_value_reduction,
        
        -- Reduction percentages
        avg(reduction_percentage) as avg_reduction_pct,
        max(reduction_percentage) as max_reduction_pct,
        
        -- Dates
        min(filed_date) as first_appeal_date,
        max(filed_date) as most_recent_appeal_date,
        
        -- Most recent appeal details
        max_by(appeal_status, filed_date) as latest_appeal_status,
        max_by(value_reduction, filed_date) as latest_value_reduction,
        
        -- Metadata
        current_timestamp() as dbt_updated_at
        
    from appeals
    group by parcel_id
)

select * from final
