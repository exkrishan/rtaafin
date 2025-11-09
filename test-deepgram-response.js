/**
 * Manual test script to connect to Deepgram and see raw API responses
 * 
 * Usage:
 *   node test-deepgram-response.js
 * 
 * This will:
 * 1. Connect to Deepgram WebSocket
 * 2. Send a test audio chunk (20ms of silence or sample audio)
 * 3. Log ALL responses from Deepgram (transcripts, errors, close events)
 * 4. Show the exact JSON structure Deepgram returns
 */

// Try to load from asr-worker node_modules first, then fallback to root
const path = require('path');
const fs = require('fs');

// Check if we're in root or asr-worker directory
let deepgramPath = path.join(__dirname, 'services/asr-worker/node_modules/@deepgram/sdk');
if (!fs.existsSync(deepgramPath)) {
  deepgramPath = path.join(__dirname, 'node_modules/@deepgram/sdk');
}
if (!fs.existsSync(deepgramPath)) {
  console.error('❌ @deepgram/sdk not found. Please run:');
  console.error('   cd services/asr-worker && npm install');
  process.exit(1);
}

const { createClient, LiveTranscriptionEvents } = require(deepgramPath);

// Load .env.local from root
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  console.warn('⚠️ .env.local not found, using process.env');
}

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error('❌ DEEPGRAM_API_KEY not found in environment');
  console.error('Please set DEEPGRAM_API_KEY in .env.local');
  process.exit(1);
}

const client = createClient(DEEPGRAM_API_KEY);

// Configuration matching our production setup
const connectionConfig = {
  model: process.env.DEEPGRAM_MODEL || 'nova-2',
  language: process.env.DEEPGRAM_LANGUAGE || 'en-US',
  smart_format: process.env.DEEPGRAM_SMART_FORMAT !== 'false',
  interim_results: process.env.DEEPGRAM_INTERIM_RESULTS !== 'false',
  sample_rate: 8000,
  encoding: 'linear16',
  channels: 1,
};

console.log('🚀 Connecting to Deepgram...');
console.log('📋 Connection config:', JSON.stringify(connectionConfig, null, 2));

const connection = client.listen.live(connectionConfig);

// Track connection state
let isConnected = false;
let audioChunksSent = 0;
let transcriptsReceived = 0;

// ============================================
// EVENT HANDLERS - Log ALL responses
// ============================================

connection.on(LiveTranscriptionEvents.Open, () => {
  console.log('\n✅ Connection opened!');
  console.log('📡 WebSocket URL:', connection.url || 'N/A');
  isConnected = true;
  
  // Send initial KeepAlive
  try {
    const socket = connection.socket || connection._socket || connection.conn?.socket;
    if (socket && typeof socket.send === 'function') {
      socket.send(JSON.stringify({ type: 'KeepAlive' }));
      console.log('📡 Sent initial KeepAlive');
    }
  } catch (e) {
    console.warn('⚠️ Could not send KeepAlive:', e.message);
  }
  
  // Send test audio after 500ms
  setTimeout(() => {
    sendTestAudio();
  }, 500);
});

connection.on(LiveTranscriptionEvents.Transcript, (data) => {
  transcriptsReceived++;
  
  console.log('\n' + '='.repeat(80));
  console.log(`📨 TRANSCRIPT EVENT #${transcriptsReceived}`);
  console.log('='.repeat(80));
  
  // Log FULL response structure
  console.log('\n📋 Full Deepgram Response:');
  console.log(JSON.stringify(data, null, 2));
  
  // Extract key fields
  const transcript = data?.channel?.alternatives?.[0]?.transcript || '';
  const isFinal = data?.is_final || false;
  const confidence = data?.channel?.alternatives?.[0]?.confidence || 0;
  const words = data?.channel?.alternatives?.[0]?.words || [];
  
  console.log('\n📝 Extracted Fields:');
  console.log('  - Transcript:', transcript || '(EMPTY)');
  console.log('  - Is Final:', isFinal);
  console.log('  - Confidence:', confidence);
  console.log('  - Words Count:', words.length);
  console.log('  - Duration:', data?.duration, 'seconds');
  console.log('  - Start:', data?.start, 'seconds');
  
  if (words.length > 0) {
    console.log('\n🔤 Words:');
    words.slice(0, 5).forEach((word, idx) => {
      console.log(`  ${idx + 1}. "${word.word}" (${word.start}s - ${word.end}s, conf: ${word.confidence})`);
    });
  }
  
  // Check for empty transcript
  if (!transcript || transcript.trim().length === 0) {
    console.log('\n⚠️ WARNING: Empty transcript received!');
    console.log('  This could indicate:');
    console.log('    1. Audio is silence (no speech detected)');
    console.log('    2. Audio format is incorrect');
    console.log('    3. Audio chunks are too small/infrequent');
    console.log('    4. Sample rate mismatch');
  }
  
  console.log('='.repeat(80) + '\n');
});

connection.on(LiveTranscriptionEvents.Error, (error) => {
  console.log('\n' + '='.repeat(80));
  console.log('❌ ERROR EVENT');
  console.log('='.repeat(80));
  console.log('\n📋 Full Error Object:');
  console.log(JSON.stringify(error, null, 2));
  
  console.log('\n🔍 Error Details:');
  console.log('  - Code:', error.code);
  console.log('  - Message:', error.message);
  console.log('  - Type:', error.type);
  
  // Handle specific error codes
  switch (error.code) {
    case 1008:
      console.log('\n❌ ERROR 1008: Invalid audio format (DATA-0000)');
      console.log('  Check: encoding, sample_rate, channels match actual audio');
      break;
    case 1011:
      console.log('\n❌ ERROR 1011: Timeout (NET-0001)');
      console.log('  Deepgram did not receive audio data within timeout window');
      console.log('  Possible causes:');
      console.log('    1. Audio chunks too small/infrequent');
      console.log('    2. KeepAlive not being sent/recognized');
      console.log('    3. Network issues');
      break;
    case 4000:
      console.log('\n❌ ERROR 4000: Invalid API key');
      console.log('  Check: DEEPGRAM_API_KEY is correct');
      break;
    default:
      console.log('\n⚠️ Unknown error code:', error.code);
  }
  
  console.log('='.repeat(80) + '\n');
});

connection.on(LiveTranscriptionEvents.Close, (event) => {
  console.log('\n' + '='.repeat(80));
  console.log('🔒 CONNECTION CLOSED');
  console.log('='.repeat(80));
  console.log('\n📋 Close Event:');
  console.log(JSON.stringify(event, null, 2));
  
  console.log('\n🔍 Close Details:');
  console.log('  - Code:', event?.code);
  console.log('  - Reason:', event?.reason);
  console.log('  - Was Clean:', event?.wasClean);
  
  if (event?.code === 1011) {
    console.log('\n❌ Connection closed due to timeout (1011)');
    console.log('  This means Deepgram did not receive audio data within the timeout window');
  }
  
  console.log('\n📊 Test Summary:');
  console.log('  - Audio chunks sent:', audioChunksSent);
  console.log('  - Transcripts received:', transcriptsReceived);
  console.log('='.repeat(80) + '\n');
  
  process.exit(0);
});

connection.on(LiveTranscriptionEvents.Metadata, (data) => {
  console.log('\n📊 METADATA EVENT:');
  console.log(JSON.stringify(data, null, 2));
});

connection.on(LiveTranscriptionEvents.Warning, (data) => {
  console.log('\n⚠️ WARNING EVENT:');
  console.log(JSON.stringify(data, null, 2));
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate test audio: 20ms of PCM16 audio (320 bytes at 8kHz)
 * This matches what we're sending in production
 */
function generateTestAudio() {
  // Option 1: Silence (all zeros) - Deepgram won't transcribe this
  // const audio = Buffer.alloc(320, 0);
  
  // Option 2: Simple sine wave (440Hz tone) - Deepgram might detect as noise
  const sampleRate = 8000;
  const durationMs = 20;
  const samples = Math.floor((sampleRate * durationMs) / 1000); // 160 samples
  const audio = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample
  
  const frequency = 440; // A4 note
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const int16Sample = Math.floor(sample * 32767 * 0.1); // 10% volume to avoid clipping
    // Write as little-endian 16-bit signed integer
    audio.writeInt16LE(int16Sample, i * 2);
  }
  
  return audio;
}

/**
 * Send test audio chunks to Deepgram
 */
function sendTestAudio() {
  if (!isConnected) {
    console.log('⚠️ Not connected yet, waiting...');
    setTimeout(sendTestAudio, 100);
    return;
  }
  
  console.log('\n📤 Sending test audio chunks...');
  console.log('  - Chunk size: 320 bytes (20ms at 8kHz)');
  console.log('  - Will send 10 chunks (200ms total)');
  console.log('  - Then wait for responses...\n');
  
  // Send 10 chunks (200ms total) to match our production pattern
  let chunkCount = 0;
  const sendInterval = setInterval(() => {
    if (chunkCount >= 10) {
      clearInterval(sendInterval);
      console.log('\n✅ Finished sending 10 chunks. Waiting for Deepgram responses...');
      console.log('   (Responses may take a few seconds)');
      console.log('   (Press Ctrl+C to exit)\n');
      
      // Keep connection alive with KeepAlive
      const keepAliveInterval = setInterval(() => {
        try {
          const socket = connection.socket || connection._socket || connection.conn?.socket;
          if (socket && typeof socket.send === 'function') {
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
            console.log('📡 KeepAlive sent');
          }
        } catch (e) {
          // Ignore
        }
      }, 3000);
      
      // Auto-close after 30 seconds
      setTimeout(() => {
        clearInterval(keepAliveInterval);
        console.log('\n⏰ 30 seconds elapsed. Closing connection...');
        connection.finish();
      }, 30000);
      
      return;
    }
    
    const audio = generateTestAudio();
    try {
      connection.send(audio);
      audioChunksSent++;
      chunkCount++;
      console.log(`📤 Sent chunk ${chunkCount}/10 (${audio.length} bytes)`);
    } catch (error) {
      console.error('❌ Error sending audio:', error);
      clearInterval(sendInterval);
    }
  }, 20); // Send every 20ms (matching our production chunks)
}

// ============================================
// START TEST
// ============================================

console.log('\n🧪 Deepgram API Response Test');
console.log('='.repeat(80));
console.log('This script will:');
console.log('  1. Connect to Deepgram WebSocket');
console.log('  2. Send test audio chunks');
console.log('  3. Log ALL responses (transcripts, errors, close events)');
console.log('  4. Show exact JSON structure from Deepgram');
console.log('='.repeat(80) + '\n');

// Handle process exit
process.on('SIGINT', () => {
  console.log('\n\n👋 Closing connection...');
  try {
    connection.finish();
  } catch (e) {
    // Ignore
  }
  setTimeout(() => process.exit(0), 1000);
});

// Start connection
try {
  connection.start();
} catch (error) {
  console.error('❌ Failed to start connection:', error);
  process.exit(1);
}

