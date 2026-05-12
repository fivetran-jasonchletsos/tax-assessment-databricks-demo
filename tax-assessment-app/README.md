# Allegheny County Tax Assessment Application

**Owner:** jason_chletsos

A full-stack application for community members to view and interact with property tax assessment data. The system consists of four integrated layers:

1. **Fivetran Custom Connector** - Python SDK connector for data ingestion
2. **Databricks Data Warehouse** - Unity Catalog for data storage
3. **dbt Transformation Layer** - Data modeling and transformation
4. **Web Application** - Public-facing React frontend + FastAPI backend

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Project Structure

```
tax-assessment-app/
├── fivetran_connector/       # Custom Fivetran SDK connector
├── databricks_setup/          # Databricks SQL setup scripts
├── dbt_project/              # dbt transformation models
│   └── jason_chletsos_tax_assessment/
├── backend/                  # FastAPI backend API
├── frontend/                 # React + TypeScript frontend
├── .env.example              # Environment variables template
└── README.md                 # This file
```

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Layer 1: Fivetran Custom Connector

Custom connector built with the Fivetran Python SDK to sync tax assessment data to the **`jason_chletsos_databricks`** destination.

### Fivetran Destination
- **Name:** `jason_chletsos_databricks`
- **Type:** Databricks (Unity Catalog)
- **Workspace:** `dbc-c48d38b1-67f3.cloud.databricks.com`

### Connectors
1. **`jason_chletsos_wprdc`** → Schema: `jason_chletsos_raw_wprdc`
2. **`jason_chletsos_alleghenyre`** → Schema: `jason_chletsos_raw_alleghenyre`

### Tables Synced
- `parcels` - Property parcel information
- `assessments` - Tax assessments by year
- `owners` - Property ownership records
- `exemptions` - Tax exemptions (homestead, senior, veteran, disability)
- `appeals` - Assessment appeal records

### Setup
```bash
cd fivetran_connector
pip install -r requirements.txt
fivetran debug
```

📖 **See [docs/FIVETRAN_SETUP.md](docs/FIVETRAN_SETUP.md) for complete Fivetran configuration guide.**

See also: [fivetran_connector/README.md](fivetran_connector/README.md) for connector development details.

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Layer 2: Databricks Configuration

Databricks Unity Catalog setup with proper schema isolation.

### Objects Created
- **Catalog:** `jason_chletsos_allegheny_tax`
- **Schemas:**
  - `jason_chletsos_raw_wprdc` - WPRDC raw data
  - `jason_chletsos_raw_alleghenyre` - Allegheny County raw data
  - `jason_chletsos_staging` - dbt staging models
  - `jason_chletsos_marts` - dbt mart models

### Setup
Run the SQL scripts in order:
```bash
databricks sql -f databricks_setup/01_warehouse.sql
databricks sql -f databricks_setup/02_roles.sql
databricks sql -f databricks_setup/03_grants.sql
```

Or execute via Databricks SQL Editor.

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Layer 3: dbt Project

dbt project for transforming raw data into analytics-ready models.

### Models

**Staging Models** (views):
- `stg_parcels` - Cleaned parcel data
- `stg_assessments` - Cleaned assessments with dollar conversions
- `stg_owners` - Normalized owner data
- `stg_exemptions` - Validated exemptions
- `stg_appeals` - Appeals with calculated reductions

**Mart Models** (tables):
- `dim_parcels` - Parcel dimension with current owner
- `dim_tax_years` - Tax year dimension
- `fct_assessments` - Assessment fact with YoY changes
- `fct_exemptions_summary` - Exemption aggregates
- `fct_appeals_summary` - Appeal metrics

### Setup
```bash
cd dbt_project/jason_chletsos_tax_assessment

# Install dbt packages
dbt deps

# Configure environment
cp ../../.env.example .env
# Edit .env with your Databricks credentials

# Test connection
dbt debug

# Run models
dbt run

# Run tests
dbt test

# Generate documentation
dbt docs generate
dbt docs serve
```

### Environment Variables
```bash
DATABRICKS_HOST=your-workspace.cloud.databricks.com
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/your-warehouse-id
DATABRICKS_TOKEN=your-token
```

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Layer 4: Web Application

### Backend API (FastAPI)

Python FastAPI backend that queries Databricks and serves data to the frontend.

#### Setup
```bash
cd backend
pip install -r requirements.txt
python main.py
```

API will be available at http://localhost:8000

#### Endpoints
- `GET /api/stats/summary` - Homepage statistics
- `GET /api/parcels/search` - Search parcels
- `GET /api/parcels/{id}` - Parcel details
- `GET /api/parcels/{id}/assessments` - Assessment history
- `GET /api/parcels/{id}/exemptions` - Exemptions
- `GET /api/parcels/{id}/appeals` - Appeals
- `GET /api/parcels/{id}/comparables` - Comparable properties

API documentation: http://localhost:8000/docs

### Frontend (React + TypeScript)

Modern React application for community members to search and view property tax data.

#### Features
- **Home Page**: Search bar and county-wide statistics dashboard
- **Search Page**: Advanced filtering by municipality, property class, value range, year built
- **Parcel Detail Page**: 
  - Property and owner information
  - Assessment history charts (line and bar charts)
  - Tax exemptions table
  - Assessment appeals history
- **Comparables Page**: View and compare similar properties
- **Exemptions Page**: Information about available tax exemptions and how to apply

#### Tech Stack
- React 19 + TypeScript
- Vite for build tooling
- TanStack Query for data fetching
- React Router for navigation
- Tailwind CSS v4 for styling
- Recharts for data visualization
- Leaflet.js for maps (prepared for future use)
- Axios for API calls

#### Setup
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with backend API URL
npm run dev
```

Frontend will be available at http://localhost:5173

See [frontend/README.md](frontend/README.md) for detailed documentation.

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Naming Conventions

All objects follow the `jason_chletsos_` prefix convention:

### Fivetran Connectors
- `jason_chletsos_wprdc`
- `jason_chletsos_alleghenyre`

### Databricks
- Catalog: `jason_chletsos_allegheny_tax`
- Schemas: `jason_chletsos_raw_wprdc`, `jason_chletsos_raw_alleghenyre`, `jason_chletsos_staging`, `jason_chletsos_marts`
- Service Principals: `jason_chletsos_fivetran_wprdc_sp`, `jason_chletsos_dbt_sp`, etc.

### dbt
- Project: `jason_chletsos_tax_assessment`
- Models follow schema naming conventions

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Data Flow

```
┌─────────────────────┐
│   Data Sources      │
│  (WPRDC, County)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Fivetran Connector  │
│   (Python SDK)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Databricks Unity   │
│   Catalog (RAW)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   dbt Transform     │
│ (STAGING → MARTS)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   FastAPI Backend   │
│   (Query Layer)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  React Frontend     │
│ (Community Portal)  │
└─────────────────────┘
```

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Development Workflow

1. **Data Ingestion**: Fivetran syncs data to Databricks RAW schemas
2. **Transformation**: dbt runs on schedule to transform RAW → STAGING → MARTS
3. **API Layer**: FastAPI queries MARTS schema
4. **Frontend**: React app calls API and displays data to users

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Testing

### dbt Tests
```bash
cd dbt_project/jason_chletsos_tax_assessment
dbt test
```

Tests include:
- Generic tests (not_null, unique, accepted_values)
- Singular test for negative assessed values
- Relationship tests between tables

### API Tests
```bash
cd backend
pytest  # (tests to be added)
```

### Frontend Tests
```bash
cd frontend
npm run build  # Verify TypeScript compilation
# Unit tests to be added with Vitest
```

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Deployment

### Production Checklist

1. **Fivetran**:
   - Deploy custom connector
   - Configure production API credentials
   - Set sync schedule

2. **Databricks**:
   - Create production service principals
   - Grant appropriate permissions
   - Configure compute resources

3. **dbt**:
   - Set up dbt Cloud or orchestration tool
   - Configure production environment
   - Schedule runs

4. **Backend**:
   - Deploy to cloud platform (AWS, Azure, GCP)
   - Configure production database credentials
   - Set up monitoring and logging

5. **Frontend**:
   - Build production bundle
   - Deploy to CDN or hosting platform
   - Configure API endpoint

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Security Considerations

- All credentials stored in environment variables
- Service principals with least-privilege access
- Read-only access for application layer
- No PII exposed in frontend
- API rate limiting (to be implemented)
- Input validation and SQL injection prevention

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Future Enhancements

- [ ] Add Leaflet map integration for property locations
- [ ] Implement MSW for local development without backend
- [ ] Add user authentication for saved searches
- [ ] Implement caching layer (Redis)
- [ ] Add real-time data updates
- [ ] PDF report generation
- [ ] Email notifications for assessment changes
- [ ] Multi-language support
- [ ] Advanced analytics and predictions
- [ ] Mobile app (React Native)

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## License

Proprietary - Owner: jason_chletsos

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- AWS CLI (for retrieving Databricks credentials)
- Access to existing Databricks workspace (shared with pokemon-app)

### 1. Set Up Credentials

**This application reuses existing Databricks and Fivetran credentials from the pokemon-app project.**

Retrieve credentials from AWS Secrets Manager:
```bash
# Option 1: Use the helper script (recommended)
./scripts/get-credentials.sh

# Option 2: Manual retrieval
aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-token \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/databricks-http-path \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-key \
  --query SecretString --output text

aws secretsmanager get-secret-value \
  --secret-id pokemon-app/fivetran-api-secret \
  --query SecretString --output text
```

Create `.env` file:
```bash
cp .env.example .env
# Edit .env and paste the retrieved values
```

📖 **See [CREDENTIALS.md](CREDENTIALS.md) for detailed credential management guide.**

---

## Contact

For questions or issues, contact: jason.chletsos@example.com
