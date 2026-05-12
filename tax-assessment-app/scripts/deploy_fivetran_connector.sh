#!/bin/bash
# ============================================================
# Deploy the tax-assessment custom connector to Fivetran.
#
# Prereqs:
#   1. Fivetran API key + secret. Generate at:
#        https://fivetran.com/account/settings → API Config
#      They are NOT in our AWS Secrets Manager (confirmed 2026-05-12).
#   2. The destination group must already exist in Fivetran.
#
# Usage:
#   export FIVETRAN_API_KEY=<plain-key>
#   export FIVETRAN_API_SECRET=<plain-secret>
#   export FIVETRAN_DESTINATION=jason_chletsos_databricks   # (default)
#   export FIVETRAN_CONNECTION=jason_chletsos_wprdc          # (default)
#   ./scripts/deploy_fivetran_connector.sh
# ============================================================

set -euo pipefail

DESTINATION="${FIVETRAN_DESTINATION:-jason_chletsos_databricks}"
CONNECTION="${FIVETRAN_CONNECTION:-jason_chletsos_wprdc}"

if [[ -z "${FIVETRAN_API_KEY:-}" || -z "${FIVETRAN_API_SECRET:-}" ]]; then
    echo "❌ FIVETRAN_API_KEY and FIVETRAN_API_SECRET must be set."
    echo "   Generate at https://fivetran.com/account/settings → API Config"
    exit 1
fi

# CLI expects base64(KEY:SECRET)
BASE64_KEY=$(printf '%s:%s' "$FIVETRAN_API_KEY" "$FIVETRAN_API_SECRET" | base64)

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
CONNECTOR_DIR="$(cd "$SCRIPT_DIR/../fivetran_connector" && pwd)"

echo "📦 Deploying connector"
echo "   project:     $CONNECTOR_DIR"
echo "   destination: $DESTINATION"
echo "   connection:  $CONNECTION"
echo ""

cd "$CONNECTOR_DIR"
fivetran deploy \
    --api-key "$BASE64_KEY" \
    --destination "$DESTINATION" \
    --connection "$CONNECTION" \
    --configuration configuration.json \
    --force

echo ""
echo "✅ Deploy submitted. Trigger a sync in the Fivetran dashboard, or via:"
echo "   curl -u \$FIVETRAN_API_KEY:\$FIVETRAN_API_SECRET \\"
echo "        -X POST https://api.fivetran.com/v1/connectors/<connector-id>/force"
