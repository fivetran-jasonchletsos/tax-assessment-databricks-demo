"""
Build a static JSON snapshot of the Allegheny County tax assessment marts
for the public-facing site.

Run locally:
    DATABRICKS_HOST=... DATABRICKS_HTTP_PATH=... DATABRICKS_TOKEN=... \
        python scripts/build_snapshot.py

In GitHub Actions the credentials come from repo secrets — see
.github/workflows/refresh-data.yml. If credentials are missing or the
connection fails, the script falls back to the curated sample bundle so the
deployed site always renders.

Output layout (under frontend/public/data/):
    summary.json
    parcels.json
    parcels/<parcel_id>.json   (detail bundle — assessments/exemptions/appeals/comparables)
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "data"
PARCEL_DIR = OUTPUT_DIR / "parcels"

CATALOG = os.getenv("DATABRICKS_CATALOG", "jason_chletsos")
MARTS_SCHEMA = os.getenv("DATABRICKS_MARTS_SCHEMA", "jason_chletsos_marts")

# Cap the snapshot so the static site stays lean.
MAX_PARCELS = int(os.getenv("SNAPSHOT_MAX_PARCELS", "500"))
MAX_COMPARABLES = 6


def have_databricks_creds() -> bool:
    return all(os.getenv(k) for k in ("DATABRICKS_HOST", "DATABRICKS_HTTP_PATH", "DATABRICKS_TOKEN"))


def databricks_cursor():
    from databricks import sql  # type: ignore

    conn = sql.connect(
        server_hostname=os.environ["DATABRICKS_HOST"],
        http_path=os.environ["DATABRICKS_HTTP_PATH"],
        access_token=os.environ["DATABRICKS_TOKEN"],
    )
    return conn, conn.cursor()


def rows_to_dicts(cursor) -> list[dict[str, Any]]:
    cols = [c[0] for c in cursor.description]
    out = []
    for row in cursor.fetchall():
        d = {}
        for i, c in enumerate(cols):
            v = row[i]
            # Serialize Decimals, dates, etc.
            if hasattr(v, "isoformat"):
                v = v.isoformat()
            elif v is not None and not isinstance(v, (int, float, str, bool, list, dict)):
                v = float(v) if hasattr(v, "__float__") else str(v)
            elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                v = None
            d[c] = v
        out.append(d)
    return out


def first(cursor) -> dict[str, Any] | None:
    rows = rows_to_dicts(cursor)
    return rows[0] if rows else None


def extract_from_databricks() -> dict[str, Any]:
    """Returns a dict matching the JSON snapshot layout."""
    conn, cur = databricks_cursor()
    try:
        # ---- summary
        cur.execute(
            f"""
            SELECT
                COUNT(DISTINCT parcel_id) AS total_parcels,
                ROUND(AVG(assessed_value), 2) AS avg_assessed_value,
                SUM(total_exemption_amount) AS total_exemptions,
                MAX(tax_year) AS current_tax_year
            FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments
            WHERE tax_year = (SELECT MAX(tax_year) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments)
            """
        )
        summary = first(cur) or {}

        # ---- parcels (most-recent-year row joined with dim)
        cur.execute(
            f"""
            SELECT
                p.parcel_id, p.address, p.city, p.zip_code, p.current_owner_name,
                p.land_use_description, a.tax_year, a.assessed_value, a.market_value,
                a.total_exemption_amount, a.assessed_value_change_pct,
                p.latitude, p.longitude
            FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
            JOIN {CATALOG}.{MARTS_SCHEMA}.fct_assessments a ON p.parcel_id = a.parcel_id
            WHERE a.tax_year = (SELECT MAX(tax_year) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments)
            ORDER BY a.assessed_value DESC
            LIMIT {MAX_PARCELS}
            """
        )
        parcels = rows_to_dicts(cur)

        # ---- per-parcel detail
        details: dict[str, dict[str, Any]] = {}
        for p in parcels:
            pid = p["parcel_id"]
            cur.execute(
                f"""
                SELECT parcel_id, address, city, zip_code, county, current_owner_name,
                       current_mailing_address, current_ownership_type, land_use_code,
                       land_use_description, acreage, latitude, longitude
                FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels WHERE parcel_id = '{pid}'
                """
            )
            parcel = first(cur) or {}

            cur.execute(
                f"""
                SELECT tax_year, assessed_value, market_value, land_value, improvement_value,
                       land_value_percentage, improvement_value_percentage,
                       market_to_assessed_ratio, assessed_value_change,
                       assessed_value_change_pct, total_exemption_amount,
                       net_assessed_value, assessment_date
                FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments
                WHERE parcel_id = '{pid}' ORDER BY tax_year DESC
                """
            )
            assessments = rows_to_dicts(cur)

            try:
                cur.execute(
                    f"""
                    SELECT tax_year, total_exemption_amount, total_exemption_count,
                           homestead_exemption_amount, senior_exemption_amount,
                           veteran_exemption_amount, disability_exemption_amount,
                           homestead_count, senior_count, veteran_count, disability_count,
                           active_exemptions, pending_exemptions, expired_exemptions,
                           exemption_types
                    FROM {CATALOG}.{MARTS_SCHEMA}.fct_exemptions_summary
                    WHERE parcel_id = '{pid}' ORDER BY tax_year DESC
                    """
                )
                exemptions = rows_to_dicts(cur)
            except Exception:
                exemptions = []

            try:
                cur.execute(
                    f"""
                    SELECT appeal_id, filed_date, hearing_date, appeal_status,
                           original_value, requested_value, final_value,
                           value_reduction, reduction_percentage, resolution_notes
                    FROM {CATALOG}.{MARTS_SCHEMA}.fct_appeals
                    WHERE parcel_id = '{pid}' ORDER BY filed_date DESC
                    """
                )
                appeals = rows_to_dicts(cur)
            except Exception:
                appeals = []

            try:
                cur.execute(
                    f"""
                    SELECT total_appeals, approved_count, denied_count, success_rate_pct,
                           avg_value_reduction, total_value_reduction, first_appeal_date,
                           most_recent_appeal_date, latest_appeal_status
                    FROM {CATALOG}.{MARTS_SCHEMA}.fct_appeals_summary
                    WHERE parcel_id = '{pid}'
                    """
                )
                appeals_summary = first(cur) or {}
            except Exception:
                appeals_summary = {}

            cur.execute(
                f"""
                WITH t AS (
                    SELECT p.parcel_id, p.land_use_code, p.city, p.latitude, p.longitude,
                           a.assessed_value, a.tax_year
                    FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
                    JOIN {CATALOG}.{MARTS_SCHEMA}.fct_assessments a ON p.parcel_id = a.parcel_id
                    WHERE p.parcel_id = '{pid}'
                      AND a.tax_year = (SELECT MAX(tax_year) FROM {CATALOG}.{MARTS_SCHEMA}.fct_assessments)
                )
                SELECT p.parcel_id, p.address, p.city, p.zip_code, p.current_owner_name,
                       p.land_use_description, p.acreage, a.assessed_value, a.market_value,
                       a.assessed_value_change_pct,
                       SQRT(POW((p.latitude - t.latitude) * 69, 2) +
                            POW((p.longitude - t.longitude) * 69 * COS(t.latitude / 57.3), 2)) AS distance_miles
                FROM {CATALOG}.{MARTS_SCHEMA}.dim_parcels p
                JOIN {CATALOG}.{MARTS_SCHEMA}.fct_assessments a ON p.parcel_id = a.parcel_id
                CROSS JOIN t
                WHERE p.parcel_id != '{pid}'
                  AND p.land_use_code = t.land_use_code
                  AND p.city = t.city
                  AND a.tax_year = t.tax_year
                  AND a.assessed_value BETWEEN t.assessed_value * 0.8 AND t.assessed_value * 1.2
                ORDER BY distance_miles
                LIMIT {MAX_COMPARABLES}
                """
            )
            comparables = rows_to_dicts(cur)

            details[pid] = {
                "parcel": parcel,
                "assessments": {"parcel_id": pid, "assessments": assessments},
                "exemptions": {"parcel_id": pid, "exemptions": exemptions},
                "appeals": {"parcel_id": pid, "summary": appeals_summary, "appeals": appeals},
                "comparables": {"parcel_id": pid, "comparables": comparables},
            }

        return {"summary": summary, "parcels": parcels, "details": details}
    finally:
        cur.close()
        conn.close()


def fallback_sample() -> dict[str, Any]:
    """Curated sample (mirrors the TS mockData) so the site is never empty."""
    base_parcels = json.loads((Path(__file__).parent / "fallback_parcels.json").read_text())
    summary = {
        "total_parcels": 583412,
        "avg_assessed_value": 187450.32,
        "total_exemptions": 412300000,
        "current_tax_year": 2025,
    }
    details: dict[str, dict[str, Any]] = {}
    for p in base_parcels:
        pid = p["parcel_id"]
        details[pid] = _synthesize_detail(p, base_parcels)
    return {"summary": summary, "parcels": base_parcels, "details": details}


def _synthesize_detail(p: dict[str, Any], all_parcels: list[dict[str, Any]]):
    pid = p["parcel_id"]
    parcel = {
        "parcel_id": pid,
        "address": p["address"],
        "city": p["city"],
        "zip_code": p["zip_code"],
        "county": "Allegheny",
        "current_owner_name": p["current_owner_name"],
        "current_mailing_address": f"{p['address']}, {p['city']}, PA {p['zip_code']}",
        "current_ownership_type": "Individual",
        "land_use_code": "R-1",
        "land_use_description": p["land_use_description"],
        "acreage": 0.18,
        "latitude": p["latitude"],
        "longitude": p["longitude"],
    }
    # assessment history (6 yrs back)
    current = p["assessed_value"]
    years = [2025, 2024, 2023, 2022, 2021, 2020]
    rows = []
    val = current
    for i, year in enumerate(years):
        prev = val
        val = current if i == 0 else int(prev / (1 + (0.05 - i * 0.005)))
        market = int(val * 1.29)
        land = int(val * 0.22)
        improvement = val - land
        change = 0 if i == len(years) - 1 else prev - val
        rows.append({
            "tax_year": year,
            "assessed_value": current if i == 0 else val,
            "market_value": market,
            "land_value": land,
            "improvement_value": improvement,
            "land_value_percentage": 22,
            "improvement_value_percentage": 78,
            "market_to_assessed_ratio": 1.29,
            "assessed_value_change": change,
            "assessed_value_change_pct": 0 if i == len(years) - 1 else (change / val) * 100,
            "total_exemption_amount": p.get("total_exemption_amount", 0),
            "net_assessed_value": val - (p.get("total_exemption_amount", 0) or 0),
            "assessment_date": f"{year}-01-15",
        })

    exemptions_rows = []
    if (p.get("total_exemption_amount") or 0) > 0:
        homestead = 18000
        senior = max(0, (p["total_exemption_amount"]) - homestead)
        for year in [2025, 2024, 2023]:
            exemptions_rows.append({
                "tax_year": year,
                "total_exemption_amount": p["total_exemption_amount"],
                "total_exemption_count": 2 if senior else 1,
                "homestead_exemption_amount": homestead,
                "senior_exemption_amount": senior,
                "veteran_exemption_amount": 0,
                "disability_exemption_amount": 0,
                "homestead_count": 1,
                "senior_count": 1 if senior else 0,
                "veteran_count": 0,
                "disability_count": 0,
                "active_exemptions": 2 if senior else 1,
                "pending_exemptions": 0,
                "expired_exemptions": 0,
                "exemption_types": "HOMESTEAD, SENIOR" if senior else "HOMESTEAD",
            })

    appeals_list = []
    appeals_summary: dict[str, Any] = {}
    if pid in {"0001-A-00150", "0102-N-00007", "0014-D-00042"}:
        orig = int(p["assessed_value"] * 1.08)
        final = p["assessed_value"]
        reduction = int(p["assessed_value"] * 0.08)
        appeals_list = [{
            "appeal_id": f"APP-{pid}-2024-01",
            "filed_date": "2024-03-12",
            "hearing_date": "2024-06-08",
            "appeal_status": "APPROVED",
            "original_value": orig,
            "requested_value": int(p["assessed_value"] * 0.95),
            "final_value": final,
            "value_reduction": reduction,
            "reduction_percentage": 7.4,
            "resolution_notes": "Board of Property Assessment Appeals reduced based on comparable sales evidence.",
        }]
        appeals_summary = {
            "total_appeals": 1,
            "approved_count": 1,
            "denied_count": 0,
            "success_rate_pct": 100,
            "avg_value_reduction": reduction,
            "total_value_reduction": reduction,
            "first_appeal_date": "2024-03-12",
            "most_recent_appeal_date": "2024-03-12",
            "latest_appeal_status": "APPROVED",
        }

    others = [o for o in all_parcels if o["parcel_id"] != pid][:5]
    comparables = [
        {
            **o,
            "acreage": 0.18 + i * 0.03,
            "distance_miles": 0.3 + i * 0.4,
        }
        for i, o in enumerate(others)
    ]

    return {
        "parcel": parcel,
        "assessments": {"parcel_id": pid, "assessments": rows},
        "exemptions": {"parcel_id": pid, "exemptions": exemptions_rows},
        "appeals": {"parcel_id": pid, "summary": appeals_summary, "appeals": appeals_list},
        "comparables": {"parcel_id": pid, "comparables": comparables},
    }


def write_snapshot(bundle: dict[str, Any], source: str) -> None:
    if PARCEL_DIR.exists():
        shutil.rmtree(PARCEL_DIR)
    PARCEL_DIR.mkdir(parents=True, exist_ok=True)

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    summary_with_meta = {
        **bundle["summary"],
        "generated_at": generated_at,
        "source": source,
    }
    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary_with_meta, indent=2))
    (OUTPUT_DIR / "parcels.json").write_text(
        json.dumps({"count": len(bundle["parcels"]), "results": bundle["parcels"]}, indent=2)
    )

    for pid, detail in bundle["details"].items():
        safe = pid.replace("/", "_")
        (PARCEL_DIR / f"{safe}.json").write_text(json.dumps(detail, indent=2))

    print(f"Wrote snapshot ({source}): {len(bundle['parcels'])} parcels, {len(bundle['details'])} detail bundles")


def main() -> int:
    if have_databricks_creds():
        try:
            print("Pulling live snapshot from Databricks...")
            bundle = extract_from_databricks()
            write_snapshot(bundle, source="live")
            return 0
        except Exception as e:
            print(f"Databricks extraction failed: {e}", file=sys.stderr)
            print("Falling back to curated sample.", file=sys.stderr)

    print("No Databricks credentials — writing curated sample snapshot.")
    bundle = fallback_sample()
    write_snapshot(bundle, source="demo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
