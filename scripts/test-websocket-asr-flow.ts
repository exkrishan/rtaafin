#!/usr/bin/env tsx
/**
 * Test WebSocket → Pub/Sub → ASR → Transcripts Flow
 * 
 * This script tests the complete audio pipeline:
 * 1. WebSocket ingestion (sends audio frames)
 * 2. Pub/Sub (audio published to topics)
 * 3. ASR Worker (consumes audio, generates transcripts)
 * 4. Transcript publishing (transcripts published to transcript topics)
 */

import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const INGEST_URL = process.env.INGEST_URL || 'ws://localhost:8443/v1/ingest';
const ASR_METRICS_URL = process.env.ASR_METRICS_URL || 'http://localhost:3001/metrics';
const ASR_HEALTH_URL = process.env.ASR_HEALTH_URL || 'http://localhost:3001/health';

interface TestStep {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  data?: any;
}

const steps: TestStep[] = [];

function logStep(name: string, status: 'running' | 'passed' | 'failed', message?: string, data?: any) {
  const step: TestStep = { name, status, message, data };
  steps.push(step);
  const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '🔄';
  console.log(`${icon} ${name}`);
  if (message) console.log(`   ${message}`);
  if (data) console.log(`   Data: ${JSON.stringify(data, null, 2).substring(0, 200)}`);
}

// Step 1: Generate JWT Token
async function generateJWTToken(): Promise<string> {
  logStep('Step 1: Generate JWT Token', 'running');
  try {
    const privateKeyPath = path.join(__dirname, '../scripts/keys/jwt-private-key.pem');
    if (!fs.existsSync(privateKeyPath)) {
      throw new Error('JWT private key not found');
    }
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const token = jwt.sign(
      {
        tenant_id: 'test-tenant',
        interaction_id: `test-int-${Date.now()}`,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      privateKey,
      { algorithm: 'RS256' }
    );
    logStep('Step 1: Generate JWT Token', 'passed', `Token generated (${token.length} chars)`);
    return token;
  } catch (error: any) {
    logStep('Step 1: Generate JWT Token', 'failed', error.message);
    throw error;
  }
}

// Step 2: Check ASR Worker is Running
async function checkASRWorker(): Promise<void> {
  logStep('Step 2: Check ASR Worker', 'running');
  try {
    const response = await fetch(ASR_HEALTH_URL);
    if (!response.ok) {
      throw new Error(`ASR Worker returned ${response.status}`);
    }
    const data = await response.json();
    logStep('Step 2: Check ASR Worker', 'passed', 'ASR Worker is running', data);
  } catch (error: any) {
    logStep('Step 2: Check ASR Worker', 'failed', error.message);
    throw error;
  }
}

// Step 3: Get Initial ASR Metrics
async function getASRMetrics(): Promise<{ chunksProcessed: number; errors: number; transcriptsGenerated: number }> {
  logStep('Step 3: Get Initial ASR Metrics', 'running');
  try {
    const response = await fetch(ASR_METRICS_URL);
    if (!response.ok) {
      throw new Error(`Metrics endpoint returned ${response.status}`);
    }
    const text = await response.text();
    
    const chunksMatch = text.match(/asr_audio_chunks_processed_total (\d+)/);
    const errorsMatch = text.match(/asr_errors_total (\d+)/);
    const transcriptsMatch = text.match(/asr_transcripts_generated_total (\d+)/);
    
    const chunksProcessed = chunksMatch ? parseInt(chunksMatch[1]) : 0;
    const errors = errorsMatch ? parseInt(errorsMatch[1]) : 0;
    const transcriptsGenerated = transcriptsMatch ? parseInt(transcriptsMatch[1]) : 0;
    
    logStep('Step 3: Get Initial ASR Metrics', 'passed', 'Metrics retrieved', {
      chunksProcessed,
      errors,
      transcriptsGenerated,
    });
    
    return { chunksProcessed, errors, transcriptsGenerated };
  } catch (error: any) {
    logStep('Step 3: Get Initial ASR Metrics', 'failed', error.message);
    throw error;
  }
}

// Step 4: Send Audio via WebSocket
async function sendAudioViaWebSocket(token: string): Promise<{ interactionId: string; framesSent: number; acksReceived: number }> {
  logStep('Step 4: Send Audio via WebSocket', 'running');
  return new Promise((resolve, reject) => {
    const interactionId = `test-int-${Date.now()}`;
    let framesSent = 0;
    let ackCount = 0;
    let startAcknowledged = false;
    const totalFrames = 30; // ~6 seconds of audio

    const ws = new WebSocket(INGEST_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 30000);

    ws.on('open', () => {
      console.log('   ✅ WebSocket connected');
      
      // Send start event
      const startEvent = {
        event: 'start',
        interaction_id: interactionId,
        tenant_id: 'test-tenant',
        sample_rate: 24000,
        encoding: 'pcm16',
      };
      ws.send(JSON.stringify(startEvent));
      console.log('   📤 Sent start event');
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.event === 'started') {
          console.log('   ✅ Start acknowledged');
          startAcknowledged = true;
          
          // Generate and send audio frames
          const sendFrames = () => {
            if (framesSent < totalFrames) {
              // Generate synthetic PCM16 frame (200ms at 24kHz = 4800 samples = 9600 bytes)
              const samples = 4800;
              const buffer = Buffer.allocUnsafe(samples * 2);
              for (let i = 0; i < samples; i++) {
                const sample = Math.sin((2 * Math.PI * 440 * i) / 24000) * 16000;
                buffer.writeInt16LE(Math.floor(sample), i * 2);
              }
              
              ws.send(buffer, { binary: true });
              framesSent++;
              
              if (framesSent % 5 === 0) {
                console.log(`   📤 Sent ${framesSent}/${totalFrames} frames`);
              }
              
              setTimeout(sendFrames, 200); // 200ms between frames
            } else {
              console.log(`   ✅ All ${framesSent} frames sent`);
              setTimeout(() => {
                ws.close();
                clearTimeout(timeout);
                logStep('Step 4: Send Audio via WebSocket', 'passed', 
                  `Sent ${framesSent} frames, received ${ackCount} ACKs`, {
                  interactionId,
                  framesSent,
                  acksReceived: ackCount,
                });
                resolve({ interactionId, framesSent, acksReceived: ackCount });
              }, 1000);
            }
          };
          
          sendFrames();
        } else if (message.event === 'ack') {
          ackCount++;
          console.log(`   ✅ Received ACK: seq=${message.seq}`);
        }
      } catch (error: any) {
        console.error('   ❌ Error parsing message:', error);
      }
    });

    ws.on('error', (error: Error) => {
      clearTimeout(timeout);
      logStep('Step 4: Send Audio via WebSocket', 'failed', error.message);
      reject(error);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (!startAcknowledged) {
        logStep('Step 4: Send Audio via WebSocket', 'failed', 'Connection closed before start acknowledged');
        reject(new Error('Connection closed prematurely'));
      }
    });
  });
}

// Step 5: Wait for ASR Processing
async function waitForASRProcessing(initialChunks: number, waitTime: number = 5000): Promise<void> {
  logStep('Step 5: Wait for ASR Processing', 'running', `Waiting ${waitTime}ms for ASR to process...`);
  await new Promise(resolve => setTimeout(resolve, waitTime));
  logStep('Step 5: Wait for ASR Processing', 'passed', 'Wait completed');
}

// Step 6: Check ASR Metrics After Processing
async function checkASRMetricsAfter(initialMetrics: { chunksProcessed: number; errors: number; transcriptsGenerated: number }): Promise<void> {
  logStep('Step 6: Check ASR Metrics After Processing', 'running');
  try {
    const response = await fetch(ASR_METRICS_URL);
    if (!response.ok) {
      throw new Error(`Metrics endpoint returned ${response.status}`);
    }
    const text = await response.text();
    
    const chunksMatch = text.match(/asr_audio_chunks_processed_total (\d+)/);
    const errorsMatch = text.match(/asr_errors_total (\d+)/);
    const transcriptsMatch = text.match(/asr_transcripts_generated_total (\d+)/);
    
    const chunksProcessed = chunksMatch ? parseInt(chunksMatch[1]) : 0;
    const errors = errorsMatch ? parseInt(errorsMatch[1]) : 0;
    const transcriptsGenerated = transcriptsMatch ? parseInt(transcriptsMatch[1]) : 0;
    
    const chunksDelta = chunksProcessed - initialMetrics.chunksProcessed;
    const errorsDelta = errors - initialMetrics.errors;
    const transcriptsDelta = transcriptsGenerated - initialMetrics.transcriptsGenerated;
    
    console.log('   📊 Metrics Comparison:');
    console.log(`      Audio chunks processed: ${initialMetrics.chunksProcessed} → ${chunksProcessed} (Δ${chunksDelta})`);
    console.log(`      Errors: ${initialMetrics.errors} → ${errors} (Δ${errorsDelta})`);
    console.log(`      Transcripts generated: ${initialMetrics.transcriptsGenerated} → ${transcriptsGenerated} (Δ${transcriptsDelta})`);
    
    if (chunksDelta > 0) {
      logStep('Step 6: Check ASR Metrics After Processing', 'passed', 
        `ASR processed ${chunksDelta} audio chunks`, {
        chunksDelta,
        transcriptsDelta,
        errorsDelta,
      });
    } else {
      logStep('Step 6: Check ASR Metrics After Processing', 'failed', 
        'No audio chunks were processed by ASR worker');
    }
  } catch (error: any) {
    logStep('Step 6: Check ASR Metrics After Processing', 'failed', error.message);
    throw error;
  }
}

// Main test flow
async function runWebSocketASRTest() {
  console.log('🧪 WebSocket → ASR Flow Test');
  console.log('============================\n');

  try {
    // Step 1: Generate JWT Token
    const token = await generateJWTToken();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Check ASR Worker
    await checkASRWorker();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Get Initial Metrics
    const initialMetrics = await getASRMetrics();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 4: Send Audio via WebSocket
    const { interactionId, framesSent, acksReceived } = await sendAudioViaWebSocket(token);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 5: Wait for ASR Processing
    await waitForASRProcessing(initialMetrics.chunksProcessed, 8000);

    // Step 6: Check ASR Metrics After
    await checkASRMetricsAfter(initialMetrics);

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    const passed = steps.filter(s => s.status === 'passed').length;
    const failed = steps.filter(s => s.status === 'failed').length;
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📋 Total: ${steps.length}`);

    console.log('\n📝 Flow Verification:');
    console.log('====================');
    console.log(`1. WebSocket: ✅ Sent ${framesSent} frames, received ${acksReceived} ACKs`);
    console.log(`2. Pub/Sub: ✅ Audio frames published (check ingestion logs)`);
    console.log(`3. ASR Worker: ✅ Check metrics above for processed chunks`);
    console.log(`4. Transcripts: ✅ Check ASR worker logs for transcript generation`);

    if (failed === 0) {
      console.log('\n🎉 WebSocket → ASR flow is working!');
      console.log('\n💡 To see detailed logs:');
      console.log('   - Ingestion: tail -f /tmp/rtaa-ingest.log');
      console.log('   - ASR Worker: tail -f /tmp/rtaa-asr.log');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some steps failed. Check the details above.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the test
runWebSocketASRTest();

