-- ============================================================
-- Owner: jason_chletsos
-- Project: Allegheny County Tax Assessment Application
-- Description: Service Principal and User Configuration
-- ============================================================

USE CATALOG jason_chletsos_allegheny_tax;

-- Note: In Databricks, access is typically managed through:
-- 1. Service Principals (for automated processes like Fivetran, dbt)
-- 2. Users (for application access)
-- 3. Groups (for organizing permissions)

-- Service principals should be created through Databricks UI or API:
-- - jason_chletsos_fivetran_wprdc_sp
-- - jason_chletsos_fivetran_ac_sp
-- - jason_chletsos_dbt_sp
-- - jason_chletsos_app_read_sp

-- This file documents the expected service principals and users.
-- Actual creation is done via Databricks Account Console or CLI:

-- Example using Databricks CLI:
-- databricks service-principals create --display-name "jason_chletsos_fivetran_wprdc_sp"
-- databricks service-principals create --display-name "jason_chletsos_fivetran_ac_sp"
-- databricks service-principals create --display-name "jason_chletsos_dbt_sp"
-- databricks service-principals create --display-name "jason_chletsos_app_read_sp"

-- Groups for organizing access
CREATE GROUP IF NOT EXISTS jason_chletsos_fivetran_group;
CREATE GROUP IF NOT EXISTS jason_chletsos_dbt_group;
CREATE GROUP IF NOT EXISTS jason_chletsos_app_read_group;

-- Display groups
SHOW GROUPS LIKE 'jason_chletsos%';
