#!/bin/bash
# Helper script to run tests from correct location

cd "$(dirname "$0")"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Node.js version is $NODE_VERSION, need 20+"
    if command -v nvm &> /dev/null; then
        echo "Switching to Node.js 20..."
        nvm use 20
    else
        echo "❌ Please install Node.js 20 or use nvm"
        exit 1
    fi
fi

echo "✅ Running from project root: $(pwd)"
echo "✅ Node.js version: $(node -v)"
echo ""

npx tsx scripts/test-transcript-flow.ts
