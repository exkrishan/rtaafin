#!/bin/bash
#
# Quick test script for ingestion service
# Usage: ./QUICK_TEST_INGESTION.sh

set -e

echo "🧪 Testing Ingestion Service"
echo ""

# Generate JWT token
echo "1️⃣  Generating JWT token..."
JWT_TOKEN=$(node scripts/generate-test-jwt.js 2>/dev/null | grep -v "^✅\|^📋\|^💡\|^$" | head -1 | xargs)

if [ -z "$JWT_TOKEN" ] || [ ${#JWT_TOKEN} -lt 50 ]; then
  echo "❌ Failed to generate JWT token"
  exit 1
fi

echo "   ✅ JWT token generated"
echo ""

# Check if ingestion service is running
echo "2️⃣  Checking ingestion service..."
if curl -s http://localhost:8443/health > /dev/null 2>&1; then
  echo "   ✅ Ingestion service is running"
else
  echo "   ❌ Ingestion service is not running"
  echo "   Start it with: cd services/ingest && npm run dev"
  exit 1
fi
echo ""

# Run the simulation
echo "3️⃣  Running simulation..."
echo "   WebSocket URL: ws://localhost:8443/v1/ingest"
echo ""

JWT_TOKEN="$JWT_TOKEN" \
WS_URL="ws://localhost:8443/v1/ingest" \
./services/ingest/scripts/simulate_exotel_client.sh

echo ""
echo "✅ Test complete!"

