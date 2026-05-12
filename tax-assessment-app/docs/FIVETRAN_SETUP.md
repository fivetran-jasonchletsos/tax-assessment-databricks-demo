# Fivetran Setup Guide

**Owner:** jason_chletsos  
**Project:** Allegheny County Tax Assessment Application  
**Destination:** `jason_chletsos_databricks`

---

## Overview

This guide covers setting up Fivetran connectors to sync tax assessment data into your Databricks destination.

## Fivetran Destination

**Destination Name:** `jason_chletsos_databricks`

This destination is already configured in your Fivetran account and points to:
- **Databricks Workspace:** `dbc-c48d38b1-67f3.cloud.databricks.com`
- **Catalog:** `jason_chletsos_allegheny_tax` (or as configured in Fivetran)
- **Authentication:** Uses the same Databricks token from AWS Secrets Manager

---

## Connector Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Sources                             │
├─────────────────────────────────────────────────────────────┤
│  1. WPRDC (Western PA Regional Data Center)                │
│     - Property assessment data                              │
│     - Public records                                        │
│                                                             │
│  2. Allegheny County Real Estate                           │
│     - Official assessment records                           │
│     - Appeals and exemptions                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Fivetran Custom Connectors
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              Fivetran Destination                           │
│         jason_chletsos_databricks                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Writes to
                          ↓
┌─────────────────────────────────────────────────────────────┐
│         Databricks Unity Catalog                            │
│    jason_chletsos_allegheny_tax                             │
│                                                             │
│  ├── jason_chletsos_raw_wprdc                              │
│  │   ├── parcels                                           │
│  │   ├── assessments                                       │
│  │   └── owners                                            │
│  │                                                         │
│  └── jason_chletsos_raw_alleghenyre                        │
│      ├── exemptions                                        │
│      └── appeals                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Connectors to Create

### 1. WPRDC Connector

**Connector Name:** `jason_chletsos_wprdc`

**Configuration:**
```json
{
  "connector_name": "jason_chletsos_wprdc",
  "destination_id": "jason_chletsos_databricks",
  "connector_type": "custom",
  "config": {
    "api_url": "https://data.wprdc.org/api/3/action/datastore_search",
    "api_key": "<your-wprdc-api-key>",
    "start_date": "2020-01-01"
  },
  "destination_schema": "jason_chletsos_raw_wprdc"
}
```

**Tables Synced:**
- `parcels` - Property parcel master data
- `assessments` - Annual tax assessments
- `owners` - Property ownership records

**Sync Frequency:** Daily at 2:00 AM ET

---

### 2. Allegheny County Real Estate Connector

**Connector Name:** `jason_chletsos_alleghenyre`

**Configuration:**
```json
{
  "connector_name": "jason_chletsos_alleghenyre",
  "destination_id": "jason_chletsos_databricks",
  "connector_type": "custom",
  "config": {
    "api_url": "https://alleghenycounty.us/real-estate/api",
    "api_key": "<your-allegheny-api-key>",
    "start_date": "2020-01-01"
  },
  "destination_schema": "jason_chletsos_raw_alleghenyre"
}
```

**Tables Synced:**
- `exemptions` - Tax exemptions (homestead, senior, veteran, disability)
- `appeals` - Assessment appeal records

**Sync Frequency:** Daily at 3:00 AM ET

---

## Setup Steps

### Prerequisites

1. **Fivetran Account Access**
   - Admin access to Fivetran workspace
   - API credentials from AWS Secrets Manager

2. **Databricks Destination Configured**
   - Destination `jason_chletsos_databricks` already exists
   - Connected to your Databricks workspace

3. **Custom Connector Code**
   - Located in `fivetran_connector/` directory
   - Tested locally with Fivetran SDK

### Step 1: Retrieve Fivetran API Credentials

```bash
# Use the helper script
./scripts/get-credentials.sh

# Or manually
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

### Step 2: Upload Custom Connector

1. **Package the connector:**
   ```bash
   cd fivetran_connector
   zip -r connector.zip connector.py configuration.json requirements.txt
   ```

2. **Upload to Fivetran:**
   - Go to Fivetran Dashboard → Connectors → Custom Connectors
   - Click "Create Custom Connector"
   - Upload `connector.zip`
   - Name: `tax_assessment_connector`

### Step 3: Create WPRDC Connector

1. **In Fivetran Dashboard:**
   - Click "+ Connector"
   - Select "Custom" → "tax_assessment_connector"
   - Name: `jason_chletsos_wprdc`

2. **Configure:**
   ```
   Destination: jason_chletsos_databricks
   Schema: jason_chletsos_raw_wprdc
   
   Configuration:
   - API URL: https://data.wprdc.org/api/3/action/datastore_search
   - API Key: <your-wprdc-key>
   - Start Date: 2020-01-01
   ```

3. **Test Connection** → **Save & Test**

### Step 4: Create Allegheny County Connector

1. **In Fivetran Dashboard:**
   - Click "+ Connector"
   - Select "Custom" → "tax_assessment_connector"
   - Name: `jason_chletsos_alleghenyre`

2. **Configure:**
   ```
   Destination: jason_chletsos_databricks
   Schema: jason_chletsos_raw_alleghenyre
   
   Configuration:
   - API URL: https://alleghenycounty.us/real-estate/api
   - API Key: <your-allegheny-key>
   - Start Date: 2020-01-01
   ```

3. **Test Connection** → **Save & Test**

### Step 5: Verify Databricks Schemas

After initial sync completes, verify in Databricks:

```sql
-- Check WPRDC schema
USE CATALOG jason_chletsos_allegheny_tax;
SHOW TABLES IN jason_chletsos_raw_wprdc;

-- Expected tables: parcels, assessments, owners
SELECT COUNT(*) FROM jason_chletsos_raw_wprdc.parcels;

-- Check Allegheny County schema
SHOW TABLES IN jason_chletsos_raw_alleghenyre;

-- Expected tables: exemptions, appeals
SELECT COUNT(*) FROM jason_chletsos_raw_alleghenyre.exemptions;
```

---

## Sync Schedule

| Connector | Frequency | Time (ET) | Duration |
|-----------|-----------|-----------|----------|
| `jason_chletsos_wprdc` | Daily | 2:00 AM | ~15 min |
| `jason_chletsos_alleghenyre` | Daily | 3:00 AM | ~10 min |

**Note:** Staggered times prevent resource contention on Databricks warehouse.

---

## Monitoring

### Fivetran Dashboard

Monitor sync status at:
- https://fivetran.com/dashboard/connectors

**Key Metrics:**
- Last sync time
- Rows synced
- Errors/warnings
- Data freshness

### Databricks Monitoring

Check table metadata:

```sql
-- Last update time
DESCRIBE DETAIL jason_chletsos_raw_wprdc.parcels;

-- Row counts over time
SELECT 
  DATE(_fivetran_synced) as sync_date,
  COUNT(*) as row_count
FROM jason_chletsos_raw_wprdc.parcels
GROUP BY DATE(_fivetran_synced)
ORDER BY sync_date DESC;
```

---

## Troubleshooting

### Connector Fails to Sync

1. **Check API credentials:**
   ```bash
   # Test API access
   curl -H "Authorization: Bearer <api-key>" \
     https://data.wprdc.org/api/3/action/datastore_search
   ```

2. **Check Databricks permissions:**
   ```sql
   -- Verify service principal has write access
   SHOW GRANTS ON SCHEMA jason_chletsos_raw_wprdc;
   ```

3. **Review Fivetran logs:**
   - Go to connector → Logs tab
   - Look for error messages

### Schema Not Found

```sql
-- Create schema if missing
CREATE SCHEMA IF NOT EXISTS jason_chletsos_allegheny_tax.jason_chletsos_raw_wprdc;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA jason_chletsos_allegheny_tax.jason_chletsos_raw_wprdc 
TO `jason_chletsos_fivetran_principal`;
```

### Data Not Updating

1. **Check sync frequency:**
   - Fivetran Dashboard → Connector → Settings → Sync Frequency

2. **Force manual sync:**
   - Click "Sync Now" button in connector

3. **Verify source data changed:**
   - Check source API for new data

---

## API Endpoints Reference

### WPRDC API

**Base URL:** `https://data.wprdc.org/api/3/action/`

**Key Endpoints:**
- `datastore_search` - Search records
- `datastore_search_sql` - SQL queries
- `package_show` - Dataset metadata

**Authentication:** API key in header
```
Authorization: <your-api-key>
```

### Allegheny County API

**Base URL:** `https://alleghenycounty.us/real-estate/api/`

**Key Endpoints:**
- `/assessments` - Assessment records
- `/exemptions` - Tax exemptions
- `/appeals` - Appeal records

**Authentication:** API key in query parameter
```
?api_key=<your-api-key>
```

---

## Cost Considerations

### Fivetran Pricing

- **MAR (Monthly Active Rows):** Rows modified/added each month
- **Estimated MAR:** ~50,000 rows/month (based on update frequency)
- **Tier:** Standard (up to 500K MAR)

### Databricks Costs

- **Compute:** SQL Warehouse usage during sync (~25 min/day)
- **Storage:** ~10 GB for raw tables
- **Estimated Cost:** $5-10/month

---

## Maintenance

### Weekly Tasks

- [ ] Review sync logs for errors
- [ ] Check data freshness in Databricks
- [ ] Verify row counts match expectations

### Monthly Tasks

- [ ] Review MAR usage in Fivetran
- [ ] Optimize sync schedules if needed
- [ ] Update API credentials if rotated

### Quarterly Tasks

- [ ] Review connector performance
- [ ] Update custom connector code if needed
- [ ] Audit data quality

---

## Related Documentation

- [Fivetran Custom Connector SDK](https://fivetran.com/docs/connectors/connector-sdk)
- [Databricks Unity Catalog](https://docs.databricks.com/data-governance/unity-catalog/index.html)
- [WPRDC API Documentation](https://data.wprdc.org/api/3/)
- [fivetran_connector/README.md](../fivetran_connector/README.md)

---

## Support

**Fivetran Issues:**
- Support Portal: https://fivetran.com/support
- Email: support@fivetran.com

**Databricks Issues:**
- Support Portal: https://help.databricks.com
- Community: https://community.databricks.com
