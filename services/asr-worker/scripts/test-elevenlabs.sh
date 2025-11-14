#!/bin/bash

# Quick test script for ElevenLabs API
# Usage: ./scripts/test-elevenlabs.sh [options]

cd "$(dirname "$0")/.." || exit 1

# Check for API key
if [ -z "$ELEVENLABS_API_KEY" ]; then
  echo "❌ ELEVENLABS_API_KEY is required"
  echo "   Set ELEVENLABS_API_KEY=your_api_key"
  exit 1
fi

# Run the test script with all arguments passed through
ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" npx ts-node scripts/test-elevenlabs-simulate.ts "$@"

