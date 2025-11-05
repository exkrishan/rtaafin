#!/bin/bash
#
# Seed KB Config Script
# Seeds kb_configs table with demo tenant configuration
#
# Usage:
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=eyJxxx... \
#   bash scripts/seed-kb-config.sh
#
# Or source from .env:
#   source .env && bash scripts/seed-kb-config.sh
#

set -e

# Check required environment variables
if [ -z "$SUPABASE_URL" ]; then
  echo "Error: SUPABASE_URL is not set"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: SUPABASE_SERVICE_ROLE_KEY is not set"
  exit 1
fi

echo "🔧 Seeding kb_configs table..."

# Tenant configuration
TENANT_ID="${TENANT_ID:-demo}"
PROVIDER="${PROVIDER:-db}"
CONFIG="${CONFIG:-{}}"

echo "📝 Configuration:"
echo "  Tenant ID: $TENANT_ID"
echo "  Provider: $PROVIDER"
echo "  Config: $CONFIG"

# Construct API URL
API_URL="${SUPABASE_URL}/rest/v1/kb_configs"

# Upsert configuration (insert or update if exists)
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{
    \"tenant_id\": \"$TENANT_ID\",
    \"provider\": \"$PROVIDER\",
    \"config\": $CONFIG
  }")

# Check for errors in response
if echo "$RESPONSE" | grep -q '"code"'; then
  echo "❌ Error seeding config:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

echo "✅ KB config seeded successfully!"
echo ""
echo "Verify with:"
echo "  curl '$API_URL?tenant_id=eq.$TENANT_ID' \\"
echo "    -H 'apikey: \$SUPABASE_SERVICE_ROLE_KEY' \\"
echo "    -H 'Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY'"
echo ""

# Additional examples
echo "💡 To seed a Knowmax config:"
echo "  TENANT_ID=acme PROVIDER=knowmax CONFIG='{\"baseUrl\":\"https://api.knowmax.ai\",\"apiKey\":\"xxx\"}' bash scripts/seed-kb-config.sh"
echo ""
