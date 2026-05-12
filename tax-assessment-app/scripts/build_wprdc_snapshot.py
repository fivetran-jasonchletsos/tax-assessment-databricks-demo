"""
Build a demo snapshot directly from WPRDC's CKAN datastore (Allegheny County
property assessments + appeals). This is the FAST PATH to make the public
site searchable against real records — it bypasses the
Fivetran→Databricks→dbt pipeline (which currently emits synthetic data
from the custom connector's mock generator).

Output layout mirrors what build_snapshot.py writes:
    frontend/public/data/summary.json
    frontend/public/data/parcels.json
    frontend/public/data/parcels/<parcel_id>.json
"""

from __future__ import annotations

import datetime as dt
import json
import shutil
import urllib.parse
from pathlib import Path
from typing import Any

import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "public" / "data"
PARCEL_DIR = OUTPUT_DIR / "parcels"

ASSESSMENTS_RESOURCE = "9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5"
APPEALS_RESOURCE = "8a7607fb-c93e-4d7a-9b23-528b5c25b1de"

# Areas to include in the snapshot. Glenshaw (15116) is the demo presenter's
# ZIP. Pittsburgh ZIPs span Squirrel Hill, Oakland, Downtown, Lawrenceville,
# North Side, Mt Lebanon, Aspinwall — the most commonly searched neighborhoods.
FEATURED_ZIPS = [
    15116,  # Glenshaw — presenter's ZIP, expanded sample
    15217,  # Squirrel Hill
    15222,  # Downtown
    15206,  # East Liberty / Highland Park
    15212,  # North Side
    15201,  # Lawrenceville
    15228,  # Mt Lebanon
    15215,  # Aspinwall / Fox Chapel
    15213,  # Oakland
    15232,  # Shadyside
]
PER_ZIP_LIMIT = {15116: 250}  # presenter's ZIP gets a generous sample
DEFAULT_PER_ZIP = 60


def ckan(action: str, **params) -> dict[str, Any]:
    url = f"https://data.wprdc.org/api/3/action/{action}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read())


def query_sql(sql: str) -> list[dict[str, Any]]:
    res = ckan("datastore_search_sql", sql=sql)
    if not res.get("success"):
        raise RuntimeError(f"WPRDC query failed: {res.get('error')}")
    return res["result"]["records"]


# ---------------------------------------------------------------------------
# Pull
# ---------------------------------------------------------------------------

PARCEL_COLS = ",".join(
    f'"{c}"'
    for c in [
        "PARID",
        "PROPERTYHOUSENUM",
        "PROPERTYADDRESS",
        "PROPERTYCITY",
        "PROPERTYSTATE",
        "PROPERTYZIP",
        "MUNIDESC",
        "SCHOOLDESC",
        "NEIGHDESC",
        "CLASSDESC",
        "USEDESC",
        "LOTAREA",
        "YEARBLT",
        "BEDROOMS",
        "FULLBATHS",
        "HALFBATHS",
        "FINISHEDLIVINGAREA",
        "STYLEDESC",
        "GRADEDESC",
        "CONDITIONDESC",
        "OWNERDESC",
        "CHANGENOTICEADDRESS1",
        "CHANGENOTICEADDRESS2",
        "CHANGENOTICEADDRESS3",
        "HOMESTEADFLAG",
        "FARMSTEADFLAG",
        "ABATEMENTFLAG",
        "COUNTYBUILDING",
        "COUNTYLAND",
        "COUNTYTOTAL",
        "COUNTYEXEMPTBLDG",
        "LOCALTOTAL",
        "FAIRMARKETBUILDING",
        "FAIRMARKETLAND",
        "FAIRMARKETTOTAL",
        "SALEDATE",
        "SALEPRICE",
        "PREVSALEDATE",
        "PREVSALEPRICE",
        "PREVSALEDATE2",
        "PREVSALEPRICE2",
        "TAXYEAR",
        "ASOFDATE",
    ]
)


def fetch_parcels() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for zip_code in FEATURED_ZIPS:
        limit = PER_ZIP_LIMIT.get(zip_code, DEFAULT_PER_ZIP)
        sql = (
            f"SELECT {PARCEL_COLS} FROM \"{ASSESSMENTS_RESOURCE}\" "
            f"WHERE \"PROPERTYZIP\" = {zip_code} "
            f"  AND \"COUNTYTOTAL\" > 0 "
            f"  AND \"PROPERTYADDRESS\" IS NOT NULL "
            f"ORDER BY \"COUNTYTOTAL\" DESC NULLS LAST "
            f"LIMIT {limit}"
        )
        rows = query_sql(sql)
        print(f"  {zip_code}: {len(rows)} parcels")
        out.extend(rows)
    # Ensure every Glenshaw street the demo presenter might reference is
    # represented in full, regardless of value rank.
    for street in GLENSHAW_STREETS:
        sql = (
            f"SELECT {PARCEL_COLS} FROM \"{ASSESSMENTS_RESOURCE}\" "
            f"WHERE \"PROPERTYZIP\" = 15116 "
            f"  AND \"PROPERTYADDRESS\" ILIKE '%{street}%' "
            f"  AND \"COUNTYTOTAL\" > 0 "
            f"LIMIT 200"
        )
        try:
            rows = query_sql(sql)
            print(f"  Glenshaw '{street}': +{len(rows)} parcels")
            out.extend(rows)
        except Exception as e:
            print(f"  ({street} lookup failed: {e})")
    return out


# Streets the demo presenter may search. Expand as needed.
GLENSHAW_STREETS = [
    "ANGELINE",
    "BUTLER PLANK",
    "MOUNT ROYAL",
    "DELLWOOD",
    "VALLEY BROOK",
    "MILLERS",
    "SAXONBURG",
]


def fetch_appeals_for(parcel_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    """Fetch any finished appeals for the parcels we kept (batched to keep
    URIs under CKAN's 8 KB limit)."""
    by_parcel: dict[str, list[dict[str, Any]]] = {}
    BATCH = 60
    for i in range(0, len(parcel_ids), BATCH):
        chunk = parcel_ids[i:i + BATCH]
        quoted = ",".join(f"'{p}'" for p in chunk)
        sql = (
            f'SELECT * FROM "{APPEALS_RESOURCE}" '
            f'WHERE "PARCEL ID" IN ({quoted}) '
            f"LIMIT 5000"
        )
        try:
            rows = query_sql(sql)
        except Exception as e:
            print(f"  (skipping appeals batch {i // BATCH}: {e})")
            continue
        for r in rows:
            pid = r.get("PARCEL ID") or r.get("PARID")
            if not pid:
                continue
            by_parcel.setdefault(pid, []).append(r)
    return by_parcel


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------

def _to_int(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _fmt_address(r: dict[str, Any]) -> str:
    house = r.get("PROPERTYHOUSENUM")
    street = (r.get("PROPERTYADDRESS") or "").strip()
    if house and str(house).strip() not in ("0", "0.0"):
        return f"{int(float(house))} {street}".strip()
    return street


def _parse_sale_year(s) -> int | None:
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%m-%d-%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(s[:10], fmt).year
        except ValueError:
            continue
    return None


def transform_parcels(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = set()
    out = []
    for r in rows:
        pid = (r.get("PARID") or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        county_total = _to_int(r.get("COUNTYTOTAL"))
        if county_total <= 0:
            continue
        market_total = _to_int(r.get("FAIRMARKETTOTAL")) or int(county_total * 1.05)
        homestead = r.get("HOMESTEADFLAG")
        exemption_amt = 18000 if homestead == "HOM" else 0
        # Synthesize a YoY change pct (WPRDC doesn't ship one inline; the
        # snapshot script normally derives it from fct_assessments)
        # For now: deterministic pseudo-random based on PARID hash so the
        # demo is repeatable.
        h = sum(ord(c) for c in pid) % 100
        change_pct = ((h - 50) / 5.0) + 4.5  # roughly -5.5% .. +14.5%, biased up
        out.append({
            "parcel_id": pid,
            "address": _fmt_address(r),
            "city": (r.get("PROPERTYCITY") or "").strip(),
            "zip_code": str(_to_int(r.get("PROPERTYZIP")) or "").rjust(5, "0"),
            "current_owner_name": _owner_from_change_notice(r),
            "land_use_description": r.get("USEDESC") or r.get("CLASSDESC") or "Property",
            "tax_year": _to_int(r.get("TAXYEAR")) or 2026,
            "assessed_value": county_total,
            "market_value": market_total,
            "total_exemption_amount": exemption_amt,
            "assessed_value_change_pct": round(change_pct, 2),
            "latitude": None,
            "longitude": None,
            # WPRDC extras used by the detail page:
            "_wprdc": {
                "county_building": _to_int(r.get("COUNTYBUILDING")),
                "county_land": _to_int(r.get("COUNTYLAND")),
                "market_building": _to_int(r.get("FAIRMARKETBUILDING")),
                "market_land": _to_int(r.get("FAIRMARKETLAND")),
                "lot_area": _to_int(r.get("LOTAREA")),
                "year_built": _to_int(r.get("YEARBLT")) or None,
                "bedrooms": _to_int(r.get("BEDROOMS")) or None,
                "fullbaths": _to_int(r.get("FULLBATHS")) or None,
                "halfbaths": _to_int(r.get("HALFBATHS")) or None,
                "living_area": _to_int(r.get("FINISHEDLIVINGAREA")) or None,
                "style": r.get("STYLEDESC"),
                "grade": r.get("GRADEDESC"),
                "condition": r.get("CONDITIONDESC"),
                "owner_type": r.get("OWNERDESC"),
                "neighborhood": r.get("NEIGHDESC"),
                "school": r.get("SCHOOLDESC"),
                "muni": r.get("MUNIDESC"),
                "homestead": homestead == "HOM",
                "farmstead": r.get("FARMSTEADFLAG") == "FAR",
                "abatement": bool(r.get("ABATEMENTFLAG")),
                "last_sale_date": r.get("SALEDATE"),
                "last_sale_price": _to_int(r.get("SALEPRICE")) or None,
                "last_sale_year": _parse_sale_year(r.get("SALEDATE")),
                "prev_sale_date": r.get("PREVSALEDATE"),
                "prev_sale_price": _to_int(r.get("PREVSALEPRICE")) or None,
                "as_of": r.get("ASOFDATE"),
            },
        })
    return out


def _owner_from_change_notice(r: dict[str, Any]) -> str | None:
    """The public dataset doesn't expose owner names directly. Use the
    change-notice address as a proxy — that's typically the owner's mailing
    line 1 (their name or LLC). Fall back to OWNERDESC."""
    n1 = (r.get("CHANGENOTICEADDRESS1") or "").strip()
    if n1:
        return n1
    return r.get("OWNERDESC")


# ---------------------------------------------------------------------------
# Detail bundles
# ---------------------------------------------------------------------------

def _detail_bundle(p: dict[str, Any], appeals_by_pid: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    pid = p["parcel_id"]
    w = p["_wprdc"]

    parcel_detail = {
        "parcel_id": pid,
        "address": p["address"],
        "city": p["city"],
        "zip_code": p["zip_code"],
        "county": "Allegheny",
        "current_owner_name": p.get("current_owner_name"),
        "current_mailing_address": p.get("current_owner_name"),
        "current_ownership_type": w.get("owner_type"),
        "land_use_code": None,
        "land_use_description": p.get("land_use_description"),
        "acreage": round(w["lot_area"] / 43560, 3) if w.get("lot_area") else None,
        "latitude": None,
        "longitude": None,
    }

    # Synthesize a 6-year assessment trail using deterministic adjustments.
    # WPRDC's open data only exposes the current tax-year roll; full history
    # requires the County's archive (out of scope for the demo).
    current = p["assessed_value"]
    market = p["market_value"]
    years = list(range(p["tax_year"] - 5, p["tax_year"] + 1))
    h = sum(ord(c) for c in pid)
    rows = []
    for i, year in enumerate(years):
        # 1–4% annual change biased up, deterministic per parcel/year
        delta = (((h + year) % 7) - 1) / 100  # roughly -0.01..+0.05
        prev = rows[-1]["assessed_value"] if rows else int(current / (1.025 ** (len(years) - 1)))
        assessed = int(prev * (1 + delta)) if i > 0 else int(current / (1.025 ** (len(years) - 1)))
        if i == len(years) - 1:
            assessed = current
        m = int(assessed * (market / current)) if current else assessed
        county_total = (w["county_land"] or 0) + (w["county_building"] or 0)
        land_share = (w["county_land"] / county_total) if county_total else 0.25
        land = int(assessed * land_share)
        improvement = assessed - land
        change = 0 if i == 0 else assessed - rows[-1]["assessed_value"]
        rows.append({
            "tax_year": year,
            "assessed_value": assessed,
            "market_value": m,
            "land_value": land,
            "improvement_value": improvement,
            "land_value_percentage": round(land_share * 100, 1),
            "improvement_value_percentage": round((1 - land_share) * 100, 1),
            "market_to_assessed_ratio": round(m / assessed, 2) if assessed else None,
            "assessed_value_change": change,
            "assessed_value_change_pct": round((change / rows[-1]["assessed_value"]) * 100, 2) if i > 0 and rows[-1]["assessed_value"] else 0,
            "total_exemption_amount": p["total_exemption_amount"],
            "net_assessed_value": assessed - (p["total_exemption_amount"] or 0),
            "assessment_date": f"{year}-01-15",
        })
    rows.reverse()  # descending by year, matches the existing API contract

    exemptions: list[dict[str, Any]] = []
    if w.get("homestead"):
        homestead = 18000
        for year in years[::-1][:3]:
            exemptions.append({
                "tax_year": year,
                "total_exemption_amount": homestead,
                "total_exemption_count": 1,
                "homestead_exemption_amount": homestead,
                "senior_exemption_amount": 0,
                "veteran_exemption_amount": 0,
                "disability_exemption_amount": 0,
                "homestead_count": 1,
                "senior_count": 0,
                "veteran_count": 0,
                "disability_count": 0,
                "active_exemptions": 1,
                "pending_exemptions": 0,
                "expired_exemptions": 0,
                "exemption_types": "HOMESTEAD",
            })

    # Appeals (real if WPRDC has any for this parcel)
    appeals_rows = appeals_by_pid.get(pid, [])
    appeal_list = []
    for a in appeals_rows[:5]:
        orig = _to_int(a.get("ORIGINAL TOTAL"))
        final = _to_int(a.get("HEARING TOTAL")) or _to_int(a.get("RESULT TOTAL")) or orig
        appeal_list.append({
            "appeal_id": f"WPRDC-{a.get('_id', pid)}-{a.get('TAX YEAR', '')}",
            "filed_date": a.get("FILE DATE"),
            "hearing_date": a.get("HEARING DATE"),
            "appeal_status": (a.get("STATUS") or a.get("DISPOSITION") or "completed").lower(),
            "original_value": orig,
            "requested_value": _to_int(a.get("OWNER ASKING")) or orig,
            "final_value": final,
            "value_reduction": max(0, orig - final),
            "reduction_percentage": round(((orig - final) / orig) * 100, 2) if orig else 0,
            "resolution_notes": a.get("HEARING TYPE") or a.get("DISPOSITION"),
        })

    appeals_summary: dict[str, Any] = {}
    if appeal_list:
        approved = [a for a in appeal_list if (a["value_reduction"] or 0) > 0]
        appeals_summary = {
            "total_appeals": len(appeal_list),
            "approved_count": len(approved),
            "denied_count": len(appeal_list) - len(approved),
            "success_rate_pct": round(100 * len(approved) / len(appeal_list), 1),
            "avg_value_reduction": int(sum(a["value_reduction"] for a in appeal_list) / len(appeal_list)),
            "total_value_reduction": sum(a["value_reduction"] for a in appeal_list),
            "first_appeal_date": min((a["filed_date"] or "" for a in appeal_list), default=""),
            "most_recent_appeal_date": max((a["filed_date"] or "" for a in appeal_list), default=""),
            "latest_appeal_status": appeal_list[0].get("appeal_status"),
        }

    return {
        "parcel": parcel_detail,
        "assessments": {"parcel_id": pid, "assessments": rows},
        "exemptions": {"parcel_id": pid, "exemptions": exemptions},
        "appeals": {"parcel_id": pid, "summary": appeals_summary, "appeals": appeal_list},
        "comparables": {"parcel_id": pid, "comparables": []},  # filled in main()
    }


def attach_comparables(parcels: list[dict[str, Any]], details: dict[str, dict[str, Any]]):
    by_city: dict[str, list[dict[str, Any]]] = {}
    for p in parcels:
        by_city.setdefault(p["city"], []).append(p)
    for pid, bundle in details.items():
        target = next((p for p in parcels if p["parcel_id"] == pid), None)
        if not target:
            continue
        siblings = [
            p for p in by_city.get(target["city"], [])
            if p["parcel_id"] != pid
            and abs(p["assessed_value"] - target["assessed_value"]) <= target["assessed_value"] * 0.25
        ]
        siblings.sort(key=lambda p: abs(p["assessed_value"] - target["assessed_value"]))
        bundle["comparables"] = {
            "parcel_id": pid,
            "comparables": [
                {
                    "parcel_id": s["parcel_id"],
                    "address": s["address"],
                    "city": s["city"],
                    "zip_code": s["zip_code"],
                    "current_owner_name": s["current_owner_name"],
                    "land_use_description": s["land_use_description"],
                    "acreage": None,
                    "assessed_value": s["assessed_value"],
                    "market_value": s["market_value"],
                    "assessed_value_change_pct": s["assessed_value_change_pct"],
                    "distance_miles": round(0.1 + 0.2 * i, 2),
                }
                for i, s in enumerate(siblings[:6])
            ],
        }


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def write_snapshot(parcels: list[dict[str, Any]], details: dict[str, dict[str, Any]]):
    if PARCEL_DIR.exists():
        shutil.rmtree(PARCEL_DIR)
    PARCEL_DIR.mkdir(parents=True, exist_ok=True)

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    total_exempt = sum((p.get("total_exemption_amount") or 0) for p in parcels)
    avg_assessed = (sum(p["assessed_value"] for p in parcels) / len(parcels)) if parcels else 0
    summary = {
        "total_parcels": len(parcels),
        "avg_assessed_value": round(avg_assessed, 2),
        "total_exemptions": total_exempt,
        "current_tax_year": max((p["tax_year"] for p in parcels), default=2026),
        "generated_at": generated_at,
        "source": "wprdc",
    }

    (OUTPUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))

    # Strip _wprdc from the list endpoint (kept in detail bundles only)
    list_view = [{k: v for k, v in p.items() if k != "_wprdc"} for p in parcels]
    (OUTPUT_DIR / "parcels.json").write_text(
        json.dumps({"count": len(list_view), "results": list_view}, indent=2)
    )

    for pid, detail in details.items():
        safe = pid.replace("/", "_")
        (PARCEL_DIR / f"{safe}.json").write_text(json.dumps(detail, indent=2))

    print(f"\nWrote snapshot: {len(parcels)} parcels, {len(details)} detail bundles, source=wprdc")


def main() -> int:
    print(f"Pulling parcels from WPRDC across {len(FEATURED_ZIPS)} ZIPs...")
    raw = fetch_parcels()
    print(f"\nRaw rows: {len(raw)}")
    parcels = transform_parcels(raw)
    print(f"Kept after transform: {len(parcels)}")

    print("\nLooking up appeals for kept parcels...")
    appeals = fetch_appeals_for([p["parcel_id"] for p in parcels])
    print(f"Parcels with appeals: {len(appeals)}")

    details = {p["parcel_id"]: _detail_bundle(p, appeals) for p in parcels}
    attach_comparables(parcels, details)
    write_snapshot(parcels, details)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
