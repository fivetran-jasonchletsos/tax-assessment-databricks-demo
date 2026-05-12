{#
  ============================================================
  Owner: jason_chletsos
  Macro: tax_year_range
  Description: Generate a range of valid tax years for filtering
  Usage: where tax_year in {{ tax_year_range(2020, 2024) }}
  ============================================================
#}

{% macro tax_year_range(start_year, end_year) %}
    {% set years = [] %}
    {% for year in range(start_year, end_year + 1) %}
        {% do years.append(year) %}
    {% endfor %}
    ({{ years | join(', ') }})
{% endmacro %}
