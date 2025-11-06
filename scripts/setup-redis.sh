#!/bin/bash
#
# Setup Redis for RTAA pub/sub
#

echo "🔧 Setting up Redis for RTAA"
echo "============================="
echo ""

# Check if Redis is already running
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "✅ Redis is already running"
    exit 0
fi

# Check if Redis is installed
if ! command -v redis-server >/dev/null 2>&1; then
    echo "⚠️  Redis is not installed"
    echo ""
    
    # Try Homebrew (macOS)
    if command -v brew >/dev/null 2>&1; then
        echo "📦 Installing Redis via Homebrew..."
        brew install redis
    else
        echo "❌ Please install Redis manually:"
        echo "   macOS: brew install redis"
        echo "   Linux: sudo apt-get install redis-server"
        echo "   Or use Docker: docker run -d -p 6379:6379 redis:7-alpine"
        exit 1
    fi
fi

# Start Redis
echo "🚀 Starting Redis server..."
redis-server --daemonize yes --port 6379

# Wait for Redis to start
sleep 2

# Verify Redis is running
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "✅ Redis started successfully"
    echo ""
    echo "📊 Redis Info:"
    redis-cli info server | grep -E "redis_version|uptime" | head -2
else
    echo "❌ Failed to start Redis"
    exit 1
fi

echo ""
echo "✅ Redis is ready for RTAA pub/sub"

