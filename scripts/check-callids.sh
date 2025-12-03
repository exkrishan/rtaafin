#!/bin/bash

# Quick script to check what callIds exist in the database
# This helps diagnose why transcripts aren't showing in UI

echo "🔍 Checking database for transcripts..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Check if test-deployment-001 exists
echo "1️⃣  Checking for callId='test-deployment-001' (from your curl command):"
curl -s "https://frontend-8jdd.onrender.com/api/transcripts/latest?callId=test-deployment-001" | jq -r '
  if .ok then
    if (.count // 0) > 0 then
      "✅ Found \(.count) transcript(s) for test-deployment-001:\n" + 
      (.transcripts | map("   - seq=\(.seq), text=\"\(.text)\"") | join("\n"))
    else
      "⚠️  No transcripts found for test-deployment-001"
    end
  else
    "❌ Error: \(.error // "Unknown error")"
  end
'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 TO FIX THE ISSUE:"
echo ""
echo "1️⃣  Open browser DevTools (F12) on the live page"
echo "2️⃣  Look in Console for logs like:"
echo "   [API-CALL] 🌐 Making polling request"
echo ""
echo "3️⃣  Note the 'callId' value from that log"
echo ""
echo "4️⃣  Use that EXACT callId in your curl command:"
echo ""
echo "   curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{"
echo "       \"callId\": \"<USE_CALLID_FROM_BROWSER_CONSOLE>\","
echo "       \"transcript\": \"Testing - this will now show up!\","
echo "       \"session_id\": null,"
echo "       \"asr_service\": \"Azure\","
echo "       \"timestamp\": \"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'\","
echo "       \"isFinal\": true"
echo "     }'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

