#!/usr/bin/env node

/**
 * Test Exotel protocol - simulates full Exotel WebSocket flow
 * Sends: start event, multiple media events with base64 audio, stop event
 */

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'wss://rtaa-ingest.onrender.com/v1/ingest';
const JWT_TOKEN = process.env.JWT_TOKEN || '';

console.log('🔌 Testing Exotel Protocol...');
console.log(`URL: ${WS_URL}`);
console.log(`Auth: ${JWT_TOKEN ? 'JWT token provided' : 'No auth (Exotel mode)'}`);
console.log('');

// Generate test PCM16 audio (silence - all zeros)
// 100ms of audio at 8kHz = 800 samples = 1600 bytes (16-bit = 2 bytes per sample)
function generateTestAudio(sampleRate = 8000, durationMs = 100) {
  const samples = (sampleRate * durationMs) / 1000;
  const buffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
  // Fill with some test pattern (alternating values to make it detectable)
  for (let i = 0; i < samples; i++) {
    const value = Math.sin((i / samples) * Math.PI * 2) * 1000; // Simple sine wave
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(value)));
    buffer.writeInt16LE(int16, i * 2);
  }
  return buffer.toString('base64');
}

const ws = new WebSocket(WS_URL, {
  headers: JWT_TOKEN ? {
    'Authorization': `Bearer ${JWT_TOKEN}`
  } : {}
});

let streamSid = 'test-stream-' + Date.now();
let callSid = 'test-call-' + Date.now();
let sequenceNumber = 1;
let mediaChunk = 1;

ws.on('open', () => {
  console.log('✅ WebSocket connection opened successfully!');
  console.log('');
  
  // Step 1: Send start event
  console.log('📤 Step 1: Sending start event...');
  const startEvent = {
    event: 'start',
    sequence_number: sequenceNumber++,
    stream_sid: streamSid,
    start: {
      stream_sid: streamSid,
      call_sid: callSid,
      account_sid: 'test-account',
      from: '+1234567890',
      to: '+0987654321',
      media_format: {
        sample_rate: '8000',
        encoding: 'pcm16'
      }
    }
  };
  
  ws.send(JSON.stringify(startEvent));
  console.log('✅ Start event sent');
  console.log('');
  
  // Step 2: Wait a bit, then send media events
  setTimeout(() => {
    console.log('📤 Step 2: Sending media events (5 chunks of 100ms audio each)...');
    
    let mediaCount = 0;
    const sendMedia = () => {
      if (mediaCount >= 5) {
        // Step 3: Send stop event
        setTimeout(() => {
          console.log('');
          console.log('📤 Step 3: Sending stop event...');
          const stopEvent = {
            event: 'stop',
            sequence_number: sequenceNumber++,
            stream_sid: streamSid,
            stop: {
              call_sid: callSid,
              account_sid: 'test-account',
              reason: 'test-complete'
            }
          };
          
          ws.send(JSON.stringify(stopEvent));
          console.log('✅ Stop event sent');
          console.log('');
          
          // Close after 1 second
          setTimeout(() => {
            console.log('Closing connection...');
            ws.close();
          }, 1000);
        }, 500);
        return;
      }
      
      const audioBase64 = generateTestAudio(8000, 100); // 100ms of audio
      const mediaEvent = {
        event: 'media',
        sequence_number: sequenceNumber++,
        stream_sid: streamSid,
        media: {
          chunk: mediaChunk++,
          timestamp: String(Date.now()),
          payload: audioBase64
        }
      };
      
      ws.send(JSON.stringify(mediaEvent));
      console.log(`  ✅ Media event ${mediaCount + 1}/5 sent (chunk ${mediaChunk - 1}, ${audioBase64.length} bytes base64)`);
      
      mediaCount++;
      setTimeout(sendMedia, 200); // Send next chunk after 200ms
    };
    
    sendMedia();
  }, 500);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', JSON.stringify(message, null, 2));
  } catch (e) {
    console.log('📨 Received binary/data:', data.toString().substring(0, 100));
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('Error details:', error);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('');
  console.log(`🔌 Connection closed (code: ${code}, reason: ${reason || 'none'})`);
  console.log('');
  console.log('✅ Test complete!');
  console.log('');
  console.log('Expected behavior:');
  console.log('  1. Ingest service should log: "[exotel] Start event received"');
  console.log('  2. Ingest service should log: "[exotel] Published audio frame" (5 times)');
  console.log('  3. ASR Worker should receive audio frames and process them');
  console.log('  4. Ingest service should log: "[exotel] Stop event received"');
  process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    console.log('');
    console.log('⏱️  Timeout - closing connection');
    ws.close();
  } else if (ws.readyState === WebSocket.CONNECTING) {
    console.log('');
    console.error('❌ Connection timeout - unable to connect');
    process.exit(1);
  }
}, 30000);

