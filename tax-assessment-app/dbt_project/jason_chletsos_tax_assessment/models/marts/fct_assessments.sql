{#
  ============================================================
  Owner: jason_chletsos
  Model: fct_assessments
  Description: Assessment fact table with YoY changes and exemptions
  ============================================================
#}

with assessments as (
    select * from {{ ref('stg_assessments') }}
),

exemptions as (
    select * from {{ ref('stg_exemptions') }}
),

-- Aggregate exemptions by parcel and tax year
exemption_totals as (
    select
        parcel_id,
        tax_year,
        sum(exemption_amount) as total_exemption_amount,
        count(*) as exemption_count,
        concat_ws(', ', collect_list(exemption_type)) as exemption_types
    from exemptions
    where status = 'active'
    group by parcel_id, tax_year
),

-- Calculate year-over-year changes
assessments_with_prior as (
    select
        a.*,
        lag(a.assessed_value) over (partition by a.parcel_id order by a.tax_year) as prior_year_assessed_value,
        lag(a.market_value) over (partition by a.parcel_id order by a.tax_year) as prior_year_market_value
    from assessments a
),

final as (
    select
        -- Surrogate key
        md5(concat(coalesce(a.assessment_id, ''))) as assessment_key,
        
        -- Natural key
        a.assessment_id,
        
        -- Foreign keys
        a.parcel_id,
        a.tax_year,
        
        -- Assessment values
        a.assessed_value,
        a.market_value,
        a.land_value,
        a.improvement_value,
        
        -- Assessment breakdown percentage
        case 
            when a.assessed_value > 0 then
                round((a.land_value / a.assessed_value) * 100, 2)
            else 0
        end as land_value_percentage,
        case 
            when a.assessed_value > 0 then
                round((a.improvement_value / a.assessed_value) * 100, 2)
            else 0
        end as improvement_value_percentage,
        
        -- Market to assessed ratio
        case 
            when a.assessed_value > 0 then
                round(a.market_value / a.assessed_value, 4)
            else null
        end as market_to_assessed_ratio,
        
        -- Year-over-year changes
        a.prior_year_assessed_value,
        a.assessed_value - coalesce(a.prior_year_assessed_value, a.assessed_value) as assessed_value_change,
        case 
            when a.prior_year_assessed_value > 0 then
                round(((a.assessed_value - a.prior_year_assessed_value) / a.prior_year_assessed_value) * 100, 2)
            else 0
        end as assessed_value_change_pct,
        
        a.prior_year_market_value,
        a.market_value - coalesce(a.prior_year_market_value, a.market_value) as market_value_change,
        case 
            when a.prior_year_market_value > 0 then
                round(((a.market_value - a.prior_year_market_value) / a.prior_year_market_value) * 100, 2)
            else 0
        end as market_value_change_pct,
        
        -- Exemption information
        coalesce(e.total_exemption_amount, 0) as total_exemption_amount,
        coalesce(e.exemption_count, 0) as exemption_count,
        e.exemption_types,
        
        -- Net assessed value after exemptions
        a.assessed_value - coalesce(e.total_exemption_amount, 0) as net_assessed_value,
        
        -- Dates
        a.assessment_date,
        a.assessor_id,
        
        -- Metadata
        a.created_at,
        a.updated_at,
        current_timestamp() as dbt_updated_at
        
    from assessments_with_prior a
    left join exemption_totals e
        on a.parcel_id = e.parcel_id
        and a.tax_year = e.tax_year
)

select * from final
