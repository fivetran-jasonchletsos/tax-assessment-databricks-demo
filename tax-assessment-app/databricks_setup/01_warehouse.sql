-- ============================================================
-- Owner: jason_chletsos
-- Project: Allegheny County Tax Assessment Application
-- Description: Databricks Catalog and Schema Configuration
-- ============================================================

-- Create main catalog
CREATE CATALOG IF NOT EXISTS jason_chletsos_allegheny_tax
  COMMENT 'Allegheny County tax assessment data - Owner: jason_chletsos';

-- Use the catalog
USE CATALOG jason_chletsos_allegheny_tax;

-- Create RAW schemas for Fivetran destinations
CREATE SCHEMA IF NOT EXISTS jason_chletsos_raw_wprdc
  COMMENT 'Raw data from WPRDC source via Fivetran - Owner: jason_chletsos';

CREATE SCHEMA IF NOT EXISTS jason_chletsos_raw_alleghenyre
  COMMENT 'Raw data from Allegheny County Real Estate source via Fivetran - Owner: jason_chletsos';

-- Create STAGING schema for dbt staging models
CREATE SCHEMA IF NOT EXISTS jason_chletsos_staging
  COMMENT 'Staging models - cleaned and typed data from raw - Owner: jason_chletsos';

-- Create MARTS schema for dbt analytics models
CREATE SCHEMA IF NOT EXISTS jason_chletsos_marts
  COMMENT 'Analytics-ready models consumed by frontend application - Owner: jason_chletsos';

-- Display created objects
SHOW SCHEMAS IN CATALOG jason_chletsos_allegheny_tax;
