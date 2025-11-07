#!/bin/bash
# Deployment validation script for ingestion service
# Validates build output, environment variables, and service readiness

set -e

echo "🔍 Validating Ingestion Service Deployment"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if dist/server.js exists
echo "1. Checking build output..."
if [ -f "dist/server.js" ]; then
    echo -e "${GREEN}✅ dist/server.js exists${NC}"
    SIZE=$(ls -lh dist/server.js | awk '{print $5}')
    echo "   Size: $SIZE"
else
    echo -e "${RED}❌ dist/server.js not found${NC}"
    echo "   Run: npm run build"
    exit 1
fi

# Check required environment variables
echo ""
echo "2. Checking environment variables..."
REQUIRED_VARS=("REDIS_URL" "PUBSUB_ADAPTER")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All required environment variables are set${NC}"
else
    echo -e "${YELLOW}⚠️  Missing environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo "   (These may be set in Render dashboard)"
fi

# Check optional environment variables
echo ""
echo "3. Checking optional environment variables..."
OPTIONAL_VARS=("JWT_PUBLIC_KEY" "SUPPORT_EXOTEL" "BUFFER_DURATION_MS" "ACK_INTERVAL")
for var in "${OPTIONAL_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${YELLOW}⚠️  $var not set (using default)${NC}"
    else
        echo -e "${GREEN}✅ $var is set${NC}"
    fi
done

# Validate PUBSUB_ADAPTER value
echo ""
echo "4. Validating PUBSUB_ADAPTER..."
ADAPTER="${PUBSUB_ADAPTER:-redis_streams}"
if [[ "$ADAPTER" == "redis_streams" ]] || [[ "$ADAPTER" == "kafka" ]] || [[ "$ADAPTER" == "in_memory" ]]; then
    echo -e "${GREEN}✅ PUBSUB_ADAPTER is valid: $ADAPTER${NC}"
else
    echo -e "${RED}❌ Invalid PUBSUB_ADAPTER: $ADAPTER${NC}"
    echo "   Must be one of: redis_streams, kafka, in_memory"
    exit 1
fi

# Validate REDIS_URL format if using redis_streams
if [ "$ADAPTER" == "redis_streams" ]; then
    echo ""
    echo "5. Validating REDIS_URL format..."
    if [ -n "$REDIS_URL" ]; then
        if [[ "$REDIS_URL" == redis://* ]] || [[ "$REDIS_URL" == rediss://* ]]; then
            echo -e "${GREEN}✅ REDIS_URL format is valid${NC}"
        else
            echo -e "${RED}❌ Invalid REDIS_URL format${NC}"
            echo "   Must start with redis:// or rediss://"
            exit 1
        fi
    fi
fi

# Check PORT
echo ""
echo "6. Checking PORT..."
PORT="${PORT:-5000}"
if [[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ]; then
    echo -e "${GREEN}✅ PORT is valid: $PORT${NC}"
else
    echo -e "${RED}❌ Invalid PORT: $PORT${NC}"
    echo "   Must be between 1 and 65535"
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Deployment validation complete${NC}"
echo ""
echo "To start the service:"
echo "  npm run start"
echo ""
echo "To test health endpoint:"
echo "  curl http://localhost:$PORT/health"
echo ""

