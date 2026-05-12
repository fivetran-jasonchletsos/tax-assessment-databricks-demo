#!/bin/bash
# ============================================================
# Swap the Fivetran transformation project for group
# `unduly_parental` from the pokemon repo to the tax-assessment
# (fivetran-sheetz-demo) repo, and create a transformation that
# runs `dbt deps && dbt run` after the equilibrium_safely
# connector sync completes.
#
# Usage:
#   export FIVETRAN_API_KEY=<plain-key>
#   export FIVETRAN_API_SECRET=<plain-secret>
#   ./scripts/swap_fivetran_transformation.sh
# ============================================================

set -euo pipefail

if [[ -z "${FIVETRAN_API_KEY:-}" || -z "${FIVETRAN_API_SECRET:-}" ]]; then
    echo "❌ FIVETRAN_API_KEY and FIVETRAN_API_SECRET must be set in your shell." >&2
    exit 1
fi

AUTH=(-u "$FIVETRAN_API_KEY:$FIVETRAN_API_SECRET")
API="https://api.fivetran.com"
ACCEPT_V2=(-H "Accept: application/json;version=2")

GROUP_ID="unduly_parental"
OLD_TRANSFORMATION="suffrage_screened"
OLD_PROJECT="hanky_capitalism"
NEW_REPO_URL="https://github.com/fivetran-jasonchletsos/fivetran-sheetz-demo.git"
NEW_FOLDER_PATH="tax-assessment-app/dbt_project/jason_chletsos_tax_assessment"
NEW_BRANCH="main"
NEW_SCHEMA="jason_chletsos_marts"
DBT_VERSION="1.10.3"
CONNECTOR_ID="equilibrium_safely"
TRANSFORMATION_NAME="jason_chletsos_tax_assessment_run"

step() { echo; echo "▶ $1"; }
check() {
    local code resp
    resp="$1"
    code="$(echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("code","?"))' 2>/dev/null || echo "?")"
    if [[ "$code" != "Success" && "$code" != "Created" ]]; then
        echo "  ⚠️  Non-success response: $resp"
    fi
}

step "1/4 Delete existing transformation '$OLD_TRANSFORMATION' (pokemon)"
RESP=$(curl -s "${AUTH[@]}" "${ACCEPT_V2[@]}" -X DELETE "$API/v1/transformations/$OLD_TRANSFORMATION" || true)
echo "  $RESP"

step "2/4 Delete existing project '$OLD_PROJECT' (pokemon)"
RESP=$(curl -s "${AUTH[@]}" -X DELETE "$API/v1/transformation-projects/$OLD_PROJECT" || true)
echo "  $RESP"

step "3/4 Create new tax-assessment dbt project"
PROJECT_PAYLOAD=$(cat <<JSON
{
  "group_id": "$GROUP_ID",
  "type": "DBT_CORE",
  "project_config": {
    "dbt_version": "$DBT_VERSION",
    "default_schema": "$NEW_SCHEMA",
    "git_remote_url": "$NEW_REPO_URL",
    "folder_path": "$NEW_FOLDER_PATH",
    "git_branch": "$NEW_BRANCH",
    "threads": 4
  }
}
JSON
)
RESP=$(curl -s "${AUTH[@]}" -X POST "$API/v1/transformation-projects" \
    -H "Content-Type: application/json" -d "$PROJECT_PAYLOAD")
echo "  $RESP"
NEW_PROJECT_ID=$(echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("data",{}).get("id",""))')
if [[ -z "$NEW_PROJECT_ID" ]]; then
    echo "❌ Failed to create project. See response above." >&2
    exit 1
fi
echo "  ✓ New project id: $NEW_PROJECT_ID"

step "4/4 Create transformation triggered by '$CONNECTOR_ID' sync"
# Wait a beat — Fivetran may need a moment to clone the repo before the
# transformation can reference it.
sleep 4

TRANSFORMATION_PAYLOAD=$(cat <<JSON
{
  "type": "DBT_CORE",
  "transformation_config": {
    "project_id": "$NEW_PROJECT_ID",
    "name": "$TRANSFORMATION_NAME",
    "steps": [
      {"name": "Install packages", "command": "dbt deps"},
      {"name": "Run models",      "command": "dbt run"},
      {"name": "Run tests",       "command": "dbt test"}
    ]
  },
  "schedule": {
    "schedule_type": "INTEGRATED",
    "connection_ids": ["$CONNECTOR_ID"]
  },
  "paused": false
}
JSON
)
RESP=$(curl -s "${AUTH[@]}" "${ACCEPT_V2[@]}" -X POST "$API/v1/transformations" \
    -H "Content-Type: application/json" -d "$TRANSFORMATION_PAYLOAD")
echo "  $RESP"
NEW_TRANSFORMATION_ID=$(echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("data",{}).get("id",""))')

echo
if [[ -n "$NEW_TRANSFORMATION_ID" ]]; then
    echo "✅ Swap complete."
    echo "   project:        $NEW_PROJECT_ID"
    echo "   transformation: $NEW_TRANSFORMATION_ID"
    echo "   trigger:        $CONNECTOR_ID sync completed"
    echo
    echo "Re-run the Pipeline Status snapshot to see the green checkmark:"
    echo "  python3 scripts/build_pipeline_status.py"
else
    echo "⚠️  Transformation creation may have failed. Check response."
fi
