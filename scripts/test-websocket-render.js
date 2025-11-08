#!/usr/bin/env node
/**
 * Test WebSocket connection to Render-deployed ingestion service
 * 
 * Usage:
 *   node scripts/test-websocket-render.js [jwt-token]
 * 
 * If no JWT token provided, tests Exotel protocol (requires SUPPORT_EXOTEL=true)
 */

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'wss://rtaa-ingest.onrender.com/v1/ingest';
const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;

console.log('🔌 Testing WebSocket Connection');
console.log('================================');
console.log(`URL: ${WS_URL}`);
console.log(`Auth: ${JWT_TOKEN ? 'JWT Token provided' : 'No token (testing Exotel protocol)'}`);
console.log('');

// Prepare headers
const headers = {};
if (JWT_TOKEN) {
  headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
}

// Create WebSocket connection
// Note: For testing, we allow self-signed certificates
// In production, use proper SSL certificates
const ws = new WebSocket(WS_URL, {
  headers,
  rejectUnauthorized: false, // Allow self-signed certs for testing
});

let startEventSent = false;
let testTimeout;

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('');
  
  // Send start event after a brief delay
  setTimeout(() => {
    console.log('📤 Sending start event...');
    const startEvent = {
      event: 'start',
      interaction_id: `test-${Date.now()}`,
      tenant_id: 'test-tenant',
      sample_rate: 24000,
      encoding: 'pcm16',
    };
    
    ws.send(JSON.stringify(startEvent));
    startEventSent = true;
    console.log('   Sent:', JSON.stringify(startEvent, null, 2));
    console.log('');
  }, 500);
  
  // Set timeout for test completion
  testTimeout = setTimeout(() => {
    console.log('⏱️  Test timeout (10 seconds)');
    console.log('✅ WebSocket connection test completed');
    ws.close();
    process.exit(0);
  }, 10000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:');
    console.log(JSON.stringify(message, null, 2));
    console.log('');
    
    if (message.event === 'started') {
      console.log('✅ Start event acknowledged!');
      console.log('✅ WebSocket is working correctly');
      console.log('');
      
      // Send a test audio frame (for Exotel protocol)
      if (!JWT_TOKEN) {
        console.log('📤 Sending test audio frame (Exotel format)...');
        const audioEvent = {
          event: 'media',
          media: {
            payload: Buffer.from('test audio data').toString('base64'),
            timestamp: Date.now().toString(),
            chunk: '1',
          },
        };
        ws.send(JSON.stringify(audioEvent));
        console.log('   Sent test audio frame');
        console.log('');
      }
    } else if (message.event === 'ack') {
      console.log('✅ Received ACK message');
    }
  } catch (error) {
    // Binary message (audio frame)
    console.log('📦 Received binary message (audio frame)');
    console.log(`   Size: ${data.length} bytes`);
    console.log('');
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:');
  console.error(`   ${error.message}`);
  console.error('');
  
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    console.error('💡 Tip: Check your JWT token or set SUPPORT_EXOTEL=true for Exotel protocol');
  } else if (error.message.includes('ECONNREFUSED')) {
    console.error('💡 Tip: Service may not be running. Check Render dashboard.');
  } else if (error.message.includes('ENOTFOUND')) {
    console.error('💡 Tip: Check the WebSocket URL is correct');
  }
  
  clearTimeout(testTimeout);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed');
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason.toString() || 'No reason provided'}`);
  console.log('');
  
  if (code === 1000) {
    console.log('✅ Normal closure');
  } else if (code === 1001) {
    console.log('ℹ️  Going away');
  } else if (code === 1006) {
    console.log('⚠️  Abnormal closure (connection lost)');
  } else {
    console.log(`⚠️  Closure code: ${code}`);
  }
  
  clearTimeout(testTimeout);
  process.exit(code === 1000 ? 0 : 1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupted by user');
  ws.close();
  clearTimeout(testTimeout);
  process.exit(0);
});


 * Test WebSocket connection to Render-deployed ingestion service
 * 
 * Usage:
 *   node scripts/test-websocket-render.js [jwt-token]
 * 
 * If no JWT token provided, tests Exotel protocol (requires SUPPORT_EXOTEL=true)
 */

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'wss://rtaa-ingest.onrender.com/v1/ingest';
const JWT_TOKEN = process.argv[2] || process.env.JWT_TOKEN;

console.log('🔌 Testing WebSocket Connection');
console.log('================================');
console.log(`URL: ${WS_URL}`);
console.log(`Auth: ${JWT_TOKEN ? 'JWT Token provided' : 'No token (testing Exotel protocol)'}`);
console.log('');

// Prepare headers
const headers = {};
if (JWT_TOKEN) {
  headers['Authorization'] = `Bearer ${JWT_TOKEN}`;
}

// Create WebSocket connection
// Note: For testing, we allow self-signed certificates
// In production, use proper SSL certificates
const ws = new WebSocket(WS_URL, {
  headers,
  rejectUnauthorized: false, // Allow self-signed certs for testing
});

let startEventSent = false;
let testTimeout;

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('');
  
  // Send start event after a brief delay
  setTimeout(() => {
    console.log('📤 Sending start event...');
    const startEvent = {
      event: 'start',
      interaction_id: `test-${Date.now()}`,
      tenant_id: 'test-tenant',
      sample_rate: 24000,
      encoding: 'pcm16',
    };
    
    ws.send(JSON.stringify(startEvent));
    startEventSent = true;
    console.log('   Sent:', JSON.stringify(startEvent, null, 2));
    console.log('');
  }, 500);
  
  // Set timeout for test completion
  testTimeout = setTimeout(() => {
    console.log('⏱️  Test timeout (10 seconds)');
    console.log('✅ WebSocket connection test completed');
    ws.close();
    process.exit(0);
  }, 10000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:');
    console.log(JSON.stringify(message, null, 2));
    console.log('');
    
    if (message.event === 'started') {
      console.log('✅ Start event acknowledged!');
      console.log('✅ WebSocket is working correctly');
      console.log('');
      
      // Send a test audio frame (for Exotel protocol)
      if (!JWT_TOKEN) {
        console.log('📤 Sending test audio frame (Exotel format)...');
        const audioEvent = {
          event: 'media',
          media: {
            payload: Buffer.from('test audio data').toString('base64'),
            timestamp: Date.now().toString(),
            chunk: '1',
          },
        };
        ws.send(JSON.stringify(audioEvent));
        console.log('   Sent test audio frame');
        console.log('');
      }
    } else if (message.event === 'ack') {
      console.log('✅ Received ACK message');
    }
  } catch (error) {
    // Binary message (audio frame)
    console.log('📦 Received binary message (audio frame)');
    console.log(`   Size: ${data.length} bytes`);
    console.log('');
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:');
  console.error(`   ${error.message}`);
  console.error('');
  
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    console.error('💡 Tip: Check your JWT token or set SUPPORT_EXOTEL=true for Exotel protocol');
  } else if (error.message.includes('ECONNREFUSED')) {
    console.error('💡 Tip: Service may not be running. Check Render dashboard.');
  } else if (error.message.includes('ENOTFOUND')) {
    console.error('💡 Tip: Check the WebSocket URL is correct');
  }
  
  clearTimeout(testTimeout);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed');
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason.toString() || 'No reason provided'}`);
  console.log('');
  
  if (code === 1000) {
    console.log('✅ Normal closure');
  } else if (code === 1001) {
    console.log('ℹ️  Going away');
  } else if (code === 1006) {
    console.log('⚠️  Abnormal closure (connection lost)');
  } else {
    console.log(`⚠️  Closure code: ${code}`);
  }
  
  clearTimeout(testTimeout);
  process.exit(code === 1000 ? 0 : 1);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Interrupted by user');
  ws.close();
  clearTimeout(testTimeout);
  process.exit(0);
});

