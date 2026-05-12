{#
  ============================================================
  Owner: jason_chletsos
  Model: dim_tax_years
  Description: Date dimension for tax years
  ============================================================
#}

with year_range as (
    -- Generate years from 2000 to current year + 1
    select
        year + 2000 as tax_year
    from (
        select explode(sequence(0, 30)) as year
    )
    where year + 2000 <= year(current_date()) + 1
),

final as (
    select
        tax_year,
        concat(cast(tax_year as string), '-01-01') as tax_year_start_date,
        concat(cast(tax_year as string), '-12-31') as tax_year_end_date,
        case 
            when tax_year = year(current_date()) then true
            else false
        end as is_current_year,
        case 
            when tax_year = year(current_date()) - 1 then true
            else false
        end as is_prior_year,
        current_timestamp() as dbt_updated_at
    from year_range
)

select * from final
