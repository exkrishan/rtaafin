#!/usr/bin/env node

/**
 * Test WebSocket connection to Ingest service
 */

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'wss://rtaa-ingest.onrender.com/v1/ingest';
const JWT_TOKEN = process.env.JWT_TOKEN || '';

console.log('🔌 Testing WebSocket connection...');
console.log(`URL: ${WS_URL}`);
console.log(`Auth: ${JWT_TOKEN ? 'JWT token provided' : 'No auth (Exotel mode)'}`);
console.log('');

const ws = new WebSocket(WS_URL, {
  headers: JWT_TOKEN ? {
    'Authorization': `Bearer ${JWT_TOKEN}`
  } : {}
});

ws.on('open', () => {
  console.log('✅ WebSocket connection opened successfully!');
  console.log('');
  console.log('Sending test start event...');
  
  // Send a test start event (Exotel format)
  const startEvent = {
    event: 'start',
    stream_sid: 'test-stream-' + Date.now(),
    start: {
      call_sid: 'test-call-' + Date.now(),
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
  
  // Close after 2 seconds
  setTimeout(() => {
    console.log('');
    console.log('Closing connection...');
    ws.close();
  }, 2000);
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
  process.exit(0);
});

// Timeout after 10 seconds
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
}, 10000);

