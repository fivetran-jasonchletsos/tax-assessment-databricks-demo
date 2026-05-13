"""
Load the WPRDC parcel snapshot into the Databricks gold layer at
`jason_chletsos.jason_chletsos_marts.*`.

The website still reads JSON snapshots at runtime (static site), but
those snapshots are now built FROM Databricks marts (see
build_snapshot.py) instead of directly from WPRDC. This script gets
the marts populated so build_snapshot.py has something to query.

Required environment:
    DATABRICKS_HOST          dbc-c48d38b1-67f3.cloud.databricks.com
    DATABRICKS_HTTP_PATH     /sql/1.0/warehouses/3e84683f91b0ee83
    DATABRICKS_TOKEN         personal access token

Optional environment:
    DATABRICKS_CATALOG       default: jason_chletsos
    DATABRICKS_MARTS_SCHEMA  default: jason_chletsos_marts
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "frontend" / "public" / "data" / "parcels.json"

CATALOG = os.getenv("DATABRICKS_CATALOG", "jason_chletsos")
MARTS_SCHEMA = os.getenv("DATABRICKS_MARTS_SCHEMA", "jason_chletsos_marts")


def connect():
    try:
        from databricks import sql
    except ImportError:
        print("Install databricks-sql-connector: pip install databricks-sql-connector")
        sys.exit(1)
    for var in ("DATABRICKS_HOST", "DATABRICKS_HTTP_PATH", "DATABRICKS_TOKEN"):
        if not os.getenv(var):
            print(f"❌ Set {var} in your environment.")
            sys.exit(1)
    return sql.connect(
        server_hostname=os.environ["DATABRICKS_HOST"],
        http_path=os.environ["DATABRICKS_HTTP_PATH"],
        access_token=os.environ["DATABRICKS_TOKEN"],
    )


def load_snapshot() -> list[dict]:
    raw = json.loads(SNAPSHOT.read_text())
    if "rows" in raw and "columns" in raw:
        cols = raw["columns"]
        return [
            {cols[i]: row[i] for i in range(len(cols))} for row in raw["rows"]
        ]
    return raw.get("results", [])


# ---------------------------------------------------------------------------

DDL = {
    "dim_parcels": f"""
        CREATE OR REPLACE TABLE {CATALOG}.{MARTS_SCHEMA}.dim_parcels (
            parcel_id STRING,
            address STRING,
            city STRING,
            zip_code STRING,
            county STRING,
            current_owner_name STRING,
            current_mailing_address STRING,
            current_ownership_type STRING,
            land_use_code STRING,
            land_use_description STRING,
            acreage DOUBLE,
            latitude DOUBLE,
            longitude DOUBLE
        ) USING DELTA
    """,
    "fct_assessments": f"""
        CREATE OR REPLACE TABLE {CATALOG}.{MARTS_SCHEMA}.fct_assessments (
            assessment_id STRING,
            parcel_id STRING,
            tax_year INT,
            assessed_value BIGINT,
            market_value BIGINT,
            land_value BIGINT,
            improvement_value BIGINT,
            land_value_percentage DOUBLE,
            improvement_value_percentage DOUBLE,
            market_to_assessed_ratio DOUBLE,
            assessed_value_change BIGINT,
            assessed_value_change_pct DOUBLE,
            total_exemption_amount BIGINT,
            net_assessed_value BIGINT,
            assessment_date STRING
        ) USING DELTA
    """,
    # Empty tables so build_snapshot.py's queries return [] instead of
    # erroring out. dbt run can populate them later from raw appeals data.
    "fct_exemptions_summary": f"""
        CREATE OR REPLACE TABLE {CATALOG}.{MARTS_SCHEMA}.fct_exemptions_summary (
            parcel_id STRING,
            tax_year INT,
            total_exemption_amount BIGINT,
            total_exemption_count INT,
            homestead_exemption_amount BIGINT,
            senior_exemption_amount BIGINT,
            veteran_exemption_amount BIGINT,
            disability_exemption_amount BIGINT,
            homestead_count INT,
            senior_count INT,
            veteran_count INT,
            disability_count INT,
            active_exemptions INT,
            pending_exemptions INT,
            expired_exemptions INT,
            exemption_types STRING
        ) USING DELTA
    """,
    "fct_appeals": f"""
        CREATE OR REPLACE TABLE {CATALOG}.{MARTS_SCHEMA}.fct_appeals (
            appeal_id STRING,
            assessment_id STRING,
            parcel_id STRING,
            filed_date STRING,
            hearing_date STRING,
            appeal_status STRING,
            original_value BIGINT,
            requested_value BIGINT,
            final_value BIGINT,
            value_reduction BIGINT,
            reduction_percentage DOUBLE,
            resolution_notes STRING,
            created_at STRING,
            updated_at STRING
        ) USING DELTA
    """,
    "fct_appeals_summary": f"""
        CREATE OR REPLACE TABLE {CATALOG}.{MARTS_SCHEMA}.fct_appeals_summary (
            parcel_id STRING,
            total_appeals INT,
            approved_count INT,
            denied_count INT,
            success_rate_pct DOUBLE,
            avg_value_reduction DOUBLE,
            total_value_reduction BIGINT,
            first_appeal_date STRING,
            most_recent_appeal_date STRING,
            latest_appeal_status STRING
        ) USING DELTA
    """,
}


def main() -> int:
    print(f"Connecting to {os.environ['DATABRICKS_HOST']} ...")
    conn = connect()
    cur = conn.cursor()
    try:
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{MARTS_SCHEMA}")
        for table, ddl in DDL.items():
            print(f"  CREATE OR REPLACE {table}")
            cur.execute(ddl)

        parcels = load_snapshot()
        print(f"\nLoaded {len(parcels)} parcels from snapshot.")

        BATCH = 1000
        # ---- dim_parcels
        print(f"Inserting {len(parcels)} rows into dim_parcels...")
        for i in range(0, len(parcels), BATCH):
            chunk = parcels[i : i + BATCH]
            values = []
            for p in chunk:
                values.append(
                    "("
                    + ", ".join([
                        _sql_str(p.get("parcel_id")),
                        _sql_str(p.get("address")),
                        _sql_str(p.get("city")),
                        _sql_str(p.get("zip_code")),
                        "'Allegheny'",
                        _sql_str(p.get("current_owner_name")),
                        _sql_str(p.get("current_owner_name")),  # mailing addr
                        "NULL",  # ownership_type
                        "NULL",  # land_use_code
                        _sql_str(p.get("land_use_description")),
                        "NULL",  # acreage
                        _sql_num(p.get("latitude")),
                        _sql_num(p.get("longitude")),
                    ])
                    + ")"
                )
            cur.execute(
                f"INSERT INTO {CATALOG}.{MARTS_SCHEMA}.dim_parcels VALUES {', '.join(values)}"
            )
            if (i // BATCH) % 10 == 0:
                print(f"  dim_parcels: {i + len(chunk)}/{len(parcels)}")

        # ---- fct_assessments (current-year row per parcel)
        print(f"\nInserting {len(parcels)} rows into fct_assessments...")
        for i in range(0, len(parcels), BATCH):
            chunk = parcels[i : i + BATCH]
            values = []
            for p in chunk:
                assessed = int(p.get("assessed_value") or 0)
                market = int(p.get("market_value") or 0)
                exempt = int(p.get("total_exemption_amount") or 0)
                land = int(assessed * 0.25)
                impr = assessed - land
                change_pct = p.get("assessed_value_change_pct") or 0
                ratio = (market / assessed) if assessed else 0
                year = int(p.get("tax_year") or 2026)
                values.append(
                    "("
                    + ", ".join([
                        f"'{p.get('parcel_id')}-A-{year}'",
                        _sql_str(p.get("parcel_id")),
                        str(year),
                        str(assessed),
                        str(market),
                        str(land),
                        str(impr),
                        "25.0",
                        "75.0",
                        f"{ratio:.4f}",
                        "0",
                        f"{change_pct:.2f}",
                        str(exempt),
                        str(assessed - exempt),
                        f"'{year}-01-15'",
                    ])
                    + ")"
                )
            cur.execute(
                f"INSERT INTO {CATALOG}.{MARTS_SCHEMA}.fct_assessments VALUES {', '.join(values)}"
            )
            if (i // BATCH) % 10 == 0:
                print(f"  fct_assessments: {i + len(chunk)}/{len(parcels)}")

        print("\n✅ Load complete.")
        cur.execute(f"SELECT COUNT(*) FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels")
        print(f"   dim_parcels rows: {cur.fetchone()[0]}")
        cur.execute(f"SELECT COUNT(*) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments")
        print(f"   fct_assessments rows: {cur.fetchone()[0]}")
    finally:
        cur.close()
        conn.close()
    return 0


def _sql_str(v) -> str:
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def _sql_num(v) -> str:
    if v is None or v == "":
        return "NULL"
    try:
        return str(float(v))
    except (TypeError, ValueError):
        return "NULL"


if __name__ == "__main__":
    raise SystemExit(main())
