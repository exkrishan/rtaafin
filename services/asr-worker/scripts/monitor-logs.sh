#!/bin/bash
# ASR Worker Log Monitor
# Monitors health, metrics, and Redis for real-time activity

echo "🔍 ASR Worker Log Monitor"
echo "========================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if ASR worker is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo -e "${RED}❌ ASR Worker is not running on port 3001${NC}"
  echo "Start it with: cd services/asr-worker && npm run dev"
  exit 1
fi

echo -e "${GREEN}✅ ASR Worker is running${NC}"
echo ""

# Function to show health status
show_health() {
  echo "📊 Health Status:"
  curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health
  echo ""
}

# Function to show metrics
show_metrics() {
  echo "📈 Metrics (last 10 lines):"
  curl -s http://localhost:3001/metrics | tail -10
  echo ""
}

# Function to check transcript consumer
show_transcript_consumer() {
  echo "🌐 Transcript Consumer Status:"
  curl -s http://localhost:3000/api/transcripts/status 2>/dev/null | python3 -m json.tool 2>/dev/null | head -20 || echo "Next.js app may not be running"
  echo ""
}

# Show initial status
show_health
show_metrics
show_transcript_consumer

# If --watch flag, continuously monitor
if [ "$1" == "--watch" ]; then
  echo "👀 Watching for changes (Ctrl+C to stop)..."
  echo ""
  while true; do
    sleep 5
    clear
    echo "🔍 ASR Worker Log Monitor (Updated: $(date +%H:%M:%S))"
    echo "========================="
    echo ""
    show_health
    show_metrics
    show_transcript_consumer
  done
else
  echo "💡 Tip: Run with --watch flag to monitor continuously:"
  echo "   ./scripts/monitor-logs.sh --watch"
fi



