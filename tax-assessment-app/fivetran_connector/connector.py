"""
Fivetran Custom Connector for Tax Assessment Data
Syncs parcels, assessments, owners, exemptions, and appeals data
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from fivetran_connector_sdk import Connector
from fivetran_connector_sdk import Logging as log
from fivetran_connector_sdk import Operations as op

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TaxAssessmentConnector(Connector):
    """
    Custom Fivetran connector for tax assessment data.
    Supports incremental syncs with cursor-based pagination.
    """

    def __init__(self):
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """Create requests session with retry logic"""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    def schema(self, configuration: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Define the schema for all tables to be synced.
        Returns table definitions with columns and primary keys.
        """
        return [
            {
                "table": "parcels",
                "primary_key": ["parcel_id"],
                "columns": {
                    "parcel_id": "STRING",
                    "address": "STRING",
                    "city": "STRING",
                    "zip": "STRING",
                    "county": "STRING",
                    "land_use_code": "STRING",
                    "acreage": "FLOAT",
                    "latitude": "FLOAT",
                    "longitude": "FLOAT",
                    "created_at": "UTC_DATETIME",
                    "updated_at": "UTC_DATETIME"
                }
            },
            {
                "table": "assessments",
                "primary_key": ["assessment_id"],
                "columns": {
                    "assessment_id": "STRING",
                    "parcel_id": "STRING",
                    "tax_year": "INT",
                    "assessed_value": "INT",  # stored in cents
                    "market_value": "INT",  # stored in cents
                    "land_value": "INT",  # stored in cents
                    "improvement_value": "INT",  # stored in cents
                    "assessment_date": "UTC_DATETIME",
                    "assessor_id": "STRING",
                    "created_at": "UTC_DATETIME",
                    "updated_at": "UTC_DATETIME"
                }
            },
            {
                "table": "owners",
                "primary_key": ["owner_id"],
                "columns": {
                    "owner_id": "STRING",
                    "parcel_id": "STRING",
                    "owner_name": "STRING",
                    "mailing_address": "STRING",
                    "ownership_type": "STRING",
                    "effective_date": "UTC_DATETIME",
                    "created_at": "UTC_DATETIME",
                    "updated_at": "UTC_DATETIME"
                }
            },
            {
                "table": "exemptions",
                "primary_key": ["exemption_id"],
                "columns": {
                    "exemption_id": "STRING",
                    "parcel_id": "STRING",
                    "exemption_type": "STRING",  # homestead/senior/veteran/disability
                    "exemption_amount": "INT",  # stored in cents
                    "tax_year": "INT",
                    "status": "STRING",  # active/expired/pending
                    "created_at": "UTC_DATETIME",
                    "updated_at": "UTC_DATETIME"
                }
            },
            {
                "table": "appeals",
                "primary_key": ["appeal_id"],
                "columns": {
                    "appeal_id": "STRING",
                    "assessment_id": "STRING",
                    "parcel_id": "STRING",
                    "filed_date": "UTC_DATETIME",
                    "hearing_date": "UTC_DATETIME",
                    "appeal_status": "STRING",  # filed/scheduled/approved/denied/withdrawn
                    "original_value": "INT",  # stored in cents
                    "requested_value": "INT",  # stored in cents
                    "final_value": "INT",  # stored in cents
                    "resolution_notes": "STRING",
                    "created_at": "UTC_DATETIME",
                    "updated_at": "UTC_DATETIME"
                }
            }
        ]

    def update(self, configuration: Dict[str, Any], state: Dict[str, Any]) -> None:
        """
        Sync data from source to destination with incremental updates.
        Uses cursor-based pagination and state management.
        """
        api_url = configuration.get("api_url", "https://api.example.com/tax-data")
        api_key = configuration.get("api_key")
        start_date = configuration.get("start_date", "2020-01-01")

        # Set up headers
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        # Sync each table
        tables = ["parcels", "assessments", "owners", "exemptions", "appeals"]
        
        for table_name in tables:
            try:
                log.info(f"Starting sync for table: {table_name}")
                self._sync_table(
                    table_name=table_name,
                    api_url=api_url,
                    headers=headers,
                    state=state,
                    start_date=start_date
                )
                log.info(f"Completed sync for table: {table_name}")
            except Exception as e:
                log.severe(f"Error syncing table {table_name}: {str(e)}")
                raise

    def _sync_table(
        self,
        table_name: str,
        api_url: str,
        headers: Dict[str, str],
        state: Dict[str, Any],
        start_date: str
    ) -> None:
        """
        Sync a single table with cursor-based pagination.
        """
        # Get last sync cursor from state
        table_state = state.get(table_name, {})
        last_updated = table_state.get("last_updated", start_date)
        
        page = 1
        page_size = 1000
        has_more = True
        total_records = 0

        while has_more:
            try:
                # In production, this would call the actual API
                # For demo purposes, we'll generate mock data
                records = self._fetch_mock_data(
                    table_name=table_name,
                    last_updated=last_updated,
                    page=page,
                    page_size=page_size
                )

                if not records:
                    has_more = False
                    break

                # Process and upsert records
                for record in records:
                    # Emit upsert operation
                    op.upsert(table_name, record)
                    total_records += 1

                log.info(f"Synced {len(records)} records from {table_name} (page {page})")

                # Update state with latest timestamp
                if records:
                    latest_updated = max(
                        record.get("updated_at", last_updated) for record in records
                    )
                    state[table_name] = {
                        "last_updated": latest_updated,
                        "last_sync": datetime.utcnow().isoformat()
                    }
                    op.checkpoint(state)

                # Check if there are more pages
                if len(records) < page_size:
                    has_more = False
                else:
                    page += 1

            except requests.exceptions.RequestException as e:
                log.warning(f"Request error on page {page}: {str(e)}")
                if page > 1:  # Don't fail completely if we've synced some data
                    log.warning("Continuing with partial sync")
                    break
                else:
                    raise

        log.info(f"Total records synced for {table_name}: {total_records}")

    def _fetch_mock_data(
        self,
        table_name: str,
        last_updated: str,
        page: int,
        page_size: int
    ) -> List[Dict[str, Any]]:
        """
        Generate mock data for testing.
        In production, replace with actual API calls.
        """
        # Only return data on first page for demo
        if page > 1:
            return []

        base_timestamp = datetime.utcnow().isoformat()

        if table_name == "parcels":
            return [
                {
                    "parcel_id": f"P{str(i).zfill(8)}",
                    "address": f"{100 + i * 10} Main Street",
                    "city": ["Springfield", "Shelbyville", "Capital City"][i % 3],
                    "zip": ["12345", "12346", "12347"][i % 3],
                    "county": "Sample County",
                    "land_use_code": ["RES", "COM", "IND", "AGR"][i % 4],
                    "acreage": round(0.25 + (i * 0.1), 2),
                    "latitude": 40.7128 + (i * 0.001),
                    "longitude": -74.0060 - (i * 0.001),
                    "created_at": "2020-01-01T00:00:00Z",
                    "updated_at": base_timestamp
                }
                for i in range(min(50, page_size))
            ]

        elif table_name == "assessments":
            return [
                {
                    "assessment_id": f"A{str(i).zfill(8)}",
                    "parcel_id": f"P{str(i).zfill(8)}",
                    "tax_year": 2024 - (i % 5),
                    "assessed_value": 25000000 + (i * 100000),  # $250,000 in cents
                    "market_value": 30000000 + (i * 120000),
                    "land_value": 10000000 + (i * 50000),
                    "improvement_value": 15000000 + (i * 50000),
                    "assessment_date": f"{2024 - (i % 5)}-01-01T00:00:00Z",
                    "assessor_id": f"ASR{(i % 5) + 1}",
                    "created_at": "2020-01-01T00:00:00Z",
                    "updated_at": base_timestamp
                }
                for i in range(min(50, page_size))
            ]

        elif table_name == "owners":
            return [
                {
                    "owner_id": f"O{str(i).zfill(8)}",
                    "parcel_id": f"P{str(i).zfill(8)}",
                    "owner_name": f"Owner {chr(65 + (i % 26))}. Smith",
                    "mailing_address": f"{100 + i * 10} Main Street, Springfield, 12345",
                    "ownership_type": ["individual", "joint", "corporate", "trust"][i % 4],
                    "effective_date": "2020-01-01T00:00:00Z",
                    "created_at": "2020-01-01T00:00:00Z",
                    "updated_at": base_timestamp
                }
                for i in range(min(50, page_size))
            ]

        elif table_name == "exemptions":
            exemptions = []
            for i in range(min(30, page_size)):  # Not all parcels have exemptions
                if i % 3 == 0:  # Only some parcels have exemptions
                    exemptions.append({
                        "exemption_id": f"E{str(i).zfill(8)}",
                        "parcel_id": f"P{str(i).zfill(8)}",
                        "exemption_type": ["homestead", "senior", "veteran", "disability"][i % 4],
                        "exemption_amount": 2500000 + (i * 10000),  # $25,000 in cents
                        "tax_year": 2024,
                        "status": ["active", "pending", "expired"][i % 3],
                        "created_at": "2020-01-01T00:00:00Z",
                        "updated_at": base_timestamp
                    })
            return exemptions

        elif table_name == "appeals":
            appeals = []
            for i in range(min(15, page_size)):  # Even fewer appeals
                if i % 5 == 0:
                    appeals.append({
                        "appeal_id": f"AP{str(i).zfill(8)}",
                        "assessment_id": f"A{str(i).zfill(8)}",
                        "parcel_id": f"P{str(i).zfill(8)}",
                        "filed_date": f"2024-0{(i % 9) + 1}-01T00:00:00Z",
                        "hearing_date": f"2024-{((i % 9) + 2):02d}-01T00:00:00Z",
                        "appeal_status": ["filed", "scheduled", "approved", "denied", "withdrawn"][i % 5],
                        "original_value": 30000000 + (i * 100000),
                        "requested_value": 25000000 + (i * 100000),
                        "final_value": 27000000 + (i * 100000),
                        "resolution_notes": f"Appeal case {i} resolved with adjustment",
                        "created_at": "2024-01-01T00:00:00Z",
                        "updated_at": base_timestamp
                    })
            return appeals

        return []


# Entry point for Fivetran
connector = TaxAssessmentConnector()

if __name__ == "__main__":
    # For local testing
    connector.debug()
