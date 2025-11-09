#!/usr/bin/env node

/**
 * Comprehensive Deepgram Integration Test
 * Tests the complete flow: Ingest → Redis → ASR Worker → Deepgram
 */

const WebSocket = require('ws');
const https = require('https');

const INGEST_URL = 'wss://rtaa-ingest.onrender.com/v1/ingest';
const INGEST_HEALTH = 'https://rtaa-ingest.onrender.com/health';
const ASR_HEALTH = 'https://rtaa-asr-worker.onrender.com/health';

console.log('🧪 Deepgram Integration Test Suite');
console.log('=' .repeat(80));
console.log('');

// Test 1: Health Checks
async function testHealthEndpoints() {
  console.log('📋 Test 1: Health Endpoints');
  console.log('-'.repeat(80));
  
  return new Promise((resolve) => {
    https.get(INGEST_HEALTH, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          console.log('✅ Ingest Service Health:', JSON.stringify(health, null, 2));
          
          // Test ASR Worker
          https.get(ASR_HEALTH, (res2) => {
            let data2 = '';
            res2.on('data', (chunk) => { data2 += chunk; });
            res2.on('end', () => {
              try {
                const health2 = JSON.parse(data2);
                console.log('✅ ASR Worker Health:', JSON.stringify(health2, null, 2));
                console.log('');
                resolve();
              } catch (e) {
                console.error('❌ Failed to parse ASR health:', e.message);
                console.log('Raw response:', data2);
                resolve();
              }
            });
          }).on('error', (e) => {
            console.error('❌ ASR Worker health check failed:', e.message);
            resolve();
          });
        } catch (e) {
          console.error('❌ Failed to parse Ingest health:', e.message);
          console.log('Raw response:', data);
          resolve();
        }
      });
    }).on('error', (e) => {
      console.error('❌ Ingest Service health check failed:', e.message);
      resolve();
    });
  });
}

// Test 2: WebSocket Connection Test
function testWebSocketConnection() {
  console.log('📋 Test 2: WebSocket Connection (Exotel Protocol)');
  console.log('-'.repeat(80));
  console.log(`Connecting to: ${INGEST_URL}`);
  console.log('');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(INGEST_URL);
    let startEventSent = false;
    let mediaEventSent = false;
    
    const streamSid = `test-stream-${Date.now()}`;
    const callSid = `test-call-${Date.now()}`;
    let sequenceNumber = 0;
    
    ws.on('open', () => {
      console.log('✅ WebSocket connection opened!');
      console.log('');
      
      // Send Exotel start event (with sequence_number as per Exotel types)
      const startEvent = {
        event: 'start',
        sequence_number: 0,
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
      
      console.log('📤 Sending start event...');
      console.log(JSON.stringify(startEvent, null, 2));
      ws.send(JSON.stringify(startEvent));
      startEventSent = true;
      console.log('✅ Start event sent');
      console.log('');
      
      // Wait a bit, then send multiple media events
      setTimeout(() => {
        console.log('📤 Sending test media events with PCM16 audio...');
        console.log('');
        
        // Send 5 chunks of 20ms each (100ms total)
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            // Generate 20ms of PCM16 audio (8000 Hz, 16-bit, mono)
            // 20ms = 0.02 seconds
            // Samples = 8000 * 0.02 = 160 samples
            // Bytes = 160 * 2 = 320 bytes
            const audioSamples = 160;
            const audioBuffer = Buffer.alloc(audioSamples * 2);
            
            // Generate a simple sine wave for testing (not silence)
            // Use different frequencies for each chunk to make it more interesting
            const frequency = 440 + (i * 50); // 440Hz, 490Hz, 540Hz, etc.
            for (let j = 0; j < audioSamples; j++) {
              const sample = Math.sin(2 * Math.PI * frequency * (j / 8000)) * 16384;
              const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample)));
              audioBuffer.writeInt16LE(int16, j * 2);
            }
            
            const base64Audio = audioBuffer.toString('base64');
            sequenceNumber++;
            
            const mediaEvent = {
              event: 'media',
              stream_sid: streamSid,
              sequence_number: sequenceNumber,
              media: {
                chunk: sequenceNumber,
                timestamp: Date.now().toString(),
                payload: base64Audio
              }
            };
            
            console.log(`📤 Sending media chunk ${sequenceNumber} (${audioBuffer.length} bytes, ${(audioBuffer.length / 2 / 8000 * 1000).toFixed(2)}ms)`);
            ws.send(JSON.stringify(mediaEvent));
            
            if (sequenceNumber === 5) {
              mediaEventSent = true;
              console.log('');
              console.log('✅ All 5 media chunks sent (100ms total audio)');
              console.log('');
              
              // Wait a bit, then send stop event
              setTimeout(() => {
                console.log('📤 Sending stop event...');
                const stopEvent = {
                  event: 'stop',
                  sequence_number: sequenceNumber + 1,
                  stream_sid: streamSid,
                  stop: {
                    call_sid: callSid,
                    account_sid: 'test-account',
                    reason: 'stopped'
                  }
                };
                ws.send(JSON.stringify(stopEvent));
                console.log('✅ Stop event sent');
                console.log('');
                
                // Close after a short delay
                setTimeout(() => {
                  console.log('🔌 Closing connection...');
                  ws.close();
                }, 1000);
              }, 500);
            }
          }, i * 50); // Send chunks 50ms apart
        }
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
      resolve();
    });
    
    ws.on('close', (code, reason) => {
      console.log('');
      console.log(`🔌 Connection closed (code: ${code}, reason: ${reason || 'none'})`);
      console.log('');
      resolve();
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('');
        console.log('⏱️  Test timeout - closing connection');
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        console.log('');
        console.error('❌ Connection timeout - unable to connect');
        resolve();
      }
    }, 15000);
  });
}

// Test 3: Verify ASR Worker Metrics After Test
async function testASRWorkerMetrics() {
  console.log('📋 Test 3: ASR Worker Metrics (After Audio Send)');
  console.log('-'.repeat(80));
  console.log('Waiting 10 seconds for audio to be processed through Redis and ASR Worker...');
  console.log('');
  
  // Check metrics multiple times
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log(`📊 Check ${i + 1}/3 (${(i + 1) * 3} seconds elapsed)...`);
  
  return new Promise((resolve) => {
    https.get(ASR_HEALTH, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          console.log('📊 ASR Worker Metrics:');
          console.log(JSON.stringify(health.deepgramMetrics, null, 2));
          console.log('');
          
          // Verify metrics
          if (health.deepgramMetrics) {
            const metrics = health.deepgramMetrics;
            console.log('✅ Metrics Check:');
            console.log(`  - Connections Created: ${metrics.connectionsCreated}`);
            console.log(`  - Audio Chunks Sent: ${metrics.audioChunksSent}`);
            console.log(`  - Transcripts Received: ${metrics.transcriptsReceived}`);
            console.log(`  - Errors: ${metrics.errors}`);
            console.log(`  - Average Chunk Size: ${metrics.averageChunkSizeMs}`);
            console.log('');
            
            if (metrics.audioChunksSent > 0) {
              console.log('✅ SUCCESS: Audio chunks were sent to Deepgram!');
            } else {
              console.log('⚠️  WARNING: No audio chunks sent yet (may need more time)');
            }
            
            if (metrics.transcriptsReceived > 0) {
              console.log('✅ SUCCESS: Transcripts received from Deepgram!');
            } else {
              console.log('⚠️  WARNING: No transcripts received yet (may need more time or audio was silence)');
            }
          }
          
          resolve();
        } catch (e) {
          console.error('❌ Failed to parse ASR health:', e.message);
          console.log('Raw response:', data);
          resolve();
        }
      });
    }).on('error', (e) => {
      console.error('❌ ASR Worker health check failed:', e.message);
      resolve();
    });
  });
  
  console.log('');
  }
}

// Run all tests
async function runAllTests() {
  await testHealthEndpoints();
  await testWebSocketConnection();
  await testASRWorkerMetrics();
  
  console.log('='.repeat(80));
  console.log('✅ Test Suite Complete');
  console.log('');
  console.log('Next Steps:');
  console.log('1. Check Render logs for Ingest Service to see audio validation');
  console.log('2. Check Render logs for ASR Worker to see Deepgram connection and chunk aggregation');
  console.log('3. Monitor Deepgram metrics in ASR Worker health endpoint');
  console.log('4. Test with real Exotel stream to verify end-to-end transcription');
  console.log('');
}

runAllTests().catch(console.error);

