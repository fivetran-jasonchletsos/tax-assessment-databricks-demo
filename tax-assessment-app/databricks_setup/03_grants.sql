-- ============================================================
-- Owner: jason_chletsos
-- Project: Allegheny County Tax Assessment Application
-- Description: Grants and Permissions for Databricks Unity Catalog
-- ============================================================

USE CATALOG jason_chletsos_allegheny_tax;

-- ============================================================================
-- FIVETRAN WPRDC Service Principal Grants
-- ============================================================================
-- Replace 'jason_chletsos_fivetran_wprdc_sp' with actual service principal name

-- Catalog usage
GRANT USAGE ON CATALOG jason_chletsos_allegheny_tax TO `jason_chletsos_fivetran_wprdc_sp`;

-- Schema access and table creation
GRANT USAGE, CREATE TABLE ON SCHEMA jason_chletsos_raw_wprdc TO `jason_chletsos_fivetran_wprdc_sp`;

-- Table permissions
GRANT SELECT, MODIFY ON SCHEMA jason_chletsos_raw_wprdc TO `jason_chletsos_fivetran_wprdc_sp`;

-- ============================================================================
-- FIVETRAN ALLEGHENY COUNTY Service Principal Grants
-- ============================================================================

-- Catalog usage
GRANT USAGE ON CATALOG jason_chletsos_allegheny_tax TO `jason_chletsos_fivetran_ac_sp`;

-- Schema access and table creation
GRANT USAGE, CREATE TABLE ON SCHEMA jason_chletsos_raw_alleghenyre TO `jason_chletsos_fivetran_ac_sp`;

-- Table permissions
GRANT SELECT, MODIFY ON SCHEMA jason_chletsos_raw_alleghenyre TO `jason_chletsos_fivetran_ac_sp`;

-- ============================================================================
-- DBT Service Principal Grants
-- ============================================================================

-- Catalog usage
GRANT USAGE ON CATALOG jason_chletsos_allegheny_tax TO `jason_chletsos_dbt_sp`;

-- RAW schemas - read only
GRANT USAGE ON SCHEMA jason_chletsos_raw_wprdc TO `jason_chletsos_dbt_sp`;
GRANT SELECT ON SCHEMA jason_chletsos_raw_wprdc TO `jason_chletsos_dbt_sp`;

GRANT USAGE ON SCHEMA jason_chletsos_raw_alleghenyre TO `jason_chletsos_dbt_sp`;
GRANT SELECT ON SCHEMA jason_chletsos_raw_alleghenyre TO `jason_chletsos_dbt_sp`;

-- STAGING schema - full access
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA jason_chletsos_staging TO `jason_chletsos_dbt_sp`;
GRANT SELECT, MODIFY ON SCHEMA jason_chletsos_staging TO `jason_chletsos_dbt_sp`;

-- MARTS schema - full access
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA jason_chletsos_marts TO `jason_chletsos_dbt_sp`;
GRANT SELECT, MODIFY ON SCHEMA jason_chletsos_marts TO `jason_chletsos_dbt_sp`;

-- ============================================================================
-- APP READ Service Principal Grants
-- ============================================================================

-- Catalog usage
GRANT USAGE ON CATALOG jason_chletsos_allegheny_tax TO `jason_chletsos_app_read_sp`;

-- MARTS schema - read only
GRANT USAGE ON SCHEMA jason_chletsos_marts TO `jason_chletsos_app_read_sp`;
GRANT SELECT ON SCHEMA jason_chletsos_marts TO `jason_chletsos_app_read_sp`;

-- ============================================================================
-- Alternative: Group-based Grants (Recommended)
-- ============================================================================

-- Grant to groups instead of individual service principals
GRANT USAGE ON CATALOG jason_chletsos_allegheny_tax TO jason_chletsos_dbt_group;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA jason_chletsos_staging TO jason_chletsos_dbt_group;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA jason_chletsos_marts TO jason_chletsos_dbt_group;
GRANT SELECT, MODIFY ON SCHEMA jason_chletsos_staging TO jason_chletsos_dbt_group;
GRANT SELECT, MODIFY ON SCHEMA jason_chletsos_marts TO jason_chletsos_dbt_group;

GRANT USAGE ON CATALOG jason_chletsos_allegheny_tax TO jason_chletsos_app_read_group;
GRANT USAGE ON SCHEMA jason_chletsos_marts TO jason_chletsos_app_read_group;
GRANT SELECT ON SCHEMA jason_chletsos_marts TO jason_chletsos_app_read_group;

-- ============================================================================
-- Verification
-- ============================================================================

SHOW GRANTS ON CATALOG jason_chletsos_allegheny_tax;
SHOW GRANTS ON SCHEMA jason_chletsos_raw_wprdc;
SHOW GRANTS ON SCHEMA jason_chletsos_raw_alleghenyre;
SHOW GRANTS ON SCHEMA jason_chletsos_staging;
SHOW GRANTS ON SCHEMA jason_chletsos_marts;
