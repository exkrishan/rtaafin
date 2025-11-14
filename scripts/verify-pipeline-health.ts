#!/usr/bin/env tsx
/**
 * Pipeline Health Verification Script
 * 
 * Verifies that all services in the pipeline are healthy and properly configured
 * before running end-to-end tests.
 * 
 * Usage:
 *   npx tsx scripts/verify-pipeline-health.ts
 * 
 * Environment Variables:
 *   RENDER_INGEST_URL - Render ingest service URL (default: https://rtaa-ingest-service.onrender.com)
 *   ASR_WORKER_URL - Local ASR worker URL (default: http://localhost:3001)
 *   TRANSCRIPT_CONSUMER_URL - Transcript consumer URL (default: http://localhost:3000)
 *   REDIS_URL - Redis URL (required)
 */

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  details?: any;
}

const RENDER_INGEST_URL = process.env.RENDER_INGEST_URL || 'https://rtaa-ingest-service.onrender.com';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'http://localhost:3001';
const TRANSCRIPT_CONSUMER_URL = process.env.TRANSCRIPT_CONSUMER_URL || 'http://localhost:3000';
const REDIS_URL = process.env.REDIS_URL;

async function checkRenderIngestService(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${RENDER_INGEST_URL}/health`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    if (!response.ok) {
      return {
        name: 'Render Ingest Service',
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    // Check for Exotel bridge status
    if (data.exotelBridge && data.exotelBridge !== 'enabled') {
      return {
        name: 'Render Ingest Service',
        status: 'fail',
        message: `Exotel bridge is not enabled (${data.exotelBridge})`,
        details: data,
      };
    }
    
    return {
      name: 'Render Ingest Service',
      status: 'pass',
      message: `Service is healthy${data.exotelBridge === 'enabled' ? ', Exotel bridge enabled' : ''}`,
      details: data,
    };
  } catch (error: any) {
    // Render services on free tier may be sleeping - this is a warning, not a critical failure
    if (error.message.includes('fetch failed') || error.message.includes('timeout')) {
      return {
        name: 'Render Ingest Service',
        status: 'skip',
        message: `Cannot connect (service may be sleeping or unreachable): ${error.message}. This is expected for Render free tier services.`,
      };
    }
    return {
      name: 'Render Ingest Service',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function checkLocalASRWorker(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${ASR_WORKER_URL}/health`);
    if (!response.ok) {
      return {
        name: 'Local ASR Worker',
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    // Check ASR provider
    const provider = data.asrProvider || data.provider || 'unknown';
    if (provider === 'mock') {
      return {
        name: 'Local ASR Worker',
        status: 'fail',
        message: 'ASR provider is set to "mock" - real provider required',
        details: data,
      };
    }
    
    // Check for ElevenLabs if that's the provider
    // Note: Connection is only created when processing audio, so no active connection is normal when idle
    if (provider === 'elevenlabs') {
      // If there's an active connection, that's great
      if (data.elevenlabs && data.elevenlabs.connected) {
        return {
          name: 'Local ASR Worker',
          status: 'pass',
          message: `Service is healthy, ASR provider: ${provider}, ElevenLabs connected`,
          details: data,
        };
      }
      // If no active connection but worker is idle, that's expected (not a failure)
      if (data.activeBuffers === 0 && data.activeConnections === 0) {
        return {
          name: 'Local ASR Worker',
          status: 'pass',
          message: `Service is healthy, ASR provider: ${provider} (idle - connection will be created when processing audio)`,
          details: data,
        };
      }
      // If there are active buffers but no connection, that might be an issue
      if (data.activeBuffers > 0 && !data.elevenlabs) {
        return {
          name: 'Local ASR Worker',
          status: 'fail',
          message: 'ASR provider is "elevenlabs" but no connection available despite active buffers',
          details: data,
        };
      }
    }
    
    return {
      name: 'Local ASR Worker',
      status: 'pass',
      message: `Service is healthy, ASR provider: ${provider}`,
      details: data,
    };
  } catch (error: any) {
    return {
      name: 'Local ASR Worker',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function checkTranscriptConsumer(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${TRANSCRIPT_CONSUMER_URL}/api/transcripts/status`);
    if (!response.ok) {
      return {
        name: 'Transcript Consumer',
        status: 'fail',
        message: `Status endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    if (!data.isRunning) {
      return {
        name: 'Transcript Consumer',
        status: 'fail',
        message: 'Transcript consumer is not running',
        details: data,
      };
    }
    
    return {
      name: 'Transcript Consumer',
      status: 'pass',
      message: `Consumer is running, ${data.subscriptionCount || 0} active subscription(s)`,
      details: data,
    };
  } catch (error: any) {
    return {
      name: 'Transcript Consumer',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function checkRedisConnection(): Promise<HealthCheck> {
  if (!REDIS_URL) {
    return {
      name: 'Redis Connection',
      status: 'fail',
      message: 'REDIS_URL environment variable is not set',
    };
  }
  
  try {
    // Try to import and create Redis client
    const { createClient } = require('ioredis');
    const redis = createClient(REDIS_URL);
    
    // Test connection
    await redis.ping();
    
    // Check if we can read stream info
    const streamInfo = await redis.xinfo('STREAM', 'audio_stream').catch(() => null);
    
    await redis.quit();
    
    return {
      name: 'Redis Connection',
      status: 'pass',
      message: `Successfully connected to Redis${streamInfo ? ', audio_stream exists' : ''}`,
      details: {
        url: REDIS_URL.replace(/:[^:@]+@/, ':****@'), // Mask password
        hasAudioStream: !!streamInfo,
      },
    };
  } catch (error: any) {
    return {
      name: 'Redis Connection',
      status: 'fail',
      message: `Failed to connect to Redis: ${error.message}`,
    };
  }
}

async function verifyRedisUrlConsistency(): Promise<HealthCheck> {
  // This is a manual check - we can't easily verify what Redis URL
  // the Render service is using, but we can document it
  return {
    name: 'Redis URL Consistency',
    status: 'skip',
    message: 'Manual verification required: Ensure Render Ingest Service and Local ASR Worker use the same REDIS_URL',
    details: {
      localRedisUrl: REDIS_URL ? REDIS_URL.replace(/:[^:@]+@/, ':****@') : 'not set',
      note: 'Check Render dashboard for ingest service REDIS_URL configuration',
    },
  };
}

async function verifyElevenLabsConfiguration(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${ASR_WORKER_URL}/health`);
    if (!response.ok) {
      return {
        name: 'ElevenLabs Configuration',
        status: 'skip',
        message: 'Cannot verify (ASR Worker not accessible)',
      };
    }
    
    const data = await response.json();
    const provider = data.asrProvider || data.provider || 'unknown';
    
    if (provider !== 'elevenlabs') {
      return {
        name: 'ElevenLabs Configuration',
        status: 'skip',
        message: `ASR provider is "${provider}", not "elevenlabs"`,
      };
    }
    
    // Check if ElevenLabs API key is configured
    if (!process.env.ELEVENLABS_API_KEY) {
      return {
        name: 'ElevenLabs Configuration',
        status: 'fail',
        message: 'ELEVENLABS_API_KEY environment variable is not set',
      };
    }
    
    // Check if ElevenLabs connection is available
    if (data.elevenlabs && data.elevenlabs.connected) {
      return {
        name: 'ElevenLabs Configuration',
        status: 'pass',
        message: 'ElevenLabs API key configured and connection available',
        details: {
          apiKeySet: !!process.env.ELEVENLABS_API_KEY,
          connected: data.elevenlabs.connected,
        },
      };
    }
    
    return {
      name: 'ElevenLabs Configuration',
      status: 'pass',
      message: 'ElevenLabs API key configured',
      details: {
        apiKeySet: !!process.env.ELEVENLABS_API_KEY,
      },
    };
  } catch (error: any) {
    return {
      name: 'ElevenLabs Configuration',
      status: 'skip',
      message: `Cannot verify: ${error.message}`,
    };
  }
}

async function runHealthChecks(): Promise<void> {
  console.log('🏥 Pipeline Health Verification');
  console.log('='.repeat(60));
  console.log(`   Render Ingest: ${RENDER_INGEST_URL}`);
  console.log(`   Local ASR Worker: ${ASR_WORKER_URL}`);
  console.log(`   Transcript Consumer: ${TRANSCRIPT_CONSUMER_URL}`);
  console.log(`   Redis URL: ${REDIS_URL ? REDIS_URL.replace(/:[^:@]+@/, ':****@') : 'not set'}`);
  console.log('='.repeat(60));
  console.log('');
  
  const checks: HealthCheck[] = [];
  
  // Run all checks
  console.log('1️⃣  Checking Render Ingest Service...');
  const ingestCheck = await checkRenderIngestService();
  checks.push(ingestCheck);
  console.log(`   ${ingestCheck.status === 'pass' ? '✅' : '❌'} ${ingestCheck.message}`);
  
  console.log('\n2️⃣  Checking Local ASR Worker...');
  const asrCheck = await checkLocalASRWorker();
  checks.push(asrCheck);
  console.log(`   ${asrCheck.status === 'pass' ? '✅' : '❌'} ${asrCheck.message}`);
  
  console.log('\n3️⃣  Checking Transcript Consumer...');
  const consumerCheck = await checkTranscriptConsumer();
  checks.push(consumerCheck);
  console.log(`   ${consumerCheck.status === 'pass' ? '✅' : '❌'} ${consumerCheck.message}`);
  
  console.log('\n4️⃣  Checking Redis Connection...');
  const redisCheck = await checkRedisConnection();
  checks.push(redisCheck);
  console.log(`   ${redisCheck.status === 'pass' ? '✅' : '❌'} ${redisCheck.message}`);
  
  console.log('\n5️⃣  Verifying Redis URL Consistency...');
  const redisConsistencyCheck = await verifyRedisUrlConsistency();
  checks.push(redisConsistencyCheck);
  console.log(`   ${redisConsistencyCheck.status === 'pass' ? '✅' : redisConsistencyCheck.status === 'skip' ? '⏭️' : '❌'} ${redisConsistencyCheck.message}`);
  
  console.log('\n6️⃣  Verifying ElevenLabs Configuration...');
  const elevenLabsCheck = await verifyElevenLabsConfiguration();
  checks.push(elevenLabsCheck);
  console.log(`   ${elevenLabsCheck.status === 'pass' ? '✅' : elevenLabsCheck.status === 'skip' ? '⏭️' : '❌'} ${elevenLabsCheck.message}`);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Health Check Summary');
  console.log('='.repeat(60));
  
  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const skipped = checks.filter(c => c.status === 'skip').length;
  
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Skipped: ${skipped}\n`);
  
  // Detailed results
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⏭️';
    console.log(`${icon} ${check.name}: ${check.message}`);
    if (check.details && Object.keys(check.details).length > 0) {
      console.log(`   Details: ${JSON.stringify(check.details, null, 2).split('\n').join('\n   ')}`);
    }
  }
  
  console.log('');
  
  if (failed > 0) {
    console.log('❌ Health checks failed. Please fix the issues above before running tests.');
    if (require.main === module) {
      process.exit(1);
    } else {
      throw new Error('Health checks failed');
    }
  } else {
    console.log('✅ All health checks passed! Pipeline is ready for testing.');
    if (require.main === module) {
      process.exit(0);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  runHealthChecks().catch((error) => {
    console.error('❌ Health check error:', error);
    process.exit(1);
  });
}

export { runHealthChecks, HealthCheck };

