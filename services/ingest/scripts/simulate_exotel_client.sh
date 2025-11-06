#!/bin/bash
#
# Simulate Exotel client sending PCM16 audio frames via WebSocket
#
# Usage: ./scripts/simulate_exotel_client.sh [audio_file.pcm]
#
# If audio_file.pcm is not provided, generates synthetic PCM16 data

set -e

WS_URL="${WS_URL:-ws://localhost:8443/v1/ingest}"
JWT_TOKEN="${JWT_TOKEN:-test-token}"
AUDIO_FILE="${1:-}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Exotel client simulation...${NC}"
echo "WebSocket URL: $WS_URL"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "Error: node is required but not installed"
    exit 1
fi

# Create temporary Node.js script
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'EOF'
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const WS_URL = process.env.WS_URL || 'ws://localhost:8443/v1/ingest';
const JWT_TOKEN = process.env.JWT_TOKEN || 'test-token';
const AUDIO_FILE = process.env.AUDIO_FILE;

// Generate synthetic PCM16 data if no file provided
function generatePCM16Frame(frameNumber) {
  const samples = 4800; // 200ms at 24kHz (24000 * 0.2)
  const buffer = Buffer.allocUnsafe(samples * 2); // 2 bytes per sample (16-bit)
  
  // Generate a simple sine wave
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / 24000) * 16000; // 440Hz tone
    buffer.writeInt16LE(Math.floor(sample), i * 2);
  }
  
  return buffer;
}

async function run() {
  console.log(`Connecting to ${WS_URL}...`);
  
  const ws = new WebSocket(WS_URL, {
    headers: {
      'Authorization': `Bearer ${JWT_TOKEN}`,
    },
  });

  let audioFrames = [];
  let frameSize = 9600; // 200ms of PCM16 at 24kHz

  // Load audio file if provided
  if (AUDIO_FILE && fs.existsSync(AUDIO_FILE)) {
    console.log(`Loading audio file: ${AUDIO_FILE}`);
    const audioData = fs.readFileSync(AUDIO_FILE);
    // Split into 200ms chunks
    for (let i = 0; i < audioData.length; i += frameSize) {
      audioFrames.push(audioData.slice(i, i + frameSize));
    }
    console.log(`Loaded ${audioFrames.length} frames from file`);
  } else {
    // Generate 50 synthetic frames (~10 seconds)
    console.log('Generating 50 synthetic PCM16 frames...');
    for (let i = 0; i < 50; i++) {
      audioFrames.push(generatePCM16Frame(i));
    }
  }

  ws.on('open', () => {
    console.log('✓ WebSocket connected');
    
    // Send start event
    const startEvent = {
      event: 'start',
      interaction_id: `test-int-${Date.now()}`,
      tenant_id: 'test-tenant',
      sample_rate: 24000,
      encoding: 'pcm16',
    };
    
    console.log('Sending start event:', JSON.stringify(startEvent));
    ws.send(JSON.stringify(startEvent));
  });

  let ackCount = 0;
  let frameCount = 0;

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.event === 'started') {
        console.log('✓ Start acknowledged');
        console.log('Streaming audio frames...');
        
        // Send frames with ~200ms intervals
        const sendNextFrame = () => {
          if (frameCount < audioFrames.length) {
            ws.send(audioFrames[frameCount], { binary: true });
            frameCount++;
            
            if (frameCount % 10 === 0) {
              process.stdout.write(`\rSent ${frameCount}/${audioFrames.length} frames`);
            }
            
            setTimeout(sendNextFrame, 200);
          } else {
            console.log(`\n✓ All ${audioFrames.length} frames sent`);
            console.log('Waiting for final ACKs...');
            setTimeout(() => {
              console.log(`✓ Received ${ackCount} ACK messages`);
              ws.close();
            }, 1000);
          }
        };
        
        sendNextFrame();
      } else if (message.event === 'ack') {
        ackCount++;
        console.log(`\n✓ Received ACK: seq=${message.seq}`);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    process.exit(1);
  });

  ws.on('close', (code, reason) => {
    console.log(`\nWebSocket closed: code=${code}, reason=${reason.toString()}`);
    console.log(`Summary: Sent ${frameCount} frames, received ${ackCount} ACKs`);
    process.exit(0);
  });
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
EOF

# Run the script from project root so it can find node_modules
export WS_URL JWT_TOKEN AUDIO_FILE
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"  # Get absolute path to project root
export NODE_PATH="$PROJECT_ROOT/node_modules:$NODE_PATH"
cd "$PROJECT_ROOT"
node "$TEMP_SCRIPT"

# Cleanup
rm "$TEMP_SCRIPT"

echo -e "${GREEN}Simulation complete!${NC}"

