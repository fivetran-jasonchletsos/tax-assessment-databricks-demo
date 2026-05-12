{#
  ============================================================
  Owner: jason_chletsos
  Macro: cents_to_dollars
  Description: Convert integer cent values to formatted dollar amounts
  Usage: {{ cents_to_dollars('assessed_value') }}
  ============================================================
#}

{% macro cents_to_dollars(column_name) %}
    round({{ column_name }} / 100.0, 2)
{% endmacro %}
