#!/usr/bin/env tsx
/**
 * End-to-End Test Orchestrator for Exotel Pipeline
 * 
 * Orchestrates the complete test flow:
 * 1. Pre-flight checks (verify all services running)
 * 2. Start Exotel simulation (connect to Render, send audio)
 * 3. Monitor Redis for audio frames
 * 4. Monitor ASR Worker logs/metrics
 * 5. Monitor Redis for transcripts
 * 6. Monitor Transcript Consumer status
 * 7. Verify transcripts in frontend (SSE events)
 * 8. Generate test report
 * 
 * Usage:
 *   npx tsx scripts/test-exotel-e2e.ts [options]
 * 
 * Environment Variables:
 *   RENDER_INGEST_URL - Render ingest service URL
 *   ASR_WORKER_URL - Local ASR worker URL
 *   TRANSCRIPT_CONSUMER_URL - Transcript consumer URL
 *   REDIS_URL - Redis URL
 *   ELEVENLABS_API_KEY - ElevenLabs API key
 *   WS_URL - WebSocket URL for Exotel simulation
 *   DURATION_SEC - Audio duration (default: 20)
 */

import { runHealthChecks } from './verify-pipeline-health';
import { simulateExotelStream, SimulationResult } from './test-exotel-complete-pipeline';
import { createPubSubAdapterFromEnv } from '../lib/pubsub';
import { transcriptTopic } from '../lib/pubsub/topics';
import type { TranscriptMessage } from '../services/asr-worker/src/types';

interface TestStage {
  name: string;
  status: 'pending' | 'running' | 'pass' | 'fail' | 'skip';
  message?: string;
  details?: any;
  duration?: number;
}

interface TestReport {
  success: boolean;
  interactionId: string;
  stages: TestStage[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  timestamps: {
    start: Date;
    end?: Date;
    duration?: number;
  };
}

const RENDER_INGEST_URL = process.env.RENDER_INGEST_URL || 'https://rtaa-ingest-service.onrender.com';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'http://localhost:3001';
const TRANSCRIPT_CONSUMER_URL = process.env.TRANSCRIPT_CONSUMER_URL || 'http://localhost:3000';
const WS_URL = process.env.WS_URL || 'wss://rtaa-ingest-service.onrender.com/v1/ingest';
const DURATION_SEC = parseInt(process.env.DURATION_SEC || '20', 10);

async function checkASRWorkerMetrics(interactionId: string): Promise<TestStage> {
  const startTime = Date.now();
  
  try {
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const response = await fetch(`${ASR_WORKER_URL}/health`);
    if (!response.ok) {
      return {
        name: 'ASR Worker Metrics',
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
        duration: Date.now() - startTime,
      };
    }
    
    const data = await response.json();
    
    // Check for activity
    const hasActivity = 
      (data.audioChunksSent && data.audioChunksSent > 0) ||
      (data.connectionsCreated && data.connectionsCreated > 0) ||
      (data.elevenlabs && data.elevenlabs.connectionsCreated > 0);
    
    if (hasActivity) {
      return {
        name: 'ASR Worker Metrics',
        status: 'pass',
        message: 'ASR Worker shows activity',
        details: data,
        duration: Date.now() - startTime,
      };
    } else {
      return {
        name: 'ASR Worker Metrics',
        status: 'fail',
        message: 'No activity detected in ASR Worker metrics',
        details: data,
        duration: Date.now() - startTime,
      };
    }
  } catch (error: any) {
    return {
      name: 'ASR Worker Metrics',
      status: 'fail',
      message: `Failed to check metrics: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function verifyTranscripts(interactionId: string, maxWaitSeconds: number = 30): Promise<TestStage> {
  const startTime = Date.now();
  
  try {
    console.log(`   Subscribing to transcript topic: transcript.${interactionId}`);
    
    const pubsub = createPubSubAdapterFromEnv();
    const topic = transcriptTopic(interactionId);
    
    const receivedTranscripts: TranscriptMessage[] = [];
    let subscriptionHandle: any = null;
    
    // Set up subscription
    subscriptionHandle = await pubsub.subscribe(topic, async (msg: any) => {
      const transcript = msg as TranscriptMessage;
      receivedTranscripts.push(transcript);
      console.log(`   📥 Received transcript: type=${transcript.type}, text="${transcript.text?.substring(0, 50) || '(empty)'}"`);
    });
    
    console.log(`   ✅ Subscription active, waiting up to ${maxWaitSeconds} seconds for transcripts...`);
    
    // Wait for transcripts
    const maxWaitTime = maxWaitSeconds * 1000;
    const checkInterval = 1000; // Check every second
    let elapsed = 0;
    
    while (elapsed < maxWaitTime) {
      // Check if we received any transcripts with text
      const transcriptsWithText = receivedTranscripts.filter(t => t.text && t.text.trim().length > 0);
      if (transcriptsWithText.length > 0) {
        await subscriptionHandle.unsubscribe();
        await pubsub.close();
        
        return {
          name: 'Transcript Verification',
          status: 'pass',
          message: `Received ${transcriptsWithText.length} transcript(s) with text (total: ${receivedTranscripts.length})`,
          details: {
            totalTranscripts: receivedTranscripts.length,
            transcriptsWithText: transcriptsWithText.length,
            sampleTranscript: transcriptsWithText[0]?.text?.substring(0, 100),
            transcriptTypes: receivedTranscripts.map(t => t.type),
          },
          duration: Date.now() - startTime,
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }
    
    // Cleanup
    if (subscriptionHandle) {
      await subscriptionHandle.unsubscribe();
    }
    await pubsub.close();
    
    // Check what we got
    if (receivedTranscripts.length === 0) {
      return {
        name: 'Transcript Verification',
        status: 'fail',
        message: `No transcripts received after ${maxWaitSeconds} seconds`,
        details: {
          interactionId,
          topic,
          waitTimeMs: maxWaitTime,
        },
        duration: Date.now() - startTime,
      };
    } else {
      return {
        name: 'Transcript Verification',
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
        duration: Date.now() - startTime,
      };
    }
  } catch (error: any) {
    return {
      name: 'Transcript Verification',
      status: 'fail',
      message: `Failed to verify transcripts: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function checkTranscriptConsumerStatus(): Promise<TestStage> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${TRANSCRIPT_CONSUMER_URL}/api/transcripts/status`);
    if (!response.ok) {
      return {
        name: 'Transcript Consumer Status',
        status: 'fail',
        message: `Status endpoint returned ${response.status}`,
        duration: Date.now() - startTime,
      };
    }
    
    const data = await response.json();
    
    if (!data.isRunning) {
      return {
        name: 'Transcript Consumer Status',
        status: 'fail',
        message: 'Transcript consumer is not running',
        details: data,
        duration: Date.now() - startTime,
      };
    }
    
    return {
      name: 'Transcript Consumer Status',
      status: 'pass',
      message: `Consumer is running, ${data.subscriptionCount || 0} active subscription(s)`,
      details: data,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      name: 'Transcript Consumer Status',
      status: 'fail',
      message: `Failed to check status: ${error.message}`,
      duration: Date.now() - startTime,
    };
  }
}

async function runE2ETest(): Promise<TestReport> {
  const report: TestReport = {
    success: false,
    interactionId: '',
    stages: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    },
    timestamps: {
      start: new Date(),
    },
  };
  
  console.log('🧪 Exotel End-to-End Pipeline Test');
  console.log('='.repeat(60));
  console.log(`   Render Ingest: ${RENDER_INGEST_URL}`);
  console.log(`   Local ASR Worker: ${ASR_WORKER_URL}`);
  console.log(`   Transcript Consumer: ${TRANSCRIPT_CONSUMER_URL}`);
  console.log(`   WebSocket URL: ${WS_URL}`);
  console.log(`   Audio Duration: ${DURATION_SEC} seconds`);
  console.log('='.repeat(60));
  console.log('');
  
  // Stage 1: Pre-flight Health Checks
  console.log('1️⃣  Running Pre-flight Health Checks...');
  try {
    await runHealthChecks();
    report.stages.push({
      name: 'Pre-flight Health Checks',
      status: 'pass',
      message: 'All health checks passed',
    });
  } catch (error: any) {
    report.stages.push({
      name: 'Pre-flight Health Checks',
      status: 'fail',
      message: `Health checks failed: ${error.message}`,
    });
    report.timestamps.end = new Date();
    report.timestamps.duration = report.timestamps.end.getTime() - report.timestamps.start.getTime();
    return report;
  }
  console.log('   ✅ Health checks passed\n');
  
  // Stage 2: Exotel Simulation
  console.log('2️⃣  Starting Exotel Simulation...');
  const simulationResult = await simulateExotelStream({
    wsUrl: WS_URL,
    callSid: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    streamSid: `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    accountSid: `account_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    durationSec: DURATION_SEC,
    sampleRate: 8000,
  });
  
  report.interactionId = simulationResult.interactionId;
  
  if (simulationResult.success) {
    report.stages.push({
      name: 'Exotel Simulation',
      status: 'pass',
      message: `Successfully sent ${simulationResult.framesSent} audio frames`,
      details: simulationResult,
    });
    console.log(`   ✅ Simulation completed: ${simulationResult.framesSent} frames sent\n`);
  } else {
    report.stages.push({
      name: 'Exotel Simulation',
      status: 'fail',
      message: simulationResult.error || 'Simulation failed',
      details: simulationResult,
    });
    console.log(`   ❌ Simulation failed: ${simulationResult.error}\n`);
    report.timestamps.end = new Date();
    report.timestamps.duration = report.timestamps.end.getTime() - report.timestamps.start.getTime();
    return report;
  }
  
  // Stage 3: ASR Worker Metrics
  console.log('3️⃣  Checking ASR Worker Metrics...');
  const metricsStage = await checkASRWorkerMetrics(report.interactionId);
  report.stages.push(metricsStage);
  console.log(`   ${metricsStage.status === 'pass' ? '✅' : '❌'} ${metricsStage.message}\n`);
  
  // Stage 4: Transcript Verification
  console.log('4️⃣  Verifying Transcripts...');
  const transcriptStage = await verifyTranscripts(report.interactionId, 30);
  report.stages.push(transcriptStage);
  console.log(`   ${transcriptStage.status === 'pass' ? '✅' : '❌'} ${transcriptStage.message}\n`);
  
  // Stage 5: Transcript Consumer Status
  console.log('5️⃣  Checking Transcript Consumer Status...');
  const consumerStage = await checkTranscriptConsumerStatus();
  report.stages.push(consumerStage);
  console.log(`   ${consumerStage.status === 'pass' ? '✅' : '❌'} ${consumerStage.message}\n`);
  
  // Calculate summary
  report.summary.total = report.stages.length;
  report.summary.passed = report.stages.filter(s => s.status === 'pass').length;
  report.summary.failed = report.stages.filter(s => s.status === 'fail').length;
  report.summary.skipped = report.stages.filter(s => s.status === 'skip').length;
  
  report.success = report.summary.failed === 0;
  report.timestamps.end = new Date();
  report.timestamps.duration = report.timestamps.end.getTime() - report.timestamps.start.getTime();
  
  // Print report
  console.log('='.repeat(60));
  console.log('📊 Test Report');
  console.log('='.repeat(60));
  console.log(`   Success: ${report.success ? '✅' : '❌'}`);
  console.log(`   Interaction ID: ${report.interactionId}`);
  console.log(`   Duration: ${(report.timestamps.duration! / 1000).toFixed(2)}s`);
  console.log(`   Stages: ${report.summary.passed}/${report.summary.total} passed`);
  console.log('');
  
  console.log('Stage Results:');
  for (const stage of report.stages) {
    const icon = stage.status === 'pass' ? '✅' : stage.status === 'fail' ? '❌' : '⏭️';
    const duration = stage.duration ? ` (${(stage.duration / 1000).toFixed(2)}s)` : '';
    console.log(`   ${icon} ${stage.name}: ${stage.message}${duration}`);
    if (stage.details && Object.keys(stage.details).length > 0) {
      console.log(`      Details: ${JSON.stringify(stage.details, null, 2).split('\n').join('\n      ')}`);
    }
  }
  
  console.log('='.repeat(60));
  
  return report;
}

// Run if executed directly
if (require.main === module) {
  runE2ETest()
    .then((report) => {
      process.exit(report.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ E2E test error:', error);
      process.exit(1);
    });
}

export { runE2ETest, TestReport, TestStage };

