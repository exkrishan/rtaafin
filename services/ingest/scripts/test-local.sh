#!/bin/bash
# Local testing script for ingestion service

set -e

echo "🧪 Testing Ingestion Service Locally"
echo "===================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run from services/ingest directory${NC}"
    echo "   Run: cd services/ingest && ./scripts/test-local.sh"
    exit 1
fi

# Check for required environment variables
echo "1. Checking environment variables..."
if [ -z "$REDIS_URL" ]; then
    echo -e "${YELLOW}⚠️  REDIS_URL not set${NC}"
    echo "   Setting default: redis://localhost:6379"
    export REDIS_URL="redis://localhost:6379"
else
    echo -e "${GREEN}✅ REDIS_URL is set${NC}"
fi

if [ -z "$PUBSUB_ADAPTER" ]; then
    echo -e "${YELLOW}⚠️  PUBSUB_ADAPTER not set${NC}"
    echo "   Setting default: redis_streams"
    export PUBSUB_ADAPTER="redis_streams"
else
    echo -e "${GREEN}✅ PUBSUB_ADAPTER is set${NC}"
fi

# JWT_PUBLIC_KEY is optional for testing (if SUPPORT_EXOTEL=true)
if [ -z "$JWT_PUBLIC_KEY" ] && [ "$SUPPORT_EXOTEL" != "true" ]; then
    echo -e "${YELLOW}⚠️  JWT_PUBLIC_KEY not set${NC}"
    echo "   JWT authentication will fail (set SUPPORT_EXOTEL=true to bypass)"
fi

# Set PORT if not set
if [ -z "$PORT" ]; then
    export PORT=5000
fi

echo ""
echo "2. Building service..."
npm run build

if [ ! -f "dist/server.js" ]; then
    echo -e "${RED}❌ Build failed: dist/server.js not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"
echo ""

echo "3. Starting service on port $PORT..."
echo ""
echo "   Environment:"
echo "   - PORT: $PORT"
echo "   - REDIS_URL: $REDIS_URL"
echo "   - PUBSUB_ADAPTER: $PUBSUB_ADAPTER"
echo "   - SUPPORT_EXOTEL: ${SUPPORT_EXOTEL:-false}"
echo ""
echo "   Endpoints:"
echo "   - Health: http://localhost:$PORT/health"
echo "   - WebSocket: ws://localhost:$PORT/v1/ingest"
echo ""
echo "   Press Ctrl+C to stop"
echo ""
echo "===================================="
echo ""

# Start the service
npm run start

