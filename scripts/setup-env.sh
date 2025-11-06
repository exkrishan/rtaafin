#!/bin/bash
#
# Setup script to create .env.local from credentials
# Usage: ./scripts/setup-env.sh

set -e

echo "🔧 RTAA Environment Setup"
echo ""

# Check if .env.local already exists
if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Read JWT public key
JWT_PUBLIC_KEY=$(cat scripts/keys/jwt-public-key.pem 2>/dev/null || echo "")

if [ -z "$JWT_PUBLIC_KEY" ]; then
    echo "❌ JWT public key not found. Generating..."
    mkdir -p scripts/keys
    openssl genrsa -out scripts/keys/jwt-private-key.pem 2048
    openssl rsa -in scripts/keys/jwt-private-key.pem -pubout -out scripts/keys/jwt-public-key.pem
    JWT_PUBLIC_KEY=$(cat scripts/keys/jwt-public-key.pem)
    echo "✅ JWT keys generated"
fi

# Prompt for credentials
echo "Please provide the following credentials:"
echo ""

read -p "Supabase URL (NEXT_PUBLIC_SUPABASE_URL): " SUPABASE_URL
read -p "Supabase Service Role Key (SUPABASE_SERVICE_ROLE_KEY): " SUPABASE_KEY
read -p "Gemini API Key (LLM_API_KEY): " GEMINI_KEY
read -p "Deepgram API Key (DEEPGRAM_API_KEY): " DEEPGRAM_KEY

# Check Redis
echo ""
echo "Checking Redis..."
if docker ps | grep -q redis || redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "✅ Redis is running"
    REDIS_URL="redis://localhost:6379"
else
    echo "⚠️  Redis not detected. Using default: redis://localhost:6379"
    echo "   Start Redis with: docker run -d -p 6379:6379 redis:7-alpine"
    REDIS_URL="redis://localhost:6379"
fi

# Create .env.local
cat > .env.local << EOF
# ============================================
# RTAA Agent Assist - Environment Variables
# Generated: $(date)
# ============================================

# Supabase
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_KEY}

# LLM (Gemini)
LLM_API_KEY=${GEMINI_KEY}
LLM_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash

# TLS (Dev only - set to true if you have corporate proxy issues)
ALLOW_INSECURE_TLS=false

# Pub/Sub (Redis Streams)
PUBSUB_ADAPTER=redis_streams
REDIS_URL=${REDIS_URL}
REDIS_CONSUMER_GROUP=agent-assist
REDIS_CONSUMER_NAME=consumer-1

# Ingestion Service
INGEST_PORT=8443
JWT_PUBLIC_KEY=${JWT_PUBLIC_KEY}
USE_AUDIO_STREAM=true

# ASR Worker
ASR_PORT=3001
ASR_PROVIDER=deepgram
DEEPGRAM_API_KEY=${DEEPGRAM_KEY}
BUFFER_WINDOW_MS=300

# Next.js
NODE_ENV=development
EOF

echo ""
echo "✅ .env.local created successfully!"
echo ""
echo "📋 Summary:"
echo "  - Supabase URL: ${SUPABASE_URL:0:30}..."
echo "  - Gemini API Key: ${GEMINI_KEY:0:20}..."
echo "  - Deepgram API Key: ${DEEPGRAM_KEY:0:20}..."
echo "  - Redis URL: ${REDIS_URL}"
echo "  - JWT Public Key: ✅ Generated"
echo ""
echo "🚀 Next steps:"
echo "  1. Verify .env.local has all correct values"
echo "  2. Start Redis if not running: docker run -d -p 6379:6379 redis:7-alpine"
echo "  3. Start services: npm run dev (for Next.js app)"
echo ""

