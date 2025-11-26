#!/bin/bash

# Production Transcript Test Script
# Tests: https://frontend-8jdd.onrender.com/test-simple-transcript

callId="test-$(date +%s)"
baseUrl="https://frontend-8jdd.onrender.com"

echo "🧪 Production Transcript Test"
echo "=============================="
echo ""
echo "📄 Test Page: ${baseUrl}/test-simple-transcript?callId=${callId}"
echo "📋 Call ID: ${callId}"
echo ""
echo "⚠️  IMPORTANT: Open the test page in your browser FIRST!"
echo "   Wait for connection status to turn GREEN"
echo "   Then I'll send transcripts automatically"
echo ""
echo "Waiting 10 seconds for you to open the page..."
sleep 10

echo ""
echo "Sending 8 test transcripts..."
echo ""

for i in {1..8}; do
  seq=$i
  case $i in
    1) text="Hello, this is the first test transcript from production" ;;
    2) text="Testing the SSE connection with ReadableStream fix" ;;
    3) text="This transcript should appear immediately in the UI" ;;
    4) text="The connection timeout is now 15 seconds for Render.com" ;;
    5) text="I need to block my credit card" ;;
    6) text="My credit card was stolen yesterday" ;;
    7) text="There's a fraudulent transaction on my account" ;;
    8) text="Final test message - all 8 should appear!" ;;
  esac
  
  echo "[$i/8] 📤 Sending: $text"
  
  response=$(curl -s -X POST ${baseUrl}/api/calls/ingest-transcript \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: default" \
    -d "{
      \"callId\": \"${callId}\",
      \"seq\": $seq,
      \"ts\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",
      \"text\": \"${text}\"
    }")
  
  if echo "$response" | grep -q '"ok":true'; then
    echo "  ✅ Sent successfully"
    if echo "$response" | grep -q '"intent"'; then
      intent=$(echo "$response" | grep -o '"intent":"[^"]*"' | cut -d'"' -f4)
      echo "  📊 Intent: $intent"
    fi
  else
    echo "  ⚠️  Response: $response"
  fi
  
  echo ""
  sleep 2.5  # Wait 2.5 seconds between transcripts
done

echo "✅ All test transcripts sent!"
echo ""
echo "🔍 Check your browser now:"
echo "1. Connection Status should be GREEN"
echo "2. You should see 8 transcripts in the list"
echo "3. Each transcript should show timestamp (no 'Invalid Date')"
echo "4. After 1-3 seconds, check browser console for intent_update events"
echo ""
echo "📋 Call ID used: ${callId}"
echo "   Make sure this matches the Call ID in the browser!"

