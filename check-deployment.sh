#!/bin/bash

# Quick script to check if the latest code is deployed

echo "🔍 Checking Deployment Status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test if the dispose endpoint exists (only in latest commits)
echo "1️⃣  Testing if dispose endpoint is deployed..."
RESPONSE=$(curl -s -X POST "https://frontend-8jdd.onrender.com/api/calls/test-123/dispose" \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$RESPONSE" | grep -q '"ok":true\|"ok":false'; then
  echo "   ✅ Dispose endpoint exists!"
  echo "   Response: $RESPONSE"
  echo "   Status: Latest code is DEPLOYED! ✅"
else
  echo "   ⚠️  Dispose endpoint not found or error"
  echo "   Response: $RESPONSE"
  echo "   Status: Old code might still be deployed"
fi

echo ""
echo "2️⃣  Testing in-memory transcripts..."

TEST_ID="deploy-check-$(date +%s)"

# Send a test transcript
curl -s -X POST "https://frontend-8jdd.onrender.com/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$TEST_ID\",
    \"transcript\": \"Deployment check test\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null

# Check if it's instantly available
START_TIME=$(date +%s%3N)
LATEST_RESPONSE=$(curl -s "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=$TEST_ID")
END_TIME=$(date +%s%3N)
LATENCY=$((END_TIME - START_TIME))

if echo "$LATEST_RESPONSE" | grep -q '"count":1'; then
  echo "   ✅ In-memory transcripts working!"
  echo "   Latency: ${LATENCY}ms"
  if [ "$LATENCY" -lt 100 ]; then
    echo "   ⚡ Super fast! Latest code is deployed! ✅"
  else
    echo "   🐌 Slower than expected (might be old DB-based code)"
  fi
else
  echo "   ⚠️  Transcript not found or error"
  echo "   Response: $LATEST_RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Latest Git Commits:"
git log --oneline -5

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Render Dashboard:"
echo "   https://dashboard.render.com"
echo ""
echo "💡 If old code is deployed, wait 5-10 minutes for auto-deploy"
echo "   or manually trigger deploy in Render dashboard"
echo ""

