#!/bin/bash

# Simple automated test - no dependencies

FRONTEND_URL="${FRONTEND_URL:-https://frontend-8jdd.onrender.com}"
CALL_ID="simple-test-$(date +%s)"

echo "🧪 Testing Automated Transcript System"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CallID: $CALL_ID"
echo ""

# Send transcript
echo "📤 Sending transcript..."
curl -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: I need help with fraudulent charges on my credit card.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }"

echo ""
echo ""
echo "✅ Done! Now view your transcript:"
echo ""
echo "🔗 Direct link (instant):"
echo "   $FRONTEND_URL/live?callId=$CALL_ID"
echo ""
echo "🔄 Auto-discovery (wait 10s):"
echo "   $FRONTEND_URL/live"
echo ""

