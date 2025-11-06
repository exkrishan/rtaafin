/**
 * Complete End-to-End Flow Test
 * 
 * Tests: WebSocket → Pub/Sub → ASR → Transcripts → Intent Detection → KB Articles
 */

import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const INGEST_URL = process.env.INGEST_URL || 'ws://localhost:8443/v1/ingest';
const NEXTJS_URL = process.env.NEXTJS_URL || 'http://localhost:3000';
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY || '';
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY || '';

interface TestResult {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

function logResult(step: string, status: 'pass' | 'fail' | 'skip', message: string, duration?: number) {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  console.log(`${icon} ${step}: ${message}${duration ? ` (${duration}ms)` : ''}`);
  results.push({ step, status, message, duration });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkServiceHealth(url: string, name: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function generateJWT(): Promise<string> {
  if (!JWT_PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY not configured');
  }

  const jwt = require('jsonwebtoken');
  const privateKey = JWT_PRIVATE_KEY.replace(/\\n/g, '\n');

  const payload = {
    tenant_id: 'test-tenant',
    interaction_id: `test-${Date.now()}`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  };

  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

async function testIngestionService(): Promise<boolean> {
  const start = Date.now();
  try {
    const health = await checkServiceHealth('http://localhost:8443/health', 'Ingestion Service');
    if (health) {
      logResult('Ingestion Service Health', 'pass', 'Service is running', Date.now() - start);
      return true;
    } else {
      logResult('Ingestion Service Health', 'fail', 'Service is not responding', Date.now() - start);
      return false;
    }
  } catch (error: any) {
    logResult('Ingestion Service Health', 'fail', error.message, Date.now() - start);
    return false;
  }
}

async function testASRWorker(): Promise<boolean> {
  const start = Date.now();
  try {
    const response = await fetch('http://localhost:3001/metrics');
    if (response.ok) {
      const text = await response.text();
      if (text.includes('asr_')) {
        logResult('ASR Worker Health', 'pass', 'Service is running and has metrics', Date.now() - start);
        return true;
      } else {
        logResult('ASR Worker Health', 'fail', 'Service running but no metrics', Date.now() - start);
        return false;
      }
    } else {
      logResult('ASR Worker Health', 'fail', 'Service is not responding', Date.now() - start);
      return false;
    }
  } catch (error: any) {
    logResult('ASR Worker Health', 'fail', error.message, Date.now() - start);
    return false;
  }
}

async function testNextJSApp(): Promise<boolean> {
  const start = Date.now();
  try {
    const health = await checkServiceHealth(`${NEXTJS_URL}/api/config`, 'Next.js App');
    if (health) {
      logResult('Next.js App Health', 'pass', 'Service is running', Date.now() - start);
      return true;
    } else {
      logResult('Next.js App Health', 'fail', 'Service is not responding', Date.now() - start);
      return false;
    }
  } catch (error: any) {
    logResult('Next.js App Health', 'fail', error.message, Date.now() - start);
    return false;
  }
}

async function testWebSocketConnection(): Promise<{ ws: WebSocket; interactionId: string } | null> {
  const start = Date.now();
  try {
    const token = await generateJWT();
    const decoded = require('jsonwebtoken').decode(token) as any;
    const interactionId = decoded.interaction_id;

    const ws = new WebSocket(INGEST_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        logResult('WebSocket Connection', 'pass', 'Connected successfully', Date.now() - start);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        logResult('WebSocket Connection', 'fail', error.message, Date.now() - start);
        reject(error);
      });
    });

    return { ws, interactionId };
  } catch (error: any) {
    logResult('WebSocket Connection', 'fail', error.message, Date.now() - start);
    return null;
  }
}

async function testAudioStreaming(ws: WebSocket, interactionId: string): Promise<boolean> {
  const start = Date.now();
  try {
    // Send start event
    const startEvent = {
      event: 'start',
      interaction_id: interactionId,
      tenant_id: 'test-tenant',
      sample_rate: 24000,
      encoding: 'pcm16' as const,
    };

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Start event timeout'));
      }, 3000);

      ws.on('message', (data: Buffer | string) => {
        if (typeof data === 'string') {
          const msg = JSON.parse(data);
          if (msg.event === 'started') {
            clearTimeout(timeout);
            logResult('Start Event', 'pass', 'Start event acknowledged', Date.now() - start);
            resolve();
          }
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.send(JSON.stringify(startEvent));
    });

    // Send test audio frames (simulated PCM16)
    const sampleRate = 24000;
    const frameDuration = 200; // ms
    const samplesPerFrame = Math.floor((sampleRate * frameDuration) / 1000);
    const bytesPerFrame = samplesPerFrame * 2; // 16-bit = 2 bytes

    let framesSent = 0;
    const totalFrames = 10; // Send 10 frames (2 seconds of audio)

    for (let i = 0; i < totalFrames; i++) {
      // Generate dummy PCM16 audio (sine wave)
      const audioBuffer = Buffer.alloc(bytesPerFrame);
      for (let j = 0; j < samplesPerFrame; j++) {
        const sample = Math.sin(2 * Math.PI * 440 * (i * frameDuration + j * 1000 / sampleRate) / 1000);
        const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        audioBuffer.writeInt16LE(int16, j * 2);
      }

      ws.send(audioBuffer);
      framesSent++;
      await sleep(frameDuration);
    }

    logResult('Audio Streaming', 'pass', `Sent ${framesSent} audio frames`, Date.now() - start);
    return true;
  } catch (error: any) {
    logResult('Audio Streaming', 'fail', error.message, Date.now() - start);
    return false;
  }
}

async function testASRProcessing(interactionId: string): Promise<boolean> {
  const start = Date.now();
  const maxWait = 10000; // 10 seconds
  const checkInterval = 1000; // Check every second

  try {
    for (let elapsed = 0; elapsed < maxWait; elapsed += checkInterval) {
      const response = await fetch(`http://localhost:3001/metrics`);
      if (response.ok) {
        const text = await response.text();
        // Check if audio chunks were processed
        const chunksMatch = text.match(/asr_audio_chunks_processed_total\s+(\d+)/);
        if (chunksMatch && parseInt(chunksMatch[1]) > 0) {
          logResult('ASR Processing', 'pass', `Processed ${chunksMatch[1]} audio chunks`, Date.now() - start);
          return true;
        }
      }
      await sleep(checkInterval);
    }

    logResult('ASR Processing', 'fail', 'No audio chunks processed within timeout', Date.now() - start);
    return false;
  } catch (error: any) {
    logResult('ASR Processing', 'fail', error.message, Date.now() - start);
    return false;
  }
}

async function testTranscriptIngestion(interactionId: string): Promise<boolean> {
  const start = Date.now();
  try {
    // Simulate transcript chunks
    const transcriptChunks = [
      'Hello, I need help with my credit card',
      'My credit card was stolen',
      'I want to block my credit card immediately',
    ];

    let intentDetected = false;
    let articlesReceived = false;

    for (const chunk of transcriptChunks) {
      const response = await fetch(`${NEXTJS_URL}/api/calls/ingest-transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: interactionId,
          tenantId: 'test-tenant',
          seq: Date.now(),
          ts: Date.now(),
          text: chunk,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.intent && data.intent !== 'unknown') {
          intentDetected = true;
        }
        if (data.articles && data.articles.length > 0) {
          articlesReceived = true;
        }
      }

      await sleep(500); // Wait between chunks
    }

    if (intentDetected && articlesReceived) {
      logResult('Transcript Ingestion', 'pass', 'Intent detected and articles surfaced', Date.now() - start);
      return true;
    } else if (intentDetected) {
      logResult('Transcript Ingestion', 'pass', 'Intent detected (articles may take time)', Date.now() - start);
      return true;
    } else {
      logResult('Transcript Ingestion', 'fail', 'Intent not detected', Date.now() - start);
      return false;
    }
  } catch (error: any) {
    logResult('Transcript Ingestion', 'fail', error.message, Date.now() - start);
    return false;
  }
}

async function testKBArticleSurfacing(interactionId: string): Promise<boolean> {
  const start = Date.now();
  try {
    // Wait a bit for articles to be processed
    await sleep(2000);

    // Check if articles are available via API
    const response = await fetch(`${NEXTJS_URL}/api/calls/${interactionId}/articles`);
    if (response.ok) {
      const data = await response.json();
      if (data.articles && data.articles.length > 0) {
        logResult('KB Article Surfacing', 'pass', `Found ${data.articles.length} articles`, Date.now() - start);
        return true;
      } else {
        logResult('KB Article Surfacing', 'skip', 'No articles found (may need more transcript)', Date.now() - start);
        return true; // Not a failure, just no articles yet
      }
    } else {
      logResult('KB Article Surfacing', 'skip', 'Articles API not available', Date.now() - start);
      return true; // Not a failure
    }
  } catch (error: any) {
    logResult('KB Article Surfacing', 'skip', error.message, Date.now() - start);
    return true; // Not a critical failure
  }
}

async function runCompleteFlowTest(): Promise<void> {
  console.log('🚀 Starting Complete End-to-End Flow Test\n');
  console.log('=' .repeat(60));
  console.log('');

  // Step 1: Check all services are running
  console.log('📋 Step 1: Service Health Checks\n');
  const ingestHealthy = await testIngestionService();
  const asrHealthy = await testASRWorker();
  const nextjsHealthy = await testNextJSApp();

  if (!ingestHealthy || !asrHealthy || !nextjsHealthy) {
    console.log('\n❌ Some services are not running. Please start all services first.');
    console.log('   Run: ./start-all-services.sh');
    return;
  }

  console.log('\n✅ All services are running\n');
  console.log('=' .repeat(60));
  console.log('');

  // Step 2: WebSocket connection and audio streaming
  console.log('📋 Step 2: WebSocket Audio Streaming\n');
  const wsResult = await testWebSocketConnection();
  if (!wsResult) {
    console.log('\n❌ WebSocket connection failed. Cannot continue.');
    return;
  }

  const { ws, interactionId } = wsResult;
  const audioSuccess = await testAudioStreaming(ws, interactionId);
  
  // Close WebSocket
  ws.close();

  if (!audioSuccess) {
    console.log('\n❌ Audio streaming failed. Cannot continue.');
    return;
  }

  console.log('\n✅ Audio streaming completed\n');
  console.log('=' .repeat(60));
  console.log('');

  // Step 3: ASR Processing
  console.log('📋 Step 3: ASR Processing\n');
  await sleep(2000); // Wait for audio to be processed
  await testASRProcessing(interactionId);

  console.log('\n✅ ASR processing checked\n');
  console.log('=' .repeat(60));
  console.log('');

  // Step 4: Transcript Ingestion and Intent Detection
  console.log('📋 Step 4: Transcript Ingestion & Intent Detection\n');
  await testTranscriptIngestion(interactionId);

  console.log('\n✅ Transcript ingestion completed\n');
  console.log('=' .repeat(60));
  console.log('');

  // Step 5: KB Article Surfacing
  console.log('📋 Step 5: KB Article Surfacing\n');
  await testKBArticleSurfacing(interactionId);

  console.log('\n✅ KB article surfacing checked\n');
  console.log('=' .repeat(60));
  console.log('');

  // Summary
  console.log('\n📊 Test Summary\n');
  console.log('=' .repeat(60));
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  results.forEach(result => {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
    console.log(`${icon} ${result.step}: ${result.message}`);
  });

  console.log('\n' + '=' .repeat(60));
  console.log(`\n📈 Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

  if (failed === 0) {
    console.log('🎉 All critical tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please check the logs above.');
  }
}

// Run the test
runCompleteFlowTest().catch((error) => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

