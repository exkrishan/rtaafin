#!/bin/bash
# Test script to verify demo flow

echo "🧪 Testing Demo Flow..."
echo ""

# Test 1: Check if SSE endpoint is accessible
echo "1. Testing SSE endpoint..."
curl -s -N "http://localhost:3000/api/events/stream?callId=test-123" --max-time 2 > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✅ SSE endpoint accessible"
else
  echo "   ❌ SSE endpoint not accessible"
fi

# Test 2: Check if ingest endpoint works
echo "2. Testing ingest endpoint..."
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/calls/ingest-transcript" \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: default" \
  -d '{"callId":"test-123","seq":1,"ts":"2024-01-01T00:00:00Z","text":"Test transcript"}')
if echo "$RESPONSE" | grep -q "ok"; then
  echo "   ✅ Ingest endpoint working"
else
  echo "   ❌ Ingest endpoint failed"
  echo "   Response: $RESPONSE"
fi

echo ""
echo "📝 Next steps:"
echo "   1. Ensure dev server is running: npm run dev"
echo "   2. Open http://localhost:3000/demo"
echo "   3. Check browser console for errors"
echo "   4. Check server terminal for broadcast logs"

