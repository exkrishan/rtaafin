#!/bin/bash
#
# Start All Services - Complete RTAA Setup
# This script starts all required services for local development
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting RTAA Services${NC}"
echo "================================"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}❌ .env.local not found!${NC}"
    echo "   Please create .env.local with required credentials"
    echo "   See: SETUP_CREDENTIALS.md"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}⚠️  Node.js version is less than 20. Using nvm...${NC}"
    if command -v nvm &> /dev/null; then
        nvm use 20
    else
        echo -e "${RED}❌ Please use Node.js 20 or higher${NC}"
        exit 1
    fi
fi

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -ti:$port > /dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    if check_port $port; then
        echo -e "${YELLOW}⚠️  Port $port is in use, killing process...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

# Clean up ports
echo "🧹 Cleaning up ports..."
kill_port 3000  # Next.js
kill_port 8443  # Ingestion
kill_port 3001  # ASR Worker
echo ""

# Install dependencies if needed
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Installing root dependencies..."
    npm install
fi

if [ ! -d "services/ingest/node_modules" ]; then
    echo "   Installing ingestion service dependencies..."
    cd services/ingest && npm install && cd ../..
fi

if [ ! -d "services/asr-worker/node_modules" ]; then
    echo "   Installing ASR worker dependencies..."
    cd services/asr-worker && npm install && cd ../..
fi

if [ ! -d "lib/pubsub/node_modules" ]; then
    echo "   Installing pub/sub library dependencies..."
    cd lib/pubsub && npm install && cd ../..
fi

echo ""

# Start services in background
echo -e "${GREEN}🚀 Starting services...${NC}"
echo ""

# Terminal 1: Next.js App
echo "1️⃣  Starting Next.js App (port 3000)..."
cd "$(dirname "$0")"
npm run dev > /tmp/rtaa-nextjs.log 2>&1 &
NEXTJS_PID=$!
echo "   PID: $NEXTJS_PID"
echo "   Logs: /tmp/rtaa-nextjs.log"
sleep 3

# Terminal 2: Ingestion Service
echo "2️⃣  Starting Ingestion Service (port 8443)..."
cd services/ingest
npm run dev > /tmp/rtaa-ingest.log 2>&1 &
INGEST_PID=$!
echo "   PID: $INGEST_PID"
echo "   Logs: /tmp/rtaa-ingest.log"
cd ../..
sleep 3

# Terminal 3: ASR Worker
echo "3️⃣  Starting ASR Worker (port 3001)..."
cd services/asr-worker
npm run dev > /tmp/rtaa-asr.log 2>&1 &
ASR_PID=$!
echo "   PID: $ASR_PID"
echo "   Logs: /tmp/rtaa-asr.log"
cd ../..
sleep 3

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo ""
echo "📋 Service Status:"
echo "=================="

# Wait a bit for services to start
sleep 5

# Check service health
check_service() {
    local name=$1
    local url=$2
    if curl -s "$url" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅${NC} $name: Running"
        return 0
    else
        echo -e "   ${RED}❌${NC} $name: Not responding"
        return 1
    fi
}

check_service "Next.js App" "http://localhost:3000"
check_service "Ingestion Service" "http://localhost:8443/health"
check_service "ASR Worker" "http://localhost:3001/health"

echo ""
echo "🔗 Service URLs:"
echo "==============="
echo "   📱 Next.js App:        http://localhost:3000"
echo "   🔌 Ingestion (WSS):    wss://localhost:8443/v1/ingest"
echo "   📊 ASR Worker Metrics: http://localhost:3001/metrics"
echo "   ❤️  ASR Worker Health: http://localhost:3001/health"
echo ""
echo "📝 Log Files:"
echo "============="
echo "   Next.js:        tail -f /tmp/rtaa-nextjs.log"
echo "   Ingestion:      tail -f /tmp/rtaa-ingest.log"
echo "   ASR Worker:     tail -f /tmp/rtaa-asr.log"
echo ""
echo "🛑 To stop all services:"
echo "   ./stop-all-services.sh"
echo ""
echo "🧪 To test the complete flow:"
echo "   npx tsx scripts/test-transcript-flow.ts"
echo ""

# Save PIDs to file for stop script
echo "$NEXTJS_PID" > /tmp/rtaa-pids.txt
echo "$INGEST_PID" >> /tmp/rtaa-pids.txt
echo "$ASR_PID" >> /tmp/rtaa-pids.txt

echo -e "${GREEN}🎉 Setup complete! All services are running.${NC}"

