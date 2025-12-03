#!/bin/bash
# ASR Worker Log Checking Guide

echo "🔍 ASR Worker Log Checking Methods"
echo "=================================="
echo ""

echo "📊 Method 1: Health & Metrics Endpoint"
echo "--------------------------------------"
echo "Health Check:"
curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health
echo ""
echo ""
echo "Metrics:"
curl -s http://localhost:3001/metrics | head -30
echo ""
echo ""

echo "📝 Method 2: View Real-Time Logs (Restart in Foreground)"
echo "--------------------------------------------------------"
echo "To see live logs, stop the background process and restart:"
echo ""
echo "  # Stop current worker:"
echo "  lsof -ti:3001 | xargs kill -9"
echo ""
echo "  # Restart in foreground (see logs):"
echo "  cd services/asr-worker"
echo "  ELEVENLABS_API_KEY='sk_d687c22a3dbf04db3097f3791abcd39abba69058fe835e8b' \\"
echo "  ASR_PROVIDER=elevenlabs \\"
echo "  EXO_BRIDGE_ENABLED=true \\"
echo "  REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \\"
echo "  PUBSUB_ADAPTER=redis_streams \\"
echo "  npm run dev"
echo ""

echo "🔍 Method 3: Check Process Status"
echo "----------------------------------"
ps aux | grep -E "(ts-node.*index|asr-worker)" | grep -v grep
echo ""

echo "📨 Method 4: Monitor Redis for Transcripts"
echo "-----------------------------------------"
echo "Check if transcripts are being published to Redis:"
echo "  # Install redis-cli if needed: brew install redis"
echo "  redis-cli -u 'redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304' \\"
echo "    XREAD COUNT 10 STREAMS transcript.* 0"
echo ""

echo "🌐 Method 5: Check Transcript Consumer Logs"
echo "--------------------------------------------"
echo "Check if transcripts are being consumed:"
echo "  curl -s http://localhost:3000/api/transcripts/status | python3 -m json.tool"
echo ""

