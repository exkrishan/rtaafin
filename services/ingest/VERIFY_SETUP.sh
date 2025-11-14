#!/bin/bash
# Verify audio dump setup and service status

cd "$(dirname "$0")"

echo "🔍 Verifying Audio Dump Setup..."
echo ""

# Check if service is running
if pgrep -f "ts-node src/server.ts" > /dev/null; then
    echo "✅ Service is running"
else
    echo "❌ Service is NOT running"
    echo "   Start it with: ./START_WITH_AUDIO_DUMP.sh"
    exit 1
fi

echo ""

# Check environment variables (from process)
echo "📋 Checking configuration..."
echo ""

# Check if audio dump directory exists
if [ -d "./audio-dumps" ]; then
    echo "✅ Audio dump directory exists: ./audio-dumps"
else
    echo "⚠️  Audio dump directory not found (will be created automatically)"
    mkdir -p ./audio-dumps
    echo "   Created directory"
fi

echo ""

# Check for any dumped files
CHUNK_COUNT=$(find ./audio-dumps -name "chunk-*.wav" -o -name "chunk-*.pcm" 2>/dev/null | wc -l | tr -d ' ')

if [ "$CHUNK_COUNT" -eq 0 ]; then
    echo "⚠️  No audio chunks found yet"
    echo ""
    echo "Possible reasons:"
    echo "  1. Exotel call hasn't connected yet"
    echo "  2. No audio is being sent from Exotel"
    echo "  3. AUDIO_DUMP_ENABLED might not be set"
    echo ""
    echo "Next steps:"
    echo "  1. Check service logs for '[exotel]' messages"
    echo "  2. Verify Exotel is configured correctly"
    echo "  3. Make sure you're speaking during the call"
    echo "  4. Check if service was started with: ./START_WITH_AUDIO_DUMP.sh"
else
    echo "✅ Found $CHUNK_COUNT audio chunk(s)"
    echo ""
    echo "📁 Call directories:"
    find ./audio-dumps -mindepth 1 -maxdepth 1 -type d | while read dir; do
        CALL_ID=$(basename "$dir")
        COUNT=$(find "$dir" -name "chunk-*.wav" -o -name "chunk-*.pcm" 2>/dev/null | wc -l | tr -d ' ')
        echo "  📂 $CALL_ID ($COUNT chunks)"
    done
fi

echo ""
echo "💡 To check service logs, look for:"
echo "   - [audio-dumper] Audio dumping enabled"
echo "   - [exotel] New Exotel WebSocket connection"
echo "   - [audio-dumper] 💾 Dumped audio chunk"

