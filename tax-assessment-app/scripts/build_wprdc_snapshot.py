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

# Featured ZIPs get the heaviest sampling AND get per-parcel detail bundles
# written so clicking any of them works without a network call.
FEATURED_ZIPS = [
    15116,  # Glenshaw — presenter's ZIP
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

# All Allegheny County ZIPs with residential parcels (loaded from
# zip_centroids.json so the snapshot can geo-place every row).
_centroids_path = Path(__file__).parent / "zip_centroids.json"
_zip_centroids_data: dict[str, list[float]] = (
    json.loads(_centroids_path.read_text()) if _centroids_path.exists() else {}
)
ALL_ALLEGHENY_ZIPS = sorted(int(z) for z in _zip_centroids_data.keys())

PER_ZIP_LIMIT = {15116: 5000}  # presenter's ZIP gets a generous sample
DEFAULT_PER_ZIP = 5000  # effectively "all residential" per ZIP (largest ZIPs cap here)


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
    # Residential parcels only — commercial/industrial mega-parcels (steel
    # mills, downtown high-rises, hospitals) at >$50M distort medians and
    # histograms. Community-facing portal serves homeowners.
    zips_to_pull = ALL_ALLEGHENY_ZIPS or FEATURED_ZIPS
    print(f"Pulling residential parcels from {len(zips_to_pull)} ZIPs...")
    for zip_code in zips_to_pull:
        limit = PER_ZIP_LIMIT.get(zip_code, DEFAULT_PER_ZIP)
        sql = (
            f"SELECT {PARCEL_COLS} FROM \"{ASSESSMENTS_RESOURCE}\" "
            f"WHERE \"PROPERTYZIP\" = {zip_code} "
            f"  AND \"CLASS\" = 'R' "
            f"  AND \"COUNTYTOTAL\" BETWEEN 30000 AND 2000000 "
            f"  AND \"PROPERTYADDRESS\" IS NOT NULL "
            f"ORDER BY \"PARID\" "
            f"LIMIT {limit}"
        )
        try:
            rows = query_sql(sql)
        except Exception as e:
            print(f"  {zip_code}: ERROR {e}")
            continue
        if rows:
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


# ZIP-centroid coordinates. Loaded from zip_centroids.json (built by
# scripts/fetch_zip_centroids.py via zippopotam.us). All 109 Allegheny
# County residential ZIPs are covered; we apply a deterministic jitter
# so multiple parcels in the same ZIP don't render on top of each other.
ZIP_CENTROIDS: dict[int, tuple[float, float]] = {
    int(z): (coords[0], coords[1]) for z, coords in _zip_centroids_data.items()
}


def _coords_for(zip_code: int, parcel_id: str) -> tuple[float | None, float | None]:
    """Approximate parcel location: ZIP centroid + a small hash-based jitter
    so neighbors don't overlap on the map."""
    center = ZIP_CENTROIDS.get(zip_code)
    if not center:
        return (None, None)
    lat0, lng0 = center
    # Deterministic jitter ~ ±0.012° (~1.3 km lat / ~1.0 km lng) using two
    # different hashes of the parcel ID so lat and lng are independent.
    h1 = sum(ord(c) for c in parcel_id)
    h2 = sum(ord(c) * (i + 1) for i, c in enumerate(parcel_id))
    lat = lat0 + (((h1 % 200) - 100) / 100) * 0.012
    lng = lng0 + (((h2 % 200) - 100) / 100) * 0.012
    return (round(lat, 6), round(lng, 6))


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
    """Pull every WPRDC finished appeal in two big batches and filter to the
    requested parcel IDs client-side. Much faster than 700+ small SQL
    queries at 100K-scale."""
    if not parcel_ids:
        return {}
    wanted = set(parcel_ids)
    by_parcel: dict[str, list[dict[str, Any]]] = {}
    # WPRDC currently has ~100K appeals. Pull in two passes via OFFSET to
    # stay under the CKAN per-query result cap.
    PAGE = 50000
    for offset in (0, PAGE):
        sql = f'SELECT * FROM "{APPEALS_RESOURCE}" LIMIT {PAGE} OFFSET {offset}'
        try:
            rows = query_sql(sql)
        except Exception as e:
            print(f"  appeals page offset={offset}: {e}")
            continue
        kept = 0
        for r in rows:
            pid = r.get("PARCEL ID") or r.get("PARID")
            if pid and pid in wanted:
                by_parcel.setdefault(pid, []).append(r)
                kept += 1
        print(f"  appeals page offset={offset}: scanned {len(rows)} rows, matched {kept}")
        if len(rows) < PAGE:
            break
    return by_parcel


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------

def _to_int(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _muni_label(r: dict[str, Any]) -> str:
    """Compact municipality label. WPRDC's MUNIDESC looks like
    '1st Ward  - PITTSBURGH' for Pittsburgh wards and 'Shaler Twp' for
    suburban townships. Normalize so Pittsburgh wards roll up to
    'Pittsburgh - <neighborhood-or-ward>', suburbs keep their own name."""
    muni = (r.get("MUNIDESC") or "").strip()
    if not muni:
        return (r.get("PROPERTYCITY") or "Unknown").title()
    if "PITTSBURGH" in muni.upper():
        # Use neighborhood when available; fall back to ward
        neigh = (r.get("NEIGHDESC") or "").strip()
        if neigh and neigh.upper() not in ("PITTSBURGH URBAN", "NONE"):
            return _titlecase(neigh)
        return _titlecase(muni.replace("- PITTSBURGH", "").strip()) + " (Pittsburgh)"
    return _titlecase(muni)


def _titlecase(s: str) -> str:
    return " ".join(w.capitalize() if not w.isdigit() else w for w in s.lower().split())


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
        zip_int = _to_int(r.get("PROPERTYZIP"))
        lat, lng = _coords_for(zip_int, pid)
        out.append({
            "parcel_id": pid,
            "address": _fmt_address(r),
            # Use municipality (MUNIDESC) for grouping — PROPERTYCITY just
            # echoes the post-office city, so 80% of metro parcels become
            # "PITTSBURGH". MUNIDESC distinguishes Squirrel Hill, Shaler,
            # Aspinwall, Mt Lebanon, etc.
            "city": _muni_label(r),
            "post_office_city": (r.get("PROPERTYCITY") or "").strip(),
            "zip_code": str(zip_int or "").rjust(5, "0"),
            "current_owner_name": _owner_from_change_notice(r),
            "land_use_description": r.get("USEDESC") or r.get("CLASSDESC") or "Property",
            "tax_year": _to_int(r.get("TAXYEAR")) or 2026,
            "assessed_value": county_total,
            "market_value": market_total,
            "total_exemption_amount": exemption_amt,
            "assessed_value_change_pct": round(change_pct, 2),
            "latitude": lat,
            "longitude": lng,
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
        "latitude": p.get("latitude"),
        "longitude": p.get("longitude"),
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
        orig = _to_int(a.get("PRE APPEAL TOTAL"))
        final = _to_int(a.get("POST APPEAL TOTAL")) or orig
        status_raw = (a.get("STATUS") or a.get("HEARING_STATUS") or "completed").lower()
        # Normalize WPRDC's status to the enum the frontend understands.
        if "approv" in status_raw or final < orig:
            status = "approved"
        elif "den" in status_raw:
            status = "denied"
        elif "withdr" in status_raw:
            status = "withdrawn"
        elif "schedul" in status_raw:
            status = "scheduled"
        else:
            status = "filed"
        appeal_list.append({
            "appeal_id": f"WPRDC-{a.get('_id', pid)}-{a.get('TAX YEAR', '')}",
            "filed_date": a.get("HEARING DATE") or a.get("AS OF DATE"),
            "hearing_date": a.get("HEARING DATE"),
            "appeal_status": status,
            "original_value": orig,
            "requested_value": orig,
            "final_value": final,
            "value_reduction": max(0, orig - final),
            "reduction_percentage": round(((orig - final) / orig) * 100, 2) if orig else 0,
            "resolution_notes": a.get("HEARING_TYPE") or a.get("LAST UPDATE REASON"),
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

    # Column-oriented compact format — ~65% smaller than the indented
    # object-per-row format at 300K-parcel scale (40MB vs 130MB).
    # Frontend in src/api/queries.ts materializes rows back into objects.
    LIST_COLS = [
        "parcel_id", "address", "city", "zip_code", "current_owner_name",
        "land_use_description", "tax_year", "assessed_value", "market_value",
        "total_exemption_amount", "assessed_value_change_pct",
        "latitude", "longitude",
    ]
    rows = [[p.get(c) for c in LIST_COLS] for p in parcels]
    (OUTPUT_DIR / "parcels.json").write_text(
        json.dumps({"count": len(rows), "columns": LIST_COLS, "rows": rows}, separators=(",", ":"))
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

    # Appeals lookup is the expensive step — 60-parcel batches against
    # CKAN add up fast at 100K scale. Only fetch appeals for parcels in
    # FEATURED_ZIPS (the ones a demo presenter is most likely to click).
    # Non-featured parcels still show up in search/dashboard/map; they
    # just lack appeal history.
    featured_set = set(FEATURED_ZIPS)
    featured_parcel_ids = [
        p["parcel_id"] for p in parcels if int(p["zip_code"] or 0) in featured_set
    ]
    print(f"\nLooking up appeals for {len(featured_parcel_ids)} parcels in featured ZIPs...")
    appeals = fetch_appeals_for(featured_parcel_ids)
    print(f"Parcels with appeals: {len(appeals)}")

    # Write detail bundles only for parcels in FEATURED_ZIPS (otherwise
    # the repo balloons to 100K+ tiny JSON files). Non-featured parcels
    # still appear in search, dashboard, map, and agent results — the
    # frontend synthesizes a minimal detail bundle from parcels.json
    # when a non-featured parcel is opened.
    featured_parcels = [p for p in parcels if int(p["zip_code"] or 0) in featured_set]
    print(f"\nWriting detail bundles for {len(featured_parcels)} featured-ZIP parcels...")
    details = {p["parcel_id"]: _detail_bundle(p, appeals) for p in featured_parcels}
    attach_comparables(featured_parcels, details)
    write_snapshot(parcels, details)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
