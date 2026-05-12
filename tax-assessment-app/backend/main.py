# ============================================================
# Owner: jason_chletsos
# Project: Allegheny County Tax Assessment Application
# Backend API - FastAPI Application
# ============================================================

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import os
from dotenv import load_dotenv
from databricks import sql
from contextlib import contextmanager
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Allegheny County Tax Assessment API",
    description="API for accessing property tax assessment data",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Databricks connection configuration
DATABRICKS_CONFIG = {
    "server_hostname": os.getenv("DATABRICKS_HOST"),
    "http_path": os.getenv("DATABRICKS_HTTP_PATH"),
    "access_token": os.getenv("DATABRICKS_TOKEN"),
}

CATALOG = os.getenv("DATABRICKS_CATALOG", "jason_chletsos")
MARTS_SCHEMA = os.getenv("DATABRICKS_MARTS_SCHEMA", "jason_chletsos_marts")


@contextmanager
def get_db_connection():
    """Context manager for Databricks SQL connection"""
    connection = None
    try:
        connection = sql.connect(**DATABRICKS_CONFIG)
        yield connection
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise HTTPException(status_code=500, detail="Database connection failed")
    finally:
        if connection:
            connection.close()


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Allegheny County Tax Assessment API",
        "version": "1.0.0"
    }


@app.get("/api/stats/summary")
async def get_summary_stats():
    """Get summary statistics for the homepage"""
    query = f"""
    SELECT
        COUNT(DISTINCT parcel_id) as total_parcels,
        ROUND(AVG(assessed_value), 2) as avg_assessed_value,
        SUM(total_exemption_amount) as total_exemptions,
        MAX(tax_year) as current_tax_year
    FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments
    WHERE tax_year = (SELECT MAX(tax_year) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments)
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        result = cursor.fetchone()
        cursor.close()
        
        if result:
            return {
                "total_parcels": result[0],
                "avg_assessed_value": result[1],
                "total_exemptions": result[2],
                "current_tax_year": result[3]
            }
        return {}


@app.get("/api/parcels/search")
async def search_parcels(
    q: Optional[str] = Query(None, description="Search query (address or parcel ID)"),
    year: Optional[int] = Query(None, description="Tax year filter"),
    city: Optional[str] = Query(None, description="City filter"),
    zip: Optional[str] = Query(None, description="ZIP code filter"),
    land_use: Optional[str] = Query(None, description="Land use code filter"),
    limit: int = Query(100, le=500, description="Maximum results")
):
    """Search for parcels with various filters"""
    
    # Build WHERE clauses
    where_clauses = []
    if q:
        where_clauses.append(f"(p.address LIKE '%{q}%' OR p.parcel_id LIKE '%{q}%')")
    if city:
        where_clauses.append(f"p.city = '{city.upper()}'")
    if zip:
        where_clauses.append(f"p.zip_code = '{zip}'")
    if land_use:
        where_clauses.append(f"p.land_use_code = '{land_use.upper()}'")
    if year:
        where_clauses.append(f"a.tax_year = {year}")
    else:
        where_clauses.append(f"a.tax_year = (SELECT MAX(tax_year) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments)")
    
    where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    query = f"""
    SELECT
        p.parcel_id,
        p.address,
        p.city,
        p.zip_code,
        p.current_owner_name,
        p.land_use_description,
        a.tax_year,
        a.assessed_value,
        a.market_value,
        a.total_exemption_amount,
        a.assessed_value_change_pct,
        p.latitude,
        p.longitude
    FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
    JOIN {CATALOG}.{MARTS_SCHEMA}.fct_assessments a
        ON p.parcel_id = a.parcel_id
    WHERE {where_clause}
    ORDER BY p.address
    LIMIT {limit}
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        results = cursor.fetchall()
        cursor.close()
        
        return {
            "count": len(results),
            "results": [dict(zip(columns, row)) for row in results]
        }


@app.get("/api/parcels/{parcel_id}")
async def get_parcel_detail(parcel_id: str):
    """Get detailed information for a specific parcel"""
    
    query = f"""
    SELECT
        p.parcel_id,
        p.address,
        p.city,
        p.zip_code,
        p.county,
        p.current_owner_name,
        p.current_mailing_address,
        p.current_ownership_type,
        p.land_use_code,
        p.land_use_description,
        p.acreage,
        p.latitude,
        p.longitude
    FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
    WHERE p.parcel_id = '{parcel_id}'
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        result = cursor.fetchone()
        cursor.close()
        
        if not result:
            raise HTTPException(status_code=404, detail="Parcel not found")
        
        return dict(zip(columns, result))


@app.get("/api/parcels/{parcel_id}/assessments")
async def get_parcel_assessments(parcel_id: str):
    """Get assessment history for a parcel"""
    
    query = f"""
    SELECT
        tax_year,
        assessed_value,
        market_value,
        land_value,
        improvement_value,
        land_value_percentage,
        improvement_value_percentage,
        market_to_assessed_ratio,
        assessed_value_change,
        assessed_value_change_pct,
        total_exemption_amount,
        net_assessed_value,
        assessment_date
    FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments
    WHERE parcel_id = '{parcel_id}'
    ORDER BY tax_year DESC
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        results = cursor.fetchall()
        cursor.close()
        
        return {
            "parcel_id": parcel_id,
            "assessments": [dict(zip(columns, row)) for row in results]
        }


@app.get("/api/parcels/{parcel_id}/exemptions")
async def get_parcel_exemptions(parcel_id: str, year: Optional[int] = None):
    """Get exemptions for a parcel"""
    
    year_filter = f"AND tax_year = {year}" if year else ""
    
    query = f"""
    SELECT
        tax_year,
        total_exemption_amount,
        total_exemption_count,
        homestead_exemption_amount,
        senior_exemption_amount,
        veteran_exemption_amount,
        disability_exemption_amount,
        homestead_count,
        senior_count,
        veteran_count,
        disability_count,
        active_exemptions,
        pending_exemptions,
        expired_exemptions,
        exemption_types
    FROM {CATALOG}.{MARTS_SCHEMA}.fct_exemptions_summary
    WHERE parcel_id = '{parcel_id}' {year_filter}
    ORDER BY tax_year DESC
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        results = cursor.fetchall()
        cursor.close()
        
        return {
            "parcel_id": parcel_id,
            "exemptions": [dict(zip(columns, row)) for row in results]
        }


@app.get("/api/parcels/{parcel_id}/appeals")
async def get_parcel_appeals(parcel_id: str):
    """Get appeal history for a parcel"""
    
    # Get individual appeals
    appeals_query = f"""
    SELECT
        appeal_id,
        filed_date,
        hearing_date,
        appeal_status,
        original_value,
        requested_value,
        final_value,
        value_reduction,
        reduction_percentage,
        resolution_notes
    FROM {CATALOG}.{MARTS_SCHEMA}.fct_appeals
    WHERE parcel_id = '{parcel_id}'
    ORDER BY filed_date DESC
    """
    
    # Get summary stats
    summary_query = f"""
    SELECT
        total_appeals,
        approved_count,
        denied_count,
        success_rate_pct,
        avg_value_reduction,
        total_value_reduction,
        first_appeal_date,
        most_recent_appeal_date,
        latest_appeal_status
    FROM {CATALOG}.{MARTS_SCHEMA}.fct_appeals_summary
    WHERE parcel_id = '{parcel_id}'
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Get appeals
        cursor.execute(appeals_query)
        appeals_columns = [desc[0] for desc in cursor.description]
        appeals_results = cursor.fetchall()
        
        # Get summary
        cursor.execute(summary_query)
        summary_columns = [desc[0] for desc in cursor.description]
        summary_result = cursor.fetchone()
        
        cursor.close()
        
        return {
            "parcel_id": parcel_id,
            "summary": dict(zip(summary_columns, summary_result)) if summary_result else {},
            "appeals": [dict(zip(appeals_columns, row)) for row in appeals_results]
        }


@app.get("/api/parcels/{parcel_id}/comparables")
async def get_parcel_comparables(parcel_id: str, limit: int = Query(10, le=50)):
    """Get comparable properties for a parcel"""
    
    query = f"""
    WITH target_parcel AS (
        SELECT
            p.parcel_id,
            p.land_use_code,
            p.city,
            p.latitude,
            p.longitude,
            a.assessed_value,
            a.tax_year
        FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
        JOIN {CATALOG}.{MARTS_SCHEMA}.fct_assessments a
            ON p.parcel_id = a.parcel_id
        WHERE p.parcel_id = '{parcel_id}'
            AND a.tax_year = (SELECT MAX(tax_year) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments)
    )
    SELECT
        p.parcel_id,
        p.address,
        p.city,
        p.zip_code,
        p.current_owner_name,
        p.land_use_description,
        p.acreage,
        a.assessed_value,
        a.market_value,
        a.assessed_value_change_pct,
        -- Calculate distance (approximate using lat/long)
        SQRT(
            POW((p.latitude - t.latitude) * 69, 2) +
            POW((p.longitude - t.longitude) * 69 * COS(t.latitude / 57.3), 2)
        ) as distance_miles
    FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
    JOIN {CATALOG}.{MARTS_SCHEMA}.fct_assessments a
        ON p.parcel_id = a.parcel_id
    CROSS JOIN target_parcel t
    WHERE p.parcel_id != '{parcel_id}'
        AND p.land_use_code = t.land_use_code
        AND p.city = t.city
        AND a.tax_year = t.tax_year
        AND a.assessed_value BETWEEN t.assessed_value * 0.8 AND t.assessed_value * 1.2
    ORDER BY distance_miles
    LIMIT {limit}
    """
    
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query)
        columns = [desc[0] for desc in cursor.description]
        results = cursor.fetchall()
        cursor.close()
        
        return {
            "parcel_id": parcel_id,
            "comparables": [dict(zip(columns, row)) for row in results]
        }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
