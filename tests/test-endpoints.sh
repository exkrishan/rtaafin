#!/bin/bash
# Quick endpoint test script
# Usage: ./tests/test-endpoints.sh

BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"

echo "🧪 Testing Agent Assist API Endpoints"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: KB Search
echo "1️⃣  Testing KB Search API..."
SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/kb/search?q=test&tenantId=default")
SEARCH_BODY=$(echo "$SEARCH_RESPONSE" | head -n -1)
SEARCH_CODE=$(echo "$SEARCH_RESPONSE" | tail -n 1)

if [ "$SEARCH_CODE" = "200" ]; then
  echo "   ✅ KB Search: SUCCESS (HTTP $SEARCH_CODE)"
  echo "$SEARCH_BODY" | jq '.' 2>/dev/null || echo "$SEARCH_BODY"
else
  echo "   ❌ KB Search: FAILED (HTTP $SEARCH_CODE)"
  echo "$SEARCH_BODY"
fi
echo ""

# Test 2: Auto Notes
echo "2️⃣  Testing Auto Notes API..."
NOTES_PAYLOAD='{
  "callId": "test-call-123",
  "tenantId": "default",
  "author": "agent-ui",
  "notes": "Test notes from endpoint test",
  "dispositions": [{"code": "GENERAL_INQUIRY", "title": "General Inquiry", "score": 0.45}],
  "confidence": 0.45,
  "raw_llm_output": null
}'

NOTES_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/calls/auto_notes" \
  -H "Content-Type: application/json" \
  -d "$NOTES_PAYLOAD")
NOTES_BODY=$(echo "$NOTES_RESPONSE" | head -n -1)
NOTES_CODE=$(echo "$NOTES_RESPONSE" | tail -n 1)

if [ "$NOTES_CODE" = "200" ]; then
  echo "   ✅ Auto Notes: SUCCESS (HTTP $NOTES_CODE)"
  echo "$NOTES_BODY" | jq '.' 2>/dev/null || echo "$NOTES_BODY"
else
  echo "   ❌ Auto Notes: FAILED (HTTP $NOTES_CODE)"
  echo "$NOTES_BODY"
fi
echo ""

# Test 3: KB Feedback
echo "3️⃣  Testing KB Feedback API..."
FEEDBACK_PAYLOAD='{
  "callId": "test-call-123",
  "tenantId": "default",
  "articleId": "test-article-1",
  "articleTitle": "Test Article",
  "action": "like"
}'

FEEDBACK_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/kb/feedback" \
  -H "Content-Type: application/json" \
  -d "$FEEDBACK_PAYLOAD")
FEEDBACK_BODY=$(echo "$FEEDBACK_RESPONSE" | head -n -1)
FEEDBACK_CODE=$(echo "$FEEDBACK_RESPONSE" | tail -n 1)

if [ "$FEEDBACK_CODE" = "200" ]; then
  echo "   ✅ KB Feedback: SUCCESS (HTTP $FEEDBACK_CODE)"
  echo "$FEEDBACK_BODY" | jq '.' 2>/dev/null || echo "$FEEDBACK_BODY"
else
  echo "   ❌ KB Feedback: FAILED (HTTP $FEEDBACK_CODE)"
  echo "$FEEDBACK_BODY"
fi
echo ""

echo "✅ Endpoint testing complete!"

