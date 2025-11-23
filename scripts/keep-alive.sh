#!/bin/bash

# Keep-Alive Script for Render Services
# This script pings all Render services to prevent them from sleeping
# Run this script every 5-10 minutes via cron or GitHub Actions

set -e

# Service URLs
FRONTEND_URL="https://frontend-8jdd.onrender.com/api/health"
INGEST_URL="https://rtaa-ingest.onrender.com/health"
ASR_WORKER_URL="https://rtaa-asr-worker.onrender.com/health"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🔄 Waking up Render services..."
echo ""

# Function to ping a service
ping_service() {
    local name=$1
    local url=$2
    
    echo -n "Pinging ${name}... "
    
    response=$(curl -s -w "\n%{http_code}" --max-time 10 "$url" || echo -e "\n000")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "000" ]; then
        if [ "$http_code" = "200" ]; then
            echo -e "${GREEN}✅ OK${NC} (HTTP $http_code)"
        else
            echo -e "${YELLOW}⚠️  Timeout/Error${NC} (HTTP $http_code) - Service may be sleeping"
        fi
        return 0
    else
        echo -e "${RED}❌ Failed${NC} (HTTP $http_code)"
        return 1
    fi
}

# Ping all services
ping_service "Frontend" "$FRONTEND_URL"
ping_service "Ingest Service" "$INGEST_URL"
ping_service "ASR Worker" "$ASR_WORKER_URL"

echo ""
echo "✅ Keep-alive ping completed at $(date)"
echo ""

