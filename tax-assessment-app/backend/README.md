# Backend API - Allegheny County Tax Assessment

FastAPI backend for the tax assessment application.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure environment variables:

**This application reuses existing Databricks credentials from the pokemon-app project.**

```bash
# Retrieve credentials from AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

# Create .env file
cp ../.env.example .env
# Edit .env and paste the retrieved values
```

See [../CREDENTIALS.md](../CREDENTIALS.md) for detailed instructions.

3. Run the server:
```bash
python main.py
```

Or using uvicorn directly:
```bash
uvicorn main:app --reload --port 8000
```

## API Endpoints

### Health Check
- `GET /` - Health check

### Statistics
- `GET /api/stats/summary` - Get summary statistics

### Parcels
- `GET /api/parcels/search` - Search parcels with filters
- `GET /api/parcels/{parcel_id}` - Get parcel details
- `GET /api/parcels/{parcel_id}/assessments` - Get assessment history
- `GET /api/parcels/{parcel_id}/exemptions` - Get exemptions
- `GET /api/parcels/{parcel_id}/appeals` - Get appeals
- `GET /api/parcels/{parcel_id}/comparables` - Get comparable properties

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
