#!/bin/bash
#
# Stop All Services
#

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🛑 Stopping RTAA Services..."
echo ""

# Kill by PIDs if file exists
if [ -f /tmp/rtaa-pids.txt ]; then
    while read pid; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "   Stopping PID: $pid"
            kill "$pid" 2>/dev/null || true
        fi
    done < /tmp/rtaa-pids.txt
    rm /tmp/rtaa-pids.txt
fi

# Kill by port (fallback)
echo "   Cleaning up ports..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8443 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

sleep 2

echo ""
echo -e "${GREEN}✅ All services stopped${NC}"

