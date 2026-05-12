"""
Snapshot the current state of every layer in the Fivetran → Databricks → dbt
→ Pages pipeline and write it to frontend/public/data/pipeline.json.

The /pipeline page in the SPA reads this file. Re-run whenever you want the
Pipeline Health view to reflect the latest run state.

Env vars (all optional — missing creds just produces "unknown" status for
that layer):
    FIVETRAN_API_KEY, FIVETRAN_API_SECRET
    GITHUB_TOKEN                (for unauthenticated GitHub API access to
                                 fivetran-jasonchletsos/fivetran-sheetz-demo,
                                 the default rate limits suffice — no token
                                 needed for a public repo's pages info)
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "public" / "data" / "pipeline.json"

FIVETRAN_KEY = os.getenv("FIVETRAN_API_KEY")
FIVETRAN_SECRET = os.getenv("FIVETRAN_API_SECRET")
GITHUB_REPO = "fivetran-jasonchletsos/fivetran-sheetz-demo"

# Stable identifiers learned during deploy
CONNECTORS = [
    ("equilibrium_safely", "jason_chletsos_wprdc", "WPRDC custom connector"),
    ("manifesto_surer", "jason_chletsos_alleghenyre", "Allegheny RE custom connector"),
]
DESTINATION_ID = "unduly_parental"
DESTINATION_NAME = "jason_chletsos_databricks"


def fivetran_get(path: str) -> dict[str, Any] | None:
    if not (FIVETRAN_KEY and FIVETRAN_SECRET):
        return None
    auth = base64.b64encode(f"{FIVETRAN_KEY}:{FIVETRAN_SECRET}".encode()).decode()
    req = urllib.request.Request(
        f"https://api.fivetran.com{path}",
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "application/json;version=2",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code} {e.reason}", "_path": path}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e), "_path": path}


def github_get(path: str) -> dict[str, Any] | None:
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={"Accept": "application/vnd.github+json"},
    )
    token = os.getenv("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:  # noqa: BLE001
        return {"error": str(e), "_path": path}


def collect_fivetran():
    out = []
    for cid, schema, name in CONNECTORS:
        payload = fivetran_get(f"/v1/connectors/{cid}") or {}
        data = (payload.get("data") or {}) if "data" in payload else {}
        status = data.get("status") or {}
        out.append({
            "id": cid,
            "schema": schema,
            "name": name,
            "service": data.get("service"),
            "paused": data.get("paused"),
            "sync_state": status.get("sync_state"),
            "update_state": status.get("update_state"),
            "setup_state": status.get("setup_state"),
            "is_historical_sync": status.get("is_historical_sync"),
            "succeeded_at": data.get("succeeded_at"),
            "failed_at": data.get("failed_at"),
            "sync_frequency_minutes": data.get("sync_frequency"),
            "schedule_type": data.get("schedule_type"),
            "data_delay_threshold": data.get("data_delay_threshold"),
            "dashboard_url": f"https://fivetran.com/dashboard/connectors/{cid}",
            "error": payload.get("error"),
        })
    return out


def collect_destination():
    payload = fivetran_get(f"/v1/destinations/{DESTINATION_ID}") or {}
    data = payload.get("data") or {}
    cfg = data.get("config") or {}
    return {
        "id": DESTINATION_ID,
        "name": DESTINATION_NAME,
        "service": data.get("service"),
        "region": data.get("region"),
        "setup_status": data.get("setup_status"),
        "networking_method": data.get("networking_method"),
        "host": cfg.get("server_host_name"),
        "http_path": cfg.get("http_path"),
        "catalog": cfg.get("catalog"),
        "auth_type": cfg.get("auth_type"),
        "error": payload.get("error"),
    }


def collect_transformations():
    payload = fivetran_get("/v1/transformations") or {}
    items = (payload.get("data") or {}).get("items", []) if "data" in payload else []
    # Filter to ones in our group
    group_id = DESTINATION_ID
    relevant = []
    for t in items:
        # transformation list doesn't always include group_id; need the detail call
        t_id = t.get("id")
        if not t_id:
            continue
        detail = fivetran_get(f"/v1/transformations/{t_id}")
        d = (detail or {}).get("data") or {}
        cfg = d.get("transformation_config") or {}
        proj_id = cfg.get("project_id")
        # Resolve project group_id by hitting transformation-projects list
        if proj_id:
            projects = fivetran_get("/v1/transformation-projects") or {}
            for p in (projects.get("data") or {}).get("items", []):
                if p.get("id") == proj_id and p.get("group_id") == group_id:
                    relevant.append({
                        "id": t_id,
                        "name": cfg.get("name"),
                        "project_id": proj_id,
                        "type": d.get("type"),
                        "status": d.get("status"),
                        "paused": d.get("paused"),
                        "last_started_at": d.get("last_started_at"),
                        "last_ended_at": d.get("last_ended_at"),
                        "schedule": d.get("schedule"),
                        "output_model_names": d.get("output_model_names"),
                    })
                    break
    return relevant


def _redact_git_url(url: str | None) -> str | None:
    """Strip any embedded credential (e.g. `https://gho_xxx@github.com/...`)
    before publishing the JSON to a public repo."""
    if not url:
        return url
    import re
    return re.sub(r"https?://[^@/]+@", "https://", url)


def collect_project():
    # Most recent transformation-project for our group, if any
    payload = fivetran_get("/v1/transformation-projects") or {}
    for p in (payload.get("data") or {}).get("items", []):
        if p.get("group_id") == DESTINATION_ID:
            detail = fivetran_get(f"/v1/transformation-projects/{p['id']}") or {}
            d = detail.get("data") or {}
            cfg = d.get("project_config") or {}
            return {
                "id": d.get("id"),
                "type": d.get("type"),
                "status": d.get("status"),
                "created_at": d.get("created_at"),
                "git_remote_url": _redact_git_url(cfg.get("git_remote_url")),
                "folder_path": cfg.get("folder_path"),
                "git_branch": cfg.get("git_branch"),
                "default_schema": cfg.get("default_schema"),
                "dbt_version": cfg.get("dbt_version"),
            }
    return None


def collect_pages():
    pages = github_get(f"/repos/{GITHUB_REPO}/pages") or {}
    # Last successful deploy run
    runs = github_get(f"/repos/{GITHUB_REPO}/actions/workflows/deploy.yml/runs?per_page=5") or {}
    workflow_runs = runs.get("workflow_runs", []) if isinstance(runs, dict) else []
    last_run = next((r for r in workflow_runs if r.get("conclusion") == "success"), None)
    return {
        "html_url": pages.get("html_url"),
        "status": pages.get("status"),
        "build_type": pages.get("build_type"),
        "https_enforced": pages.get("https_enforced"),
        "last_deploy_at": last_run.get("updated_at") if last_run else None,
        "last_deploy_sha": (last_run.get("head_sha") or "")[:7] if last_run else None,
        "last_deploy_message": (last_run.get("head_commit") or {}).get("message", "").splitlines()[0] if last_run else None,
        "runs_url": f"https://github.com/{GITHUB_REPO}/actions/workflows/deploy.yml",
    }


def main() -> int:
    print("Collecting pipeline status...")
    bundle = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "fivetran": {
            "connectors": collect_fivetran() if FIVETRAN_KEY else [],
            "destination": collect_destination() if FIVETRAN_KEY else {"error": "no FIVETRAN_API_KEY"},
            "project": collect_project() if FIVETRAN_KEY else None,
            "transformations": collect_transformations() if FIVETRAN_KEY else [],
        },
        "pages": collect_pages(),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(bundle, indent=2))
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    print(f"  connectors: {len(bundle['fivetran']['connectors'])}")
    print(f"  transformations: {len(bundle['fivetran']['transformations'])}")
    print(f"  pages: {bundle['pages'].get('html_url')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
