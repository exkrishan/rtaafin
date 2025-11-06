#!/bin/bash
#
# Monitor WebSocket → ASR Flow in Real-Time
# Shows logs from both ingestion and ASR worker
#

echo "🔍 Monitoring WebSocket → ASR Flow"
echo "=================================="
echo ""
echo "This will show logs from:"
echo "  1. Ingestion Service (WebSocket, Pub/Sub)"
echo "  2. ASR Worker (Audio processing, Transcripts)"
echo ""
echo "Press Ctrl+C to stop"
echo ""
echo "Starting monitoring..."
echo ""

# Function to check if service is running
check_service() {
    local name=$1
    local url=$2
    if curl -s "$url" > /dev/null 2>&1; then
        echo "✅ $name is running"
        return 0
    else
        echo "❌ $name is not running"
        return 1
    fi
}

# Check services
echo "Checking services..."
check_service "Ingestion" "http://localhost:8443/health"
check_service "ASR Worker" "http://localhost:3001/health"
echo ""

# Show initial metrics
echo "📊 Initial ASR Metrics:"
curl -s http://localhost:3001/metrics | grep -E "asr_(audio_chunks|errors|transcripts)" || echo "No metrics yet"
echo ""

# Monitor logs
echo "📝 Monitoring logs (last 20 lines, then follow)..."
echo ""

# Show recent logs
echo "=== Recent Ingestion Logs ==="
tail -20 /tmp/rtaa-ingest.log 2>/dev/null || echo "No ingestion logs found"
echo ""

echo "=== Recent ASR Worker Logs ==="
tail -20 /tmp/rtaa-asr.log 2>/dev/null || echo "No ASR logs found"
echo ""

echo "=== Following logs (Ctrl+C to stop) ==="
echo ""

# Follow logs from both services
tail -f /tmp/rtaa-ingest.log /tmp/rtaa-asr.log 2>/dev/null || {
    echo "⚠️  Log files not found. Make sure services are running:"
    echo "   ./start-all-services.sh"
}

