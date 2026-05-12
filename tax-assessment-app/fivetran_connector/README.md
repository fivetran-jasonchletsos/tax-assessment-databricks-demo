# Fivetran Custom Connector - Tax Assessment Data

This custom connector syncs tax assessment data from a source API to your Fivetran destination.

## Tables Synced

1. **parcels** - Property parcel information
2. **assessments** - Tax assessments by year
3. **owners** - Property ownership records
4. **exemptions** - Tax exemptions (homestead, senior, veteran, disability)
5. **appeals** - Assessment appeal records

## Configuration

The connector requires the following configuration parameters:

- `api_url` (optional): Base URL for the tax assessment API (defaults to example URL)
- `api_key` (required): Authentication key for API access
- `start_date` (optional): Initial sync date in YYYY-MM-DD format (defaults to 2020-01-01)

## Features

- **Incremental Sync**: Uses cursor-based pagination with state management
- **Upsert Support**: Primary keys defined for each table to handle updates
- **Rate Limiting**: Built-in retry logic with exponential backoff
- **Error Handling**: Graceful error handling with detailed logging
- **Pagination**: Handles large datasets with configurable page sizes

## Local Testing

### Prerequisites

```bash
pip install -r requirements.txt
```

### Test with Fivetran CLI

1. Install the Fivetran connector SDK CLI:
```bash
pip install 'fivetran-connector-sdk[cli]'
```

2. Create a test configuration file `test_config.json`:
```json
{
  "api_key": "test_key_12345",
  "api_url": "https://api.example.com/tax-data",
  "start_date": "2020-01-01"
}
```

3. Run the connector in debug mode:
```bash
fivetran debug
```

4. When prompted, provide the configuration values or point to your config file.

### Test Schema Generation

```bash
python connector.py
```

This will output the schema definition for all tables.

### Manual Testing

You can also test the connector programmatically:

```python
from connector import TaxAssessmentConnector

connector = TaxAssessmentConnector()

# Test schema
config = {
    "api_key": "test_key",
    "api_url": "https://api.example.com/tax-data",
    "start_date": "2020-01-01"
}

schema = connector.schema(config)
print(f"Tables defined: {[table['table'] for table in schema]}")

# Test update (with mock data)
state = {}
connector.update(config, state)
print(f"State after sync: {state}")
```

## Data Types

All monetary values are stored as **integers in cents** to avoid floating-point precision issues:
- `assessed_value`: 25000000 = $250,000.00
- `market_value`: 30000000 = $300,000.00
- `exemption_amount`: 2500000 = $25,000.00

Convert to dollars in your transformation layer (dbt).

## State Management

The connector maintains state per table:
```json
{
  "parcels": {
    "last_updated": "2024-05-12T19:00:00Z",
    "last_sync": "2024-05-12T19:05:00Z"
  },
  "assessments": {
    "last_updated": "2024-05-12T19:00:00Z",
    "last_sync": "2024-05-12T19:05:00Z"
  }
}
```

This enables incremental syncs that only fetch records updated since the last sync.

## Production Deployment

1. **Replace Mock Data**: Update `_fetch_mock_data()` method to call your actual API
2. **Add Authentication**: Implement proper API authentication (OAuth, JWT, etc.)
3. **Configure Rate Limits**: Adjust retry strategy based on API limits
4. **Add Monitoring**: Integrate with your logging/monitoring system
5. **Deploy to Fivetran**: Follow Fivetran's custom connector deployment guide

## Error Handling

The connector includes:
- Automatic retries for transient errors (429, 500, 502, 503, 504)
- Exponential backoff strategy
- Detailed error logging
- Graceful degradation (continues with partial data if later pages fail)

## Support

For issues or questions:
- Check Fivetran connector SDK documentation: https://github.com/fivetran/fivetran_connector_sdk
- Review connector logs in Fivetran dashboard
- Test locally using `fivetran debug` command
