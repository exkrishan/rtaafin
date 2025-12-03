#!/bin/bash
# Quick script to check database for recent calls and transcripts

echo "=== Checking Database for Calls and Transcripts ==="
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
  echo "❌ Error: .env.local not found"
  echo "Please create .env.local with your Supabase credentials"
  exit 1
fi

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Check if credentials are set
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  echo "❌ Error: Missing Supabase credentials"
  echo "Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  exit 1
fi

echo "✅ Supabase URL: $NEXT_PUBLIC_SUPABASE_URL"
echo ""

# Query recent calls using curl
echo "📞 Fetching recent calls from ingest_events table..."
echo ""

RECENT_CALLS=$(curl -s \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ingest_events?select=call_id,created_at&order=created_at.desc&limit=5" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}")

echo "Recent calls:"
echo "$RECENT_CALLS" | jq -r '.[] | "  CallId: \(.call_id) | Created: \(.created_at)"' 2>/dev/null || echo "$RECENT_CALLS"

# Get the latest callId
LATEST_CALL_ID=$(echo "$RECENT_CALLS" | jq -r '.[0].call_id' 2>/dev/null)

if [ "$LATEST_CALL_ID" != "null" ] && [ ! -z "$LATEST_CALL_ID" ]; then
  echo ""
  echo "📝 Fetching transcripts for latest call: $LATEST_CALL_ID"
  echo ""
  
  TRANSCRIPTS=$(curl -s \
    "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/ingest_events?call_id=eq.${LATEST_CALL_ID}&select=seq,text,speaker,ts&order=seq.asc&limit=10" \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}")
  
  TRANSCRIPT_COUNT=$(echo "$TRANSCRIPTS" | jq '. | length' 2>/dev/null || echo "0")
  
  echo "Number of transcripts: $TRANSCRIPT_COUNT"
  echo ""
  
  if [ "$TRANSCRIPT_COUNT" -gt "0" ]; then
    echo "First 3 transcripts:"
    echo "$TRANSCRIPTS" | jq -r '.[:3] | .[] | "  [\(.seq)] \(.speaker): \(.text)"' 2>/dev/null || echo "$TRANSCRIPTS"
    echo ""
    echo "✅ Transcripts found! The issue is likely in the frontend."
    echo ""
    echo "To test the UI, navigate to:"
    echo "  http://localhost:3000/live?callId=$LATEST_CALL_ID"
  else
    echo "⚠️  No transcripts found for this call"
    echo "   - Check if ASR worker is running"
    echo "   - Check if transcripts are being sent to /api/transcripts/receive"
  fi
else
  echo ""
  echo "⚠️  No calls found in the database"
  echo "   - Make sure a call has been started"
  echo "   - Check if the ingest service is running"
fi

echo ""
echo "=== End of Database Check ==="

