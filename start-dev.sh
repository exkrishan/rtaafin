#!/bin/bash
# Start Next.js dev server with correct Node.js version

# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Clean up any existing Next.js processes and lock files
echo "🧹 Cleaning up any existing Next.js processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3002 | xargs kill -9 2>/dev/null
rm -f .next/dev/lock 2>/dev/null

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
REQUIRED_VERSION=20

if [ "$NODE_VERSION" -lt "$REQUIRED_VERSION" ] 2>/dev/null; then
  echo "⚠️  Current Node.js version: $(node --version)"
  echo "📦 Next.js requires Node.js >=20.9.0"
  echo ""
  
  # Try to use nvm to switch to Node 20
  if command -v nvm >/dev/null 2>&1 || [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "🔄 Switching to Node.js 20..."
    nvm use 20 2>/dev/null || nvm install 20 && nvm use 20
    if [ $? -eq 0 ]; then
      echo "✅ Switched to Node.js $(node --version)"
    else
      echo "❌ Failed to switch Node.js version"
      echo ""
      echo "Please install Node.js 20 manually:"
      echo "  nvm install 20"
      echo "  nvm use 20"
      exit 1
    fi
  else
    echo "❌ nvm not found. Please install Node.js 20 manually:"
    echo "  - Using nvm: nvm install 20 && nvm use 20"
    echo "  - Using Homebrew: brew install node@20"
    exit 1
  fi
fi

echo "🚀 Starting Next.js dev server..."
npm run dev

echo "🧹 Cleaning up any existing Next.js processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3002 | xargs kill -9 2>/dev/null
rm -f .next/dev/lock 2>/dev/null

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
REQUIRED_VERSION=20

if [ "$NODE_VERSION" -lt "$REQUIRED_VERSION" ] 2>/dev/null; then
  echo "⚠️  Current Node.js version: $(node --version)"
  echo "📦 Next.js requires Node.js >=20.9.0"
  echo ""
  
  # Try to use nvm to switch to Node 20
  if command -v nvm >/dev/null 2>&1 || [ -s "$NVM_DIR/nvm.sh" ]; then
    echo "🔄 Switching to Node.js 20..."
    nvm use 20 2>/dev/null || nvm install 20 && nvm use 20
    if [ $? -eq 0 ]; then
      echo "✅ Switched to Node.js $(node --version)"
    else
      echo "❌ Failed to switch Node.js version"
      echo ""
      echo "Please install Node.js 20 manually:"
      echo "  nvm install 20"
      echo "  nvm use 20"
      exit 1
    fi
  else
    echo "❌ nvm not found. Please install Node.js 20 manually:"
    echo "  - Using nvm: nvm install 20 && nvm use 20"
    echo "  - Using Homebrew: brew install node@20"
    exit 1
  fi
fi

echo "🚀 Starting Next.js dev server..."
npm run dev
