#!/bin/bash
#
# Check WebSocket → ASR Flow Status
# Shows current state of the pipeline
#

echo "🔍 WebSocket → ASR Flow Status"
echo "=============================="
echo ""

# Check services
echo "1️⃣  Service Status:"
echo "-------------------"
if curl -s http://localhost:8443/health > /dev/null 2>&1; then
    echo "   ✅ Ingestion Service: Running"
else
    echo "   ❌ Ingestion Service: Not running"
fi

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "   ✅ ASR Worker: Running"
else
    echo "   ❌ ASR Worker: Not running"
fi
echo ""

# Check ASR Metrics
echo "2️⃣  ASR Worker Metrics:"
echo "----------------------"
METRICS=$(curl -s http://localhost:3001/metrics 2>/dev/null)
if [ -n "$METRICS" ]; then
    CHUNKS=$(echo "$METRICS" | grep "asr_audio_chunks_processed_total" | awk '{print $2}' || echo "0")
    ERRORS=$(echo "$METRICS" | grep "asr_errors_total" | awk '{print $2}' || echo "0")
    LATENCY=$(echo "$METRICS" | grep "asr_first_partial_latency_ms" | awk '{print $2}' || echo "N/A")
    
    echo "   Audio chunks processed: $CHUNKS"
    echo "   Errors: $ERRORS"
    echo "   First partial latency: ${LATENCY}ms"
    
    if [ "$CHUNKS" -gt 0 ]; then
        echo "   ✅ ASR Worker has processed audio!"
    else
        echo "   ⚠️  No audio chunks processed yet"
    fi
else
    echo "   ❌ Could not fetch metrics"
fi
echo ""

# Check recent logs
echo "3️⃣  Recent Ingestion Logs (last 5 lines):"
echo "------------------------------------------"
tail -5 /tmp/rtaa-ingest.log 2>/dev/null | grep -E "\[auth\]|\[server\]|Published|WebSocket" || echo "   No relevant logs found"
echo ""

echo "4️⃣  Recent ASR Worker Logs (last 5 lines):"
echo "------------------------------------------"
tail -5 /tmp/rtaa-asr.log 2>/dev/null | grep -E "Subscribed|Received|Processing|Generated" || echo "   No relevant logs found"
echo ""

# Check pub/sub adapter
echo "5️⃣  Pub/Sub Configuration:"
echo "--------------------------"
if grep -q "PUBSUB_ADAPTER=in_memory" .env.local 2>/dev/null; then
    echo "   ✅ Using in-memory adapter (no Redis needed)"
elif grep -q "PUBSUB_ADAPTER=redis" .env.local 2>/dev/null; then
    echo "   ⚠️  Using Redis adapter (check if Redis is running)"
else
    echo "   ⚠️  PUBSUB_ADAPTER not set (defaults to redis_streams)"
fi
echo ""

# Summary
echo "📊 Summary:"
echo "-----------"
if [ "$CHUNKS" -gt 0 ] 2>/dev/null; then
    echo "   ✅ WebSocket → ASR flow is WORKING!"
    echo "   ✅ Audio is being processed by ASR worker"
else
    echo "   ⚠️  WebSocket → ASR flow not active yet"
    echo ""
    echo "   To test:"
    echo "   1. Fix WebSocket authentication (check ingestion logs)"
    echo "   2. Send audio via WebSocket"
    echo "   3. Check metrics again"
fi
echo ""

echo "💡 To monitor in real-time:"
echo "   ./scripts/monitor-asr-flow.sh"
echo ""
echo "💡 To test WebSocket connection:"
echo "   node scripts/generate-test-jwt.js"
echo "   cd services/ingest"
echo "   JWT_TOKEN=\"<token>\" ./scripts/simulate_exotel_client.sh"

