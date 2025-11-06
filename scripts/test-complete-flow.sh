#!/bin/bash
#
# Complete End-to-End Flow Test
# Tests: WebSocket → Pub/Sub → ASR → Transcripts → Intent → KB Articles
#

set -e

echo "🧪 Complete End-to-End Flow Test"
echo "================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check services are running
echo -n "  Ingestion service: "
if curl -s http://localhost:8443/health > /dev/null 2>&1; then
  echo "✅ Running"
else
  echo "❌ Not running"
  echo "   Start with: cd services/ingest && npm run dev"
  exit 1
fi

echo -n "  ASR Worker: "
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "✅ Running"
else
  echo "❌ Not running"
  echo "   Start with: cd services/asr-worker && npm run dev"
  exit 1
fi

echo -n "  Next.js App: "
if curl -s http://localhost:3000/api/config > /dev/null 2>&1; then
  echo "✅ Running"
else
  echo "❌ Not running"
  echo "   Start with: npm run dev"
  exit 1
fi

echo ""
echo "🚀 Running complete flow test..."
echo ""

# Run the TypeScript test
npx tsx scripts/test-complete-flow.ts

