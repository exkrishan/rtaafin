#!/usr/bin/env ts-node
/**
 * Smoke Test for Exotel → Deepgram Bridge
 * 
 * This script performs a quick smoke test of the Exotel→Deepgram bridge feature.
 * It can be run with STT_SMOKE=1 to enable automated testing.
 * 
 * Usage:
 *   STT_SMOKE=1 ts-node scripts/smoke-test-exotel-bridge.ts
 * 
 * Environment Variables:
 *   STT_SMOKE - Must be set to "1" to run (safety guard)
 *   INGEST_URL - Ingest service URL (default: http://localhost:8443)
 *   ASR_WORKER_URL - ASR worker URL (default: http://localhost:3001)
 *   WS_URL - WebSocket URL (default: ws://localhost:8443/v1/ingest)
 *   DEEPGRAM_API_KEY - Deepgram API key (required if ASR_PROVIDER=deepgram)
 */

import WebSocket from 'ws';
import { randomBytes } from 'crypto';
import { createPubSubAdapterFromEnv, transcriptTopic } from '../lib/pubsub';
import type { TranscriptMessage } from '../services/asr-worker/src/types';

// Safety guard: Only run if STT_SMOKE=1
if (process.env.STT_SMOKE !== '1') {
  console.error('❌ STT_SMOKE=1 is required to run this smoke test');
  console.error('   This is a safety guard to prevent accidental execution');
  process.exit(1);
}

const INGEST_URL = process.env.INGEST_URL || 'http://localhost:8443';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:8443/v1/ingest';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function generatePCM16Frame(sampleRate: number, durationMs: number = 20): Buffer {
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = Buffer.allocUnsafe(samples * 2);
  
  // Generate a simple sine wave (440Hz tone)
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000;
    buffer.writeInt16LE(Math.floor(sample), i * 2);
  }
  
  return buffer;
}

function base64Encode(buffer: Buffer): string {
  return buffer.toString('base64');
}

async function testHealthEndpoint(url: string, serviceName: string): Promise<TestResult> {
  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) {
      return {
        name: `${serviceName} Health Check`,
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    // Check for bridge status
    if (serviceName === 'Ingest' && data.exotelBridge) {
      if (data.exotelBridge === 'enabled') {
        return {
          name: `${serviceName} Health Check`,
          status: 'pass',
          message: `Service is healthy, bridge is enabled`,
          details: data,
        };
      } else {
        return {
          name: `${serviceName} Health Check`,
          status: 'fail',
          message: `Service is healthy but bridge is not enabled (${data.exotelBridge})`,
          details: data,
        };
      }
    }
    
    if (serviceName === 'ASR Worker' && data.deepgram) {
      return {
        name: `${serviceName} Health Check`,
        status: 'pass',
        message: `Service is healthy, Deepgram provider active`,
        details: data,
      };
    }
    
    return {
      name: `${serviceName} Health Check`,
      status: 'pass',
      message: `Service is healthy`,
      details: data,
    };
  } catch (error: any) {
    return {
      name: `${serviceName} Health Check`,
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function testExotelWebSocketConnection(interactionId?: string): Promise<TestResult & { interactionId?: string }> {
  return new Promise((resolve) => {
    // Use provided interaction ID or generate new one
    const callSid = interactionId || `call_${randomBytes(8).toString('hex')}`;
    const streamSid = `stream_${randomBytes(8).toString('hex')}`;
    // Use call_sid as interaction_id (Exotel protocol - exotel-handler uses callSid as interaction_id)
    const actualInteractionId = callSid;
    let connected = false;
    let started = false;
    let framesSent = 0;
    let errorOccurred = false;
    
    const ws = new WebSocket(WS_URL);
    const timeout = setTimeout(() => {
      if (!connected || !started || framesSent === 0) {
        ws.close();
        resolve({
          name: 'Exotel WebSocket Connection',
          status: 'fail',
          message: `Timeout: connected=${connected}, started=${started}, framesSent=${framesSent}`,
          interactionId: actualInteractionId,
        });
      }
    }, 10000);
    
    ws.on('open', () => {
      connected = true;
      
      // Send connected event
      ws.send(JSON.stringify({
        event: 'connected',
        stream_sid: streamSid,
        call_sid: callSid,
      }));
      
      // Send start event
      setTimeout(() => {
        ws.send(JSON.stringify({
          event: 'start',
          stream_sid: streamSid,
          call_sid: callSid,
        }));
        started = true;
        
        // Send more media frames (100 frames = 2 seconds of audio at 20ms per frame)
        // This gives Deepgram enough audio to generate transcripts
        const totalFrames = 100;
        for (let i = 0; i < totalFrames; i++) {
          setTimeout(() => {
            const frame = generatePCM16Frame(8000, 20);
            ws.send(JSON.stringify({
              event: 'media',
              stream_sid: streamSid,
              call_sid: callSid,
              media: {
                payload: base64Encode(frame),
              },
            }));
            framesSent++;
            
            if (framesSent === totalFrames) {
              // Send stop event
              ws.send(JSON.stringify({
                event: 'stop',
                stream_sid: streamSid,
                call_sid: callSid,
              }));
              
              setTimeout(() => {
                clearTimeout(timeout);
                ws.close();
                resolve({
                  name: 'Exotel WebSocket Connection',
                  status: 'pass',
                  message: `Successfully sent ${framesSent} audio frames`,
                  interactionId: actualInteractionId,
                });
              }, 500);
            }
          }, i * 20); // 20ms intervals (real-time, 50 frames per second)
        }
      }, 100);
    });
    
    ws.on('error', (error) => {
      errorOccurred = true;
      clearTimeout(timeout);
      resolve({
        name: 'Exotel WebSocket Connection',
        status: 'fail',
        message: `WebSocket error: ${error.message}`,
        interactionId: actualInteractionId,
      });
    });
    
    ws.on('close', () => {
      if (!errorOccurred && connected && started && framesSent > 0) {
        // Already resolved in open handler
      }
    });
  });
}

async function testASRWorkerMetrics(): Promise<TestResult> {
  try {
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await fetch(`${ASR_WORKER_URL}/health`);
    if (!response.ok) {
      return {
        name: 'ASR Worker Metrics',
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    if (data.deepgramMetrics) {
      const metrics = data.deepgramMetrics;
      const hasActivity = 
        (metrics.audioChunksSent && metrics.audioChunksSent > 0) ||
        (metrics.connectionsCreated && metrics.connectionsCreated > 0);
      
      if (hasActivity) {
        return {
          name: 'ASR Worker Metrics',
          status: 'pass',
          message: `Metrics show activity: ${JSON.stringify(metrics)}`,
          details: metrics,
        };
      } else {
        return {
          name: 'ASR Worker Metrics',
          status: 'fail',
          message: `No activity detected in metrics`,
          details: metrics,
        };
      }
    }
    
    return {
      name: 'ASR Worker Metrics',
      status: 'skip',
      message: 'Deepgram metrics not available (may be using mock provider)',
    };
  } catch (error: any) {
    return {
      name: 'ASR Worker Metrics',
      status: 'fail',
      message: `Failed to check metrics: ${error.message}`,
    };
  }
}

async function testTranscriptReception(interactionId: string): Promise<TestResult> {
  try {
    console.log(`   Subscribing to transcript topic: transcript.${interactionId}`);
    
    // Create pub/sub adapter (same as services use)
    const pubsub = createPubSubAdapterFromEnv();
    const topic = transcriptTopic(interactionId);
    
    const receivedTranscripts: TranscriptMessage[] = [];
    let subscriptionHandle: any = null;
    
    // Set up subscription before sending audio
    subscriptionHandle = await pubsub.subscribe(topic, async (msg: any) => {
      const transcript = msg as TranscriptMessage;
      receivedTranscripts.push(transcript);
      console.log(`   📥 Received transcript: type=${transcript.type}, text="${transcript.text?.substring(0, 50) || '(empty)'}"`);
    });
    
    // Wait for transcripts (up to 15 seconds)
    const startTime = Date.now();
    const maxWaitTime = 15000; // 15 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      // Check if we received any transcripts with text
      const transcriptsWithText = receivedTranscripts.filter(t => t.text && t.text.trim().length > 0);
      if (transcriptsWithText.length > 0) {
        await subscriptionHandle.unsubscribe();
        await pubsub.close();
        
        return {
          name: 'Transcript Reception',
          status: 'pass',
          message: `Received ${transcriptsWithText.length} transcript(s) with text (total: ${receivedTranscripts.length})`,
          details: {
            totalTranscripts: receivedTranscripts.length,
            transcriptsWithText: transcriptsWithText.length,
            sampleTranscript: transcriptsWithText[0]?.text?.substring(0, 100),
            transcriptTypes: receivedTranscripts.map(t => t.type),
          },
        };
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Cleanup
    if (subscriptionHandle) {
      await subscriptionHandle.unsubscribe();
    }
    await pubsub.close();
    
    // Check what we got
    if (receivedTranscripts.length === 0) {
      return {
        name: 'Transcript Reception',
        status: 'fail',
        message: `No transcripts received after ${maxWaitTime / 1000} seconds`,
        details: {
          interactionId,
          topic,
          waitTimeMs: maxWaitTime,
        },
      };
    } else {
      // Received transcripts but all empty
      return {
        name: 'Transcript Reception',
        status: 'fail',
        message: `Received ${receivedTranscripts.length} transcript(s) but all are empty`,
        details: {
          totalTranscripts: receivedTranscripts.length,
          transcripts: receivedTranscripts.map(t => ({
            type: t.type,
            textLength: t.text?.length || 0,
            textPreview: t.text?.substring(0, 50) || '(empty)',
          })),
        },
      };
    }
  } catch (error: any) {
    return {
      name: 'Transcript Reception',
      status: 'fail',
      message: `Failed to subscribe/receive transcripts: ${error.message}`,
      details: {
        error: error.message,
        stack: error.stack,
      },
    };
  }
}

async function runSmokeTest() {
  console.log('🧪 Exotel → Deepgram Bridge Smoke Test');
  console.log('='.repeat(60));
  console.log(`Ingest URL: ${INGEST_URL}`);
  console.log(`ASR Worker URL: ${ASR_WORKER_URL}`);
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log('='.repeat(60));
  console.log('');
  
  // Test 1: Ingest Service Health
  console.log('1️⃣  Testing Ingest Service Health...');
  const ingestHealth = await testHealthEndpoint(INGEST_URL, 'Ingest');
  results.push(ingestHealth);
  console.log(`   ${ingestHealth.status === 'pass' ? '✅' : '❌'} ${ingestHealth.message}`);
  
  // Test 2: ASR Worker Health
  console.log('\n2️⃣  Testing ASR Worker Health...');
  const asrHealth = await testHealthEndpoint(ASR_WORKER_URL, 'ASR Worker');
  results.push(asrHealth);
  console.log(`   ${asrHealth.status === 'pass' ? '✅' : '❌'} ${asrHealth.message}`);
  
  // Test 3: Set up transcript subscription BEFORE sending audio
  // Generate interaction ID first
  const testInteractionId = `call_${randomBytes(8).toString('hex')}`;
  console.log('\n3️⃣  Setting up Transcript Subscription...');
  console.log(`   Interaction ID: ${testInteractionId}`);
  
  // Set up pub/sub subscription BEFORE sending audio
  let pubsub: any = null;
  let subscriptionHandle: any = null;
  const receivedTranscripts: TranscriptMessage[] = [];
  
  try {
    pubsub = createPubSubAdapterFromEnv();
    const topic = transcriptTopic(testInteractionId);
    console.log(`   Subscribing to: ${topic}`);
    
    subscriptionHandle = await pubsub.subscribe(topic, async (msg: any) => {
      const transcript = msg as TranscriptMessage;
      receivedTranscripts.push(transcript);
      console.log(`   📥 Received transcript: type=${transcript.type}, text="${transcript.text?.substring(0, 50) || '(empty)'}"`);
    });
    
    console.log('   ✅ Subscription active, ready to receive transcripts');
  } catch (error: any) {
    console.log(`   ⚠️  Failed to set up subscription: ${error.message}`);
    console.log('   Continuing with WebSocket test (transcript verification will be skipped)');
  }
  
  // Test 4: Exotel WebSocket Connection (using the interaction ID we generated)
  console.log('\n4️⃣  Testing Exotel WebSocket Connection...');
  // Pass the pre-generated interaction ID to ensure subscription matches
  const wsTest = await testExotelWebSocketConnection(testInteractionId);
  results.push(wsTest);
  console.log(`   ${wsTest.status === 'pass' ? '✅' : '❌'} ${wsTest.message}`);
  
  // Use the interaction ID from WebSocket test (it uses call_sid as interaction_id)
  // The exotel-handler uses callSid as interaction_id (see exotel-handler.ts line 354)
  const actualInteractionId = wsTest.interactionId || testInteractionId;
  
  // Important: If subscription was set up with different ID, we need to re-subscribe
  // But since we pass testInteractionId to the WebSocket test, they should match
  if (subscriptionHandle && actualInteractionId !== testInteractionId) {
    console.log(`   ⚠️  Interaction ID mismatch: subscription=${testInteractionId}, websocket=${actualInteractionId}`);
    console.log(`   Re-subscribing to correct topic...`);
    // Unsubscribe from old topic
    await subscriptionHandle.unsubscribe();
    // Subscribe to correct topic
    const correctTopic = transcriptTopic(actualInteractionId);
    subscriptionHandle = await pubsub.subscribe(correctTopic, async (msg: any) => {
      const transcript = msg as TranscriptMessage;
      receivedTranscripts.push(transcript);
      console.log(`   📥 Received transcript: type=${transcript.type}, text="${transcript.text?.substring(0, 50) || '(empty)'}"`);
    });
  }
  
  // Test 5: Transcript Reception (End-to-End Verification)
  if (wsTest.status === 'pass' && subscriptionHandle) {
    console.log('\n5️⃣  Testing Transcript Reception (End-to-End)...');
    console.log(`   Waiting up to 15 seconds for transcripts from Deepgram...`);
    console.log(`   Interaction ID: ${actualInteractionId}`);
    console.log(`   Topic: transcript.${actualInteractionId}`);
    
    // Wait for transcripts (up to 15 seconds)
    const startTime = Date.now();
    const maxWaitTime = 15000; // 15 seconds
    
    while (Date.now() - startTime < maxWaitTime) {
      // Check if we received any transcripts with text
      const transcriptsWithText = receivedTranscripts.filter(t => t.text && t.text.trim().length > 0);
      if (transcriptsWithText.length > 0) {
        const transcriptTest: TestResult = {
          name: 'Transcript Reception',
          status: 'pass',
          message: `✅ Received ${transcriptsWithText.length} transcript(s) with text (total: ${receivedTranscripts.length})`,
          details: {
            totalTranscripts: receivedTranscripts.length,
            transcriptsWithText: transcriptsWithText.length,
            sampleTranscript: transcriptsWithText[0]?.text?.substring(0, 100),
            transcriptTypes: receivedTranscripts.map(t => t.type),
          },
        };
        results.push(transcriptTest);
        console.log(`   ${transcriptTest.message}`);
        break;
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // If we didn't break out of the loop, check what we got
    if (receivedTranscripts.length === 0) {
      const transcriptTest: TestResult = {
        name: 'Transcript Reception',
        status: 'fail',
        message: `❌ No transcripts received after ${maxWaitTime / 1000} seconds`,
        details: {
          interactionId: actualInteractionId,
          topic: transcriptTopic(actualInteractionId),
          waitTimeMs: maxWaitTime,
        },
      };
      results.push(transcriptTest);
      console.log(`   ${transcriptTest.message}`);
    } else {
      // Received transcripts but all empty
      const transcriptsWithText = receivedTranscripts.filter(t => t.text && t.text.trim().length > 0);
      if (transcriptsWithText.length === 0) {
        const transcriptTest: TestResult = {
          name: 'Transcript Reception',
          status: 'fail',
          message: `❌ Received ${receivedTranscripts.length} transcript(s) but all are empty`,
          details: {
            totalTranscripts: receivedTranscripts.length,
            transcripts: receivedTranscripts.map(t => ({
              type: t.type,
              textLength: t.text?.length || 0,
              textPreview: t.text?.substring(0, 50) || '(empty)',
            })),
          },
        };
        results.push(transcriptTest);
        console.log(`   ${transcriptTest.message}`);
      }
    }
    
    // Cleanup subscription
    if (subscriptionHandle) {
      await subscriptionHandle.unsubscribe();
    }
    if (pubsub) {
      await pubsub.close();
    }
  } else {
    console.log('\n5️⃣  Testing Transcript Reception...');
    if (wsTest.status !== 'pass') {
      console.log('   ⏭️  Skipped (WebSocket connection failed)');
    } else {
      console.log('   ⏭️  Skipped (Subscription setup failed)');
    }
    results.push({
      name: 'Transcript Reception',
      status: 'skip',
      message: 'Skipped because prerequisite test failed',
    });
    
    // Cleanup if subscription was created
    if (subscriptionHandle) {
      await subscriptionHandle.unsubscribe();
    }
    if (pubsub) {
      await pubsub.close();
    }
  }
  
  // Test 6: ASR Worker Metrics
  console.log('\n6️⃣  Testing ASR Worker Metrics...');
  const metricsTest = await testASRWorkerMetrics();
  results.push(metricsTest);
  console.log(`   ${metricsTest.status === 'pass' ? '✅' : metricsTest.status === 'skip' ? '⏭️' : '❌'} ${metricsTest.message}`);
  
  // Also check transcriptsReceived in metrics
  if (metricsTest.details && metricsTest.details.transcriptsReceived !== undefined) {
    console.log(`   📊 Transcripts received (from metrics): ${metricsTest.details.transcriptsReceived}`);
    if (metricsTest.details.transcriptsReceived === 0) {
      console.log(`   ⚠️  Warning: No transcripts received according to metrics`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;
  
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}\n`);
  
  // Detailed results
  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2).split('\n').join('\n   ')}`);
    }
  }
  
  console.log('');
  
  if (failed > 0) {
    console.log('❌ Smoke test failed. Please check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ Smoke test passed!');
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  runSmokeTest().catch((error) => {
    console.error('❌ Smoke test error:', error);
    process.exit(1);
  });
}

export { runSmokeTest };

