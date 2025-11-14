#!/bin/bash
# Quick start script for ingest service with audio dumping enabled

cd "$(dirname "$0")"

# Set all required environment variables
export AUDIO_DUMP_ENABLED=true
export AUDIO_DUMP_DIR=./audio-dumps
export AUDIO_DUMP_FORMAT=wav
export SUPPORT_EXOTEL=true
export PUBSUB_ADAPTER=redis_streams
export REDIS_URL='redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304'
export PORT=8443

echo "🚀 Starting Ingest Service with Audio Dumping..."
echo ""
echo "Configuration:"
echo "  ✅ Audio Dump: ENABLED"
echo "  ✅ Dump Directory: ./audio-dumps"
echo "  ✅ Format: WAV"
echo "  ✅ Exotel Support: ENABLED"
echo "  ✅ Redis: Connected to Cloud"
echo ""
echo "Service will start on: ws://localhost:8443/v1/ingest"
echo "Audio files will be saved to: ./audio-dumps/"
echo ""

# Start the service
npm run dev

