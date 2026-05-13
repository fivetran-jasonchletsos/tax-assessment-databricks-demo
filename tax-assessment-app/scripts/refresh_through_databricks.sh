#!/bin/bash
# ============================================================
# End-to-end data pipeline runner.
#
# Flow:
#   1. Pull WPRDC raw data → frontend/public/data/parcels.json (local cache)
#   2. Load that data into Databricks marts (jason_chletsos.jason_chletsos_marts)
#   3. Re-build the JSON snapshot FROM Databricks (gold layer)
#   4. The website now reads JSON that was produced by Databricks queries
#
# This is what the demo claims happens — and now it actually does.
#
# Required env:
#   DATABRICKS_HOST          dbc-c48d38b1-67f3.cloud.databricks.com
#   DATABRICKS_HTTP_PATH     /sql/1.0/warehouses/3e84683f91b0ee83
#   DATABRICKS_TOKEN         <your PAT>
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR/.."

if [[ -z "${DATABRICKS_TOKEN:-}" ]]; then
    echo "❌ Set DATABRICKS_HOST, DATABRICKS_HTTP_PATH, DATABRICKS_TOKEN in your shell."
    exit 1
fi

echo "────────────────────────────────────────────────────────"
echo "Step 1/3 — Pull WPRDC raw data to local cache"
echo "────────────────────────────────────────────────────────"
python3 scripts/build_wprdc_snapshot.py

echo
echo "────────────────────────────────────────────────────────"
echo "Step 2/3 — Load into Databricks gold layer"
echo "────────────────────────────────────────────────────────"
python3 scripts/load_to_databricks.py

echo
echo "────────────────────────────────────────────────────────"
echo "Step 3/3 — Re-export JSON snapshot FROM Databricks marts"
echo "────────────────────────────────────────────────────────"
python3 scripts/build_snapshot.py

echo
echo "✅ End-to-end refresh complete."
echo "   frontend/public/data/parcels.json now sourced from"
echo "   ${DATABRICKS_HOST}/${DATABRICKS_CATALOG:-jason_chletsos}.${DATABRICKS_MARTS_SCHEMA:-jason_chletsos_marts}"
echo
echo "Commit + push to trigger the Pages deploy."
