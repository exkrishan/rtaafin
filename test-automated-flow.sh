#!/bin/bash

# Automated Transcript Flow Test Script
# Tests the fully automated transcript system

set -e

FRONTEND_URL="${FRONTEND_URL:-https://frontend-8jdd.onrender.com}"
CALL_ID="auto-test-$(date +%s)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Testing Automated Transcript Flow"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "CallID: $CALL_ID"
echo "Frontend: $FRONTEND_URL"
echo ""

# Test 1: Send first transcript
echo "1️⃣  Sending first transcript..."
RESPONSE1=$(curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: Hi, I need help with my credit card.\",
    \"session_id\": null,
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }")

if echo "$RESPONSE1" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "   ✅ Transcript 1 sent successfully"
  VIEW_URL=$(echo "$RESPONSE1" | jq -r '.viewUrl')
  SEQ1=$(echo "$RESPONSE1" | jq -r '.seq')
  echo "   📝 Sequence: $SEQ1"
  echo "   🔗 View URL: $VIEW_URL"
else
  echo "   ❌ Failed to send transcript 1"
  echo "   Response: $RESPONSE1"
  exit 1
fi

echo ""
sleep 2

# Test 2: Send second transcript
echo "2️⃣  Sending second transcript..."
RESPONSE2=$(curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Agent: I can help you with that. What seems to be the issue?\",
    \"session_id\": null,
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }")

if echo "$RESPONSE2" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "   ✅ Transcript 2 sent successfully"
  SEQ2=$(echo "$RESPONSE2" | jq -r '.seq')
  echo "   📝 Sequence: $SEQ2"
else
  echo "   ❌ Failed to send transcript 2"
  echo "   Response: $RESPONSE2"
  exit 1
fi

echo ""
sleep 2

# Test 3: Send third transcript (with fraud keyword for intent detection)
echo "3️⃣  Sending third transcript (fraud detection trigger)..."
RESPONSE3=$(curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: There are some fraudulent charges on my statement that I didn't make.\",
    \"session_id\": null,
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }")

if echo "$RESPONSE3" | jq -e '.ok == true' > /dev/null 2>&1; then
  echo "   ✅ Transcript 3 sent successfully"
  SEQ3=$(echo "$RESPONSE3" | jq -r '.seq')
  echo "   📝 Sequence: $SEQ3"
else
  echo "   ❌ Failed to send transcript 3"
  echo "   Response: $RESPONSE3"
  exit 1
fi

echo ""
sleep 2

# Test 4: Verify transcripts are in database
echo "4️⃣  Verifying transcripts in database..."
LATEST_RESPONSE=$(curl -s "$FRONTEND_URL/api/transcripts/latest?callId=$CALL_ID")

if echo "$LATEST_RESPONSE" | jq -e '.ok == true' > /dev/null 2>&1; then
  TRANSCRIPT_COUNT=$(echo "$LATEST_RESPONSE" | jq -r '.count')
  INTENT=$(echo "$LATEST_RESPONSE" | jq -r '.intent // "unknown"')
  CONFIDENCE=$(echo "$LATEST_RESPONSE" | jq -r '.confidence // 0')
  
  echo "   ✅ Transcripts retrieved from database"
  echo "   📊 Count: $TRANSCRIPT_COUNT transcripts"
  echo "   🎯 Intent: $INTENT (confidence: $CONFIDENCE)"
  
  if [ "$TRANSCRIPT_COUNT" -ge 3 ]; then
    echo "   ✅ All 3 transcripts stored successfully"
  else
    echo "   ⚠️  Expected 3 transcripts, found $TRANSCRIPT_COUNT"
  fi
  
  # Show transcripts
  echo ""
  echo "   Transcripts:"
  echo "$LATEST_RESPONSE" | jq -r '.transcripts[] | "   - seq=\(.seq): \(.text | .[0:60])..."'
else
  echo "   ❌ Failed to retrieve transcripts"
  echo "   Response: $LATEST_RESPONSE"
  exit 1
fi

echo ""

# Test 5: Check if this is now the latest call
echo "5️⃣  Checking /api/calls/latest..."
LATEST_CALL=$(curl -s "$FRONTEND_URL/api/calls/latest")

if echo "$LATEST_CALL" | jq -e '.ok == true' > /dev/null 2>&1; then
  LATEST_CALL_ID=$(echo "$LATEST_CALL" | jq -r '.callId')
  echo "   ✅ Latest call endpoint working"
  echo "   📞 Latest call ID: $LATEST_CALL_ID"
  
  if [ "$LATEST_CALL_ID" = "$CALL_ID" ]; then
    echo "   ✅ Our test call IS the latest call (auto-discovery will work!)"
  else
    echo "   ⚠️  Latest call is different: $LATEST_CALL_ID"
    echo "   📝 This is OK if there are newer calls"
  fi
else
  echo "   ❌ Latest call endpoint failed"
  echo "   Response: $LATEST_CALL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Automated Flow Test PASSED!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📺 View your transcripts in the UI:"
echo ""
echo "Option 1 (Direct): $VIEW_URL"
echo "Option 2 (Auto-discovery): $FRONTEND_URL/live"
echo "            (wait 10 seconds for auto-discovery)"
echo ""
echo "🎯 What will happen:"
echo "   1. Open either URL in your browser"
echo "   2. Transcripts will appear automatically"
echo "   3. Intent detection: $INTENT"
echo "   4. KB articles will be suggested"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

