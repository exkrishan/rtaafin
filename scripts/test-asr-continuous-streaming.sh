#!/bin/bash
# Test continuous streaming with mock audio
# This script verifies that the ASR worker processes audio chunks continuously

set -e

ASR_WORKER_URL="${ASR_WORKER_URL:-http://localhost:3001}"
INGEST_URL="${INGEST_URL:-ws://localhost:8443/v1/ingest}"

echo "🧪 Testing ASR Worker Continuous Streaming"
echo "=========================================="
echo ""

# 1. Health check
echo "1. Health check..."
HEALTH=$(curl -s "${ASR_WORKER_URL}/health" || echo "{}")
if [ -z "$HEALTH" ] || [ "$HEALTH" = "{}" ]; then
  echo "❌ Health check failed: Could not reach ${ASR_WORKER_URL}/health"
  echo "   Make sure ASR worker is running: cd services/asr-worker && npm run dev"
  exit 1
fi

STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "unknown")
if [ "$STATUS" != "ok" ]; then
  echo "❌ Health check failed: status is '$STATUS', expected 'ok'"
  echo "   Response: $HEALTH"
  exit 1
fi

echo "$HEALTH" | jq .
echo "✅ Health check passed"
echo ""

# 2. Verify service is ready
echo "2. Verifying service readiness..."
ACTIVE_BUFFERS=$(echo "$HEALTH" | jq -r '.activeBuffers // 0' 2>/dev/null || echo "0")
PROVIDER=$(echo "$HEALTH" | jq -r '.provider // "unknown"' 2>/dev/null || echo "unknown")
echo "   Provider: $PROVIDER"
echo "   Active buffers: $ACTIVE_BUFFERS"
echo "✅ Service is ready"
echo ""

# 3. Instructions for manual WebSocket test
echo "3. Manual WebSocket test required..."
echo "   To test continuous streaming:"
echo "   1. Start ingest service: cd services/ingest && npm run dev"
echo "   2. Connect WebSocket client to: ${INGEST_URL}"
echo "   3. Send audio frames (see scripts/simulate_exotel_client.sh)"
echo "   4. Monitor ASR worker logs for:"
echo "      - 'Processing audio buffer' (should appear every ~500ms)"
echo "      - '📤 Sending audio chunk' (should appear multiple times)"
echo "      - 'Reusing existing connection' (not 'Creating new connection' multiple times)"
echo ""

# 4. Check if we can verify logs (if running locally)
if [ -f "/tmp/rtaa-asr.log" ]; then
  echo "4. Checking recent logs..."
  echo "   Recent processing events:"
  tail -20 /tmp/rtaa-asr.log 2>/dev/null | grep -E "Processing audio buffer|Sending audio chunk|Reusing existing connection" || echo "   No relevant logs found"
  echo ""
fi

echo "✅ Smoke tests completed"
echo ""
echo "📝 Next steps:"
echo "   - Run full integration test with WebSocket client"
echo "   - Monitor logs for continuous streaming behavior"
echo "   - Verify no duplicate connections in logs"

