"""
Fivetran Custom Connector for Tax Assessment Data.

Syncs parcels, assessments, owners, exemptions, and appeals records from a
source API (or generated mock data for the demo) into a Fivetran destination.

Built against `fivetran-connector-sdk>=2.8`. The SDK exposes a factory-style
`Connector(update=fn, schema=fn)` API — methods on a subclass are not
supported.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from fivetran_connector_sdk import Connector
from fivetran_connector_sdk import Logging as log
from fivetran_connector_sdk import Operations as op

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def schema(configuration: dict[str, Any]) -> list[dict[str, Any]]:
    """Schema for the five tables the connector emits.

    Monetary values are stored as INT cents to avoid float precision issues;
    dbt's `cents_to_dollars` macro converts them downstream.
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
                "updated_at": "UTC_DATETIME",
            },
        },
        {
            "table": "assessments",
            "primary_key": ["assessment_id"],
            "columns": {
                "assessment_id": "STRING",
                "parcel_id": "STRING",
                "tax_year": "INT",
                "assessed_value": "INT",
                "market_value": "INT",
                "land_value": "INT",
                "improvement_value": "INT",
                "assessment_date": "UTC_DATETIME",
                "assessor_id": "STRING",
                "created_at": "UTC_DATETIME",
                "updated_at": "UTC_DATETIME",
            },
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
                "updated_at": "UTC_DATETIME",
            },
        },
        {
            "table": "exemptions",
            "primary_key": ["exemption_id"],
            "columns": {
                "exemption_id": "STRING",
                "parcel_id": "STRING",
                "exemption_type": "STRING",
                "exemption_amount": "INT",
                "tax_year": "INT",
                "status": "STRING",
                "created_at": "UTC_DATETIME",
                "updated_at": "UTC_DATETIME",
            },
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
                "appeal_status": "STRING",
                "original_value": "INT",
                "requested_value": "INT",
                "final_value": "INT",
                "resolution_notes": "STRING",
                "created_at": "UTC_DATETIME",
                "updated_at": "UTC_DATETIME",
            },
        },
    ]


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

TABLES = ("parcels", "assessments", "owners", "exemptions", "appeals")


def update(configuration: dict[str, Any], state: dict[str, Any]):
    """Incremental sync. Yields op.upsert / op.checkpoint operations."""
    api_url = configuration.get("api_url", "https://api.example.com/tax-data")
    api_key = configuration.get("api_key")
    start_date = configuration.get("start_date", "2020-01-01")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    session = _create_session()

    for table_name in TABLES:
        log.info(f"Starting sync for table: {table_name}")
        yield from _sync_table(
            table_name=table_name,
            api_url=api_url,
            headers=headers,
            session=session,
            state=state,
            start_date=start_date,
        )
        log.info(f"Completed sync for table: {table_name}")


def _sync_table(
    table_name: str,
    api_url: str,
    headers: dict[str, str],
    session: requests.Session,
    state: dict[str, Any],
    start_date: str,
):
    table_state = state.get(table_name, {})
    last_updated = table_state.get("last_updated", start_date)

    page = 1
    page_size = 1000
    total_records = 0

    while True:
        try:
            records = _fetch_mock_data(
                table_name=table_name,
                last_updated=last_updated,
                page=page,
                page_size=page_size,
            )
        except requests.exceptions.RequestException as e:
            log.warning(f"Request error on {table_name} page {page}: {e}")
            if page > 1:
                log.warning("Continuing with partial sync.")
                break
            raise

        if not records:
            break

        for record in records:
            yield op.upsert(table=table_name, data=record)
            total_records += 1

        latest_updated = max(r.get("updated_at", last_updated) for r in records)
        state[table_name] = {
            "last_updated": latest_updated,
            "last_sync": _utc_now_iso(),
        }
        yield op.checkpoint(state)

        log.info(f"Synced {len(records)} records from {table_name} (page {page})")

        if len(records) < page_size:
            break
        page += 1

    log.info(f"Total records synced for {table_name}: {total_records}")


# ---------------------------------------------------------------------------
# Mock data (replace with real API calls for production)
# ---------------------------------------------------------------------------

def _fetch_mock_data(table_name: str, last_updated: str, page: int, page_size: int):
    if page > 1:
        return []

    ts = _utc_now_iso()

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
                "updated_at": ts,
            }
            for i in range(min(50, page_size))
        ]

    if table_name == "assessments":
        return [
            {
                "assessment_id": f"A{str(i).zfill(8)}",
                "parcel_id": f"P{str(i).zfill(8)}",
                "tax_year": 2024 - (i % 5),
                "assessed_value": 25000000 + (i * 100000),
                "market_value": 30000000 + (i * 120000),
                "land_value": 10000000 + (i * 50000),
                "improvement_value": 15000000 + (i * 50000),
                "assessment_date": f"{2024 - (i % 5)}-01-01T00:00:00Z",
                "assessor_id": f"ASR{(i % 5) + 1}",
                "created_at": "2020-01-01T00:00:00Z",
                "updated_at": ts,
            }
            for i in range(min(50, page_size))
        ]

    if table_name == "owners":
        return [
            {
                "owner_id": f"O{str(i).zfill(8)}",
                "parcel_id": f"P{str(i).zfill(8)}",
                "owner_name": f"Owner {chr(65 + (i % 26))}. Smith",
                "mailing_address": f"{100 + i * 10} Main Street, Springfield, 12345",
                "ownership_type": ["individual", "joint", "corporate", "trust"][i % 4],
                "effective_date": "2020-01-01T00:00:00Z",
                "created_at": "2020-01-01T00:00:00Z",
                "updated_at": ts,
            }
            for i in range(min(50, page_size))
        ]

    if table_name == "exemptions":
        rows = []
        for i in range(min(30, page_size)):
            if i % 3 == 0:
                rows.append({
                    "exemption_id": f"E{str(i).zfill(8)}",
                    "parcel_id": f"P{str(i).zfill(8)}",
                    "exemption_type": ["homestead", "senior", "veteran", "disability"][i % 4],
                    "exemption_amount": 2500000 + (i * 10000),
                    "tax_year": 2024,
                    "status": ["active", "pending", "expired"][i % 3],
                    "created_at": "2020-01-01T00:00:00Z",
                    "updated_at": ts,
                })
        return rows

    if table_name == "appeals":
        rows = []
        for i in range(min(15, page_size)):
            if i % 5 == 0:
                rows.append({
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
                    "updated_at": ts,
                })
        return rows

    return []


# ---------------------------------------------------------------------------
# Connector entry point — SDK 2.x factory pattern.
# ---------------------------------------------------------------------------

connector = Connector(update=update, schema=schema)


if __name__ == "__main__":
    connector.debug()
