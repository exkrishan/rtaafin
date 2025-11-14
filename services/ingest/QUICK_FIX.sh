#!/bin/bash
# Quick fix: Restart service with audio dumping enabled

cd "$(dirname "$0")"

echo "🛑 Stopping current service..."
pkill -f "ts-node src/server.ts" || echo "No service to stop"

sleep 2

echo ""
echo "🚀 Starting service with audio dumping enabled..."
echo ""

# Set all required environment variables
export AUDIO_DUMP_ENABLED=true
export AUDIO_DUMP_DIR=./audio-dumps
export AUDIO_DUMP_FORMAT=wav
export SUPPORT_EXOTEL=true
export PUBSUB_ADAPTER=redis_streams
export REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304'
export PORT=8443

echo "Configuration:"
echo "  ✅ AUDIO_DUMP_ENABLED=true"
echo "  ✅ SUPPORT_EXOTEL=true"
echo "  ✅ REDIS_URL=configured"
echo ""
echo "Starting service..."
echo ""

# Start in background and show logs
npm run dev

