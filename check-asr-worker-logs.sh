#!/bin/bash
# Quick script to check ASR worker logs for the current interaction

echo "=========================================="
echo "🔍 ASR Worker Log Analysis"
echo "=========================================="
echo ""

# Check for connection creation
echo "📡 Connection Creation:"
echo "Looking for 'Creating new connection' with sampleRate: 8000..."
echo ""

# Check for session started
echo "✅ Session Started:"
echo "Looking for 'Session started' with sample_rate: 8000..."
echo ""

# Check for audio sending
echo "📤 Audio Sending:"
echo "Looking for 'Sent audio chunk' with sampleRateMatch: true..."
echo ""

# Check for transcript events
echo "📨 Transcript Events:"
echo "Looking for 'Received PARTIAL_TRANSCRIPT' or 'Received COMMITTED_TRANSCRIPT'..."
echo ""

# Check for empty transcripts
echo "⚠️  Empty Transcripts:"
echo "Looking for 'WARNING: Published transcript with EMPTY text'..."
echo ""

# Check for sample rate mismatches
echo "🔧 Sample Rate Issues:"
echo "Looking for 'Sample rate mismatch' warnings..."
echo ""

echo "=========================================="
echo "💡 To view full logs, run:"
echo "   render logs <asr-worker-service-id> --tail"
echo "=========================================="

