#!/bin/bash
# Kill existing processes, clear lock, and restart dev server

echo "🔧 Stopping existing Next.js processes..."
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null
# Kill process 35140 if it exists
kill -9 35140 2>/dev/null
# Kill any other Next.js processes
pkill -f "next dev" 2>/dev/null

echo "🧹 Cleaning lock file..."
rm -f .next/dev/lock

echo "🚀 Starting dev server with Node.js 20..."
source ~/.nvm/nvm.sh
nvm use 20
npm run dev

