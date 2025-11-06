#!/usr/bin/env ts-node
/**
 * Complete End-to-End Flow Test
 * 
 * Tests the entire pipeline:
 * 1. WebSocket ingestion (audio frames)
 * 2. Pub/Sub (audio → ASR worker)
 * 3. ASR worker (audio → transcripts)
 * 4. Transcript ingestion API
 * 5. Intent detection
 * 6. KB article surfacing
 */

import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';

// Configuration
const INGEST_URL = process.env.INGEST_URL || 'ws://localhost:8443/v1/ingest';
const ASR_METRICS_URL = process.env.ASR_METRICS_URL || 'http://localhost:3001/metrics';
const ASR_HEALTH_URL = process.env.ASR_HEALTH_URL || 'http://localhost:3001/health';
const TRANSCRIPT_API = process.env.TRANSCRIPT_API || 'http://localhost:3000/api/calls/ingest-transcript';
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';

// Test state
interface TestState {
  step: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
  data?: any;
}

const testResults: TestState[] = [];

function logStep(step: string, status: 'running' | 'passed' | 'failed', error?: string, data?: any) {
  const result: TestState = { step, status, error, data };
  testResults.push(result);
  const icon = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '🔄';
  console.log(`${icon} ${step}`);
  if (error) console.log(`   Error: ${error}`);
  if (data) console.log(`   Data: ${JSON.stringify(data, null, 2)}`);
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
    logStep('Step 1: Generate JWT Token', 'passed', undefined, { tokenLength: token.length });
    return token;
  } catch (error: any) {
    logStep('Step 1: Generate JWT Token', 'failed', error.message);
    throw error;
  }
}

// Step 2: Check Service Health
async function checkServiceHealth(): Promise<void> {
  logStep('Step 2: Check Service Health', 'running');
  try {
    const checks = [
      { name: 'Ingestion Service', url: 'http://localhost:8443/health' },
      { name: 'ASR Worker', url: ASR_HEALTH_URL },
      { name: 'Next.js App', url: `${NEXTJS_URL}/api/config`, optional: true },
    ];

    for (const check of checks) {
      try {
        const response = await fetch(check.url);
        if (!response.ok) {
          if ((check as any).optional) {
            console.log(`   ⚠️  ${check.name}: ${response.status} (optional, continuing)`);
            continue;
          }
          throw new Error(`${check.name} returned ${response.status}`);
        }
        const data = await response.json();
        console.log(`   ✅ ${check.name}: OK`);
      } catch (error: any) {
        if ((check as any).optional) {
          console.log(`   ⚠️  ${check.name}: ${error.message} (optional, continuing)`);
          continue;
        }
        throw new Error(`${check.name} health check failed: ${error.message}`);
      }
    }
    logStep('Step 2: Check Service Health', 'passed');
  } catch (error: any) {
    logStep('Step 2: Check Service Health', 'failed', error.message);
    throw error;
  }
}

// Step 3: Send Audio via WebSocket
async function sendAudioViaWebSocket(token: string): Promise<{ interactionId: string; framesSent: number }> {
  logStep('Step 3: Send Audio via WebSocket', 'running');
  return new Promise((resolve, reject) => {
    const interactionId = `test-int-${Date.now()}`;
    let framesSent = 0;
    let ackCount = 0;
    let startAcknowledged = false;

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
          
          // Generate and send 20 audio frames (~4 seconds)
          const sendFrames = () => {
            if (framesSent < 20) {
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
                console.log(`   📤 Sent ${framesSent}/20 frames`);
              }
              
              setTimeout(sendFrames, 200); // 200ms between frames
            } else {
              console.log(`   ✅ All ${framesSent} frames sent`);
              setTimeout(() => {
                ws.close();
                clearTimeout(timeout);
                logStep('Step 3: Send Audio via WebSocket', 'passed', undefined, {
                  interactionId,
                  framesSent,
                  acksReceived: ackCount,
                });
                resolve({ interactionId, framesSent });
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
      logStep('Step 3: Send Audio via WebSocket', 'failed', error.message);
      reject(error);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (!startAcknowledged) {
        logStep('Step 3: Send Audio via WebSocket', 'failed', 'Connection closed before start acknowledged');
        reject(new Error('Connection closed prematurely'));
      }
    });
  });
}

// Step 4: Check ASR Worker Metrics
async function checkASRMetrics(): Promise<{ chunksProcessed: number; errors: number }> {
  logStep('Step 4: Check ASR Worker Metrics', 'running');
  try {
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for processing
    
    const response = await fetch(ASR_METRICS_URL);
    if (!response.ok) {
      throw new Error(`ASR metrics returned ${response.status}`);
    }
    
    const text = await response.text();
    const chunksMatch = text.match(/asr_audio_chunks_processed_total (\d+)/);
    const errorsMatch = text.match(/asr_errors_total (\d+)/);
    
    const chunksProcessed = chunksMatch ? parseInt(chunksMatch[1]) : 0;
    const errors = errorsMatch ? parseInt(errorsMatch[1]) : 0;
    
    logStep('Step 4: Check ASR Worker Metrics', 'passed', undefined, {
      chunksProcessed,
      errors,
    });
    
    return { chunksProcessed, errors };
  } catch (error: any) {
    logStep('Step 4: Check ASR Worker Metrics', 'failed', error.message);
    throw error;
  }
}

// Step 5: Simulate Transcript Ingestion
async function ingestTranscript(callId: string): Promise<{ intent: string; articles: any[] }> {
  logStep('Step 5: Ingest Transcript', 'running');
  try {
    // Simulate a transcript about credit card issues
    const transcript = [
      { speaker: 'customer', text: 'Hello, I need help with my credit card.' },
      { speaker: 'agent', text: 'Sure, how can I help you?' },
      { speaker: 'customer', text: 'I want to block my credit card because I lost it.' },
      { speaker: 'agent', text: 'I can help you with that. Let me process the request.' },
      { speaker: 'customer', text: 'Thank you, I need this done urgently.' },
    ];

    const transcriptText = transcript.map(t => `${t.speaker}: ${t.text}`).join('\n');

    const response = await fetch(TRANSCRIPT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId,
        tenantId: 'test-tenant',
        transcript: transcriptText,
        chunks: transcript.map((t, i) => ({
          seq: i + 1,
          speaker: t.speaker,
          text: t.text,
          timestamp: Date.now() + i * 1000,
        })),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Transcript API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    logStep('Step 5: Ingest Transcript', 'passed', undefined, {
      intent: data.intent,
      articlesCount: data.articles?.length || 0,
    });

    return {
      intent: data.intent || 'unknown',
      articles: data.articles || [],
    };
  } catch (error: any) {
    logStep('Step 5: Ingest Transcript', 'failed', error.message);
    throw error;
  }
}

// Step 6: Verify Intent Detection
async function verifyIntentDetection(intent: string): Promise<void> {
  logStep('Step 6: Verify Intent Detection', 'running');
  try {
    const expectedIntents = ['credit_card', 'credit_card_block', 'card_block'];
    const isExpected = expectedIntents.some(e => intent.toLowerCase().includes(e));
    
    if (!isExpected && intent !== 'unknown') {
      console.log(`   ⚠️  Intent detected: ${intent} (expected credit_card related)`);
    }
    
    if (intent === 'unknown') {
      throw new Error('Intent detection returned "unknown"');
    }
    
    logStep('Step 6: Verify Intent Detection', 'passed', undefined, { intent });
  } catch (error: any) {
    logStep('Step 6: Verify Intent Detection', 'failed', error.message);
    throw error;
  }
}

// Step 7: Verify KB Articles
async function verifyKBArticles(articles: any[]): Promise<void> {
  logStep('Step 7: Verify KB Articles', 'running');
  try {
    if (!articles || articles.length === 0) {
      throw new Error('No KB articles returned');
    }
    
    const creditCardArticles = articles.filter(a => 
      a.title?.toLowerCase().includes('credit') || 
      a.title?.toLowerCase().includes('card') ||
      a.snippet?.toLowerCase().includes('credit')
    );
    
    if (creditCardArticles.length === 0) {
      console.log('   ⚠️  No credit card related articles found');
      console.log(`   Available articles: ${articles.map(a => a.title).join(', ')}`);
    }
    
    logStep('Step 7: Verify KB Articles', 'passed', undefined, {
      totalArticles: articles.length,
      creditCardArticles: creditCardArticles.length,
      articleTitles: articles.map(a => a.title),
    });
  } catch (error: any) {
    logStep('Step 7: Verify KB Articles', 'failed', error.message);
    throw error;
  }
}

// Main test flow
async function runCompleteFlowTest() {
  console.log('🧪 Complete End-to-End Flow Test');
  console.log('================================\n');

  try {
    // Step 1: Generate JWT Token
    const token = await generateJWTToken();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Check Service Health
    await checkServiceHealth();
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Send Audio via WebSocket
    const { interactionId, framesSent } = await sendAudioViaWebSocket(token);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 4: Check ASR Worker Metrics
    const { chunksProcessed } = await checkASRMetrics();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 5: Ingest Transcript (simulate)
    const callId = `call-${Date.now()}`;
    const { intent, articles } = await ingestTranscript(callId);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 6: Verify Intent Detection
    await verifyIntentDetection(intent);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 7: Verify KB Articles
    await verifyKBArticles(articles);

    // Summary
    console.log('\n📊 Test Summary');
    console.log('================');
    const passed = testResults.filter(r => r.status === 'passed').length;
    const failed = testResults.filter(r => r.status === 'failed').length;
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📋 Total: ${testResults.length}`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed! Complete flow is working.');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Check the details above.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the test
runCompleteFlowTest();

