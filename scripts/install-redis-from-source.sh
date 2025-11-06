#!/bin/bash
#
# Install Redis from Source (No package manager needed)
#

set -e

echo "🔧 Installing Redis from Source"
echo "==============================="
echo ""

# Check prerequisites
echo "1️⃣  Checking prerequisites..."

if ! command -v make >/dev/null 2>&1; then
    echo "❌ 'make' not found. Please install Xcode Command Line Tools:"
    echo "   xcode-select --install"
    exit 1
fi
echo "   ✅ make found"

if ! command -v gcc >/dev/null 2>&1 && ! command -v clang >/dev/null 2>&1; then
    echo "❌ C compiler (gcc/clang) not found. Please install Xcode Command Line Tools:"
    echo "   xcode-select --install"
    exit 1
fi
echo "   ✅ C compiler found"

# Download Redis
echo ""
echo "2️⃣  Downloading Redis..."
cd ~/Downloads || cd /tmp

REDIS_VERSION="7.2.3"
REDIS_URL="https://download.redis.io/releases/redis-${REDIS_VERSION}.tar.gz"

if [ -f "redis-${REDIS_VERSION}.tar.gz" ]; then
    echo "   ⚠️  Redis archive already exists, skipping download"
else
    if command -v curl >/dev/null 2>&1; then
        curl -O "$REDIS_URL"
    elif command -v wget >/dev/null 2>&1; then
        wget "$REDIS_URL"
    else
        echo "❌ Neither curl nor wget found"
        exit 1
    fi
    echo "   ✅ Downloaded Redis ${REDIS_VERSION}"
fi

# Extract
echo ""
echo "3️⃣  Extracting Redis..."
if [ -d "redis-${REDIS_VERSION}" ]; then
    echo "   ⚠️  Redis directory already exists, removing..."
    rm -rf "redis-${REDIS_VERSION}"
fi
tar xzf "redis-${REDIS_VERSION}.tar.gz"
cd "redis-${REDIS_VERSION}"
echo "   ✅ Extracted"

# Build
echo ""
echo "4️⃣  Building Redis (this may take a few minutes)..."
make
echo "   ✅ Build complete"

# Test (optional but recommended)
echo ""
echo "5️⃣  Testing Redis build..."
if make test >/dev/null 2>&1; then
    echo "   ✅ Tests passed"
else
    echo "   ⚠️  Tests failed or skipped (continuing anyway)"
fi

# Install (optional - copies binaries to /usr/local/bin)
echo ""
read -p "6️⃣  Install Redis to /usr/local/bin? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "   Installing..."
    sudo make install
    echo "   ✅ Installed to /usr/local/bin"
    echo ""
    echo "   You can now run: redis-server"
    echo "   Or: redis-cli ping"
else
    echo "   Skipping installation"
    echo ""
    echo "   To run Redis, use:"
    echo "   cd ~/Downloads/redis-${REDIS_VERSION}"
    echo "   ./src/redis-server"
    echo ""
    echo "   To test:"
    echo "   ./src/redis-cli ping"
fi

echo ""
echo "✅ Redis installation complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Start Redis: redis-server (or ./src/redis-server if not installed)"
echo "   2. Test: redis-cli ping (should return PONG)"
echo "   3. Update .env.local: REDIS_URL=redis://localhost:6379"
echo "   4. Restart services: ./stop-all-services.sh && ./start-all-services.sh"

