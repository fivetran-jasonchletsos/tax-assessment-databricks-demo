{#
  ============================================================
  Owner: jason_chletsos
  Macro: generate_schema_name
  Description: Override dbt's default schema naming to use
               exact custom schema names without prefixes
  ============================================================
#}

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
