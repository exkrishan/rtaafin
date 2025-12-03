#!/bin/bash
# Quick script to check if audio dumps are being created

cd "$(dirname "$0")"

echo "🔍 Checking for audio dumps..."
echo ""

DUMP_DIR="./audio-dumps"

if [ ! -d "$DUMP_DIR" ]; then
    echo "❌ Audio dump directory not found: $DUMP_DIR"
    echo "   Make sure AUDIO_DUMP_ENABLED=true is set"
    exit 1
fi

echo "✅ Audio dump directory exists: $DUMP_DIR"
echo ""

# Count total chunks
TOTAL_CHUNKS=$(find "$DUMP_DIR" -name "chunk-*.wav" -o -name "chunk-*.pcm" 2>/dev/null | wc -l | tr -d ' ')

if [ "$TOTAL_CHUNKS" -eq 0 ]; then
    echo "⚠️  No audio chunks found yet"
    echo ""
    echo "Check:"
    echo "  1. Is the Exotel call still active?"
    echo "  2. Are you speaking during the call?"
    echo "  3. Check service logs for '[audio-dumper]' messages"
else
    echo "✅ Found $TOTAL_CHUNKS audio chunk(s)"
    echo ""
    
    # List all call directories
    echo "📁 Call directories:"
    find "$DUMP_DIR" -mindepth 1 -maxdepth 1 -type d | while read dir; do
        CALL_ID=$(basename "$dir")
        CHUNK_COUNT=$(find "$dir" -name "chunk-*.wav" -o -name "chunk-*.pcm" 2>/dev/null | wc -l | tr -d ' ')
        echo "  📂 $CALL_ID ($CHUNK_COUNT chunks)"
    done
    echo ""
    
    # Show latest chunks
    echo "📄 Latest chunks:"
    find "$DUMP_DIR" -name "chunk-*.wav" -o -name "chunk-*.pcm" 2>/dev/null | sort | tail -5 | while read file; do
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo "  📄 $(basename "$file") ($SIZE)"
    done
fi

echo ""
echo "💡 To play a chunk:"
echo "   afplay audio-dumps/{call_id}/chunk-000001.wav"

