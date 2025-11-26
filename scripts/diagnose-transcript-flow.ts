#!/usr/bin/env tsx
/**
 * Diagnostic script to check transcript flow end-to-end
 * Usage: npx tsx scripts/diagnose-transcript-flow.ts [interactionId]
 */

const INTERACTION_ID = process.argv[2] || 'call_4a39b1a4946a1c7e0bc01a1c2fa17ced';
const FRONTEND_URL = process.env.UI_URL || 'https://frontend-8jdd.onrender.com';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'https://asr-worker.onrender.com';
const INGEST_URL = process.env.INGEST_URL || 'https://ingestservice.onrender.com';

async function checkTranscriptConsumer() {
  console.log('\n📊 Checking Transcript Consumer Status...');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${FRONTEND_URL}/api/transcripts/status`);
    const data = await response.json();
    
    console.log('Status:', data);
    
    if (!data.isRunning) {
      console.log('❌ Transcript consumer is NOT running!');
      console.log('   This means transcripts won\'t reach the frontend.');
      console.log('   The consumer should auto-start via instrumentation.ts');
      console.log('   Check frontend logs for instrumentation errors.');
      return false;
    } else {
      console.log('✅ Transcript consumer is running');
      console.log(`   Subscriptions: ${data.subscriptionCount}`);
      if (data.subscriptions && data.subscriptions.length > 0) {
        console.log('   Active subscriptions:');
        data.subscriptions.forEach((sub: any) => {
          console.log(`     - ${sub.interactionId} (${sub.transcriptCount} transcripts)`);
        });
      }
      return true;
    }
  } catch (error: any) {
    console.error('❌ Failed to check transcript consumer:', error.message);
    return false;
  }
}

async function checkCallRegistry() {
  console.log('\n📋 Checking Call Registry...');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/active?limit=10`);
    const data = await response.json();
    
    console.log('Active calls:', data.count);
    console.log('Latest call:', data.latestCall || 'none');
    
    if (data.calls && data.calls.length > 0) {
      console.log('\nRegistered calls:');
      data.calls.forEach((call: any) => {
        console.log(`  - ${call.interactionId} (${call.status})`);
        if (call.interactionId === INTERACTION_ID) {
          console.log('    ✅ Your call is registered!');
        }
      });
    } else {
      console.log('⚠️  No calls registered');
      console.log('   This could mean:');
      console.log('   - Ingest service failed to register the call');
      console.log('   - Call registry module not working');
      console.log('   - Redis connection issue in ingest service');
    }
    
    const isRegistered = data.calls?.some((c: any) => c.interactionId === INTERACTION_ID) || 
                        data.latestCall === INTERACTION_ID;
    
    return isRegistered;
  } catch (error: any) {
    console.error('❌ Failed to check call registry:', error.message);
    return false;
  }
}

async function checkASRWorker() {
  console.log('\n🎤 Checking ASR Worker...');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${ASR_WORKER_URL}/health`);
    const text = await response.text();
    
    if (text === 'Not Found') {
      console.log('❌ ASR Worker health endpoint not found');
      console.log('   URL:', ASR_WORKER_URL);
      return false;
    }
    
    try {
      const data = JSON.parse(text);
      console.log('Status:', data.status || 'unknown');
      console.log('Provider:', data.provider || 'unknown');
      console.log('Active buffers:', data.activeBuffers || 0);
      console.log('Active connections:', data.activeConnections || 0);
      
      if (data.activeBuffers > 0) {
        console.log('✅ ASR Worker is processing audio');
      } else {
        console.log('⚠️  ASR Worker has no active buffers');
        console.log('   This could mean:');
        console.log('   - Audio was already processed');
        console.log('   - Audio was not received');
        console.log('   - Call was marked as ended');
      }
      
      return true;
    } catch (parseError) {
      console.log('⚠️  ASR Worker returned non-JSON response:', text.substring(0, 100));
      return false;
    }
  } catch (error: any) {
    console.error('❌ Failed to check ASR Worker:', error.message);
    return false;
  }
}

async function checkIngestService() {
  console.log('\n📥 Checking Ingest Service...');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${INGEST_URL}/health`);
    const data = await response.json();
    
    console.log('Status:', data.status);
    console.log('PubSub:', data.pubsub ? '✅ Connected' : '❌ Not connected');
    
    if (data.exotelMetrics) {
      console.log('Exotel Metrics:');
      console.log(`  Frames in: ${data.exotelMetrics.framesIn}`);
      console.log(`  Bytes in: ${data.exotelMetrics.bytesIn}`);
      console.log(`  Active buffers: ${data.exotelMetrics.activeBuffers}`);
    }
    
    return data.status === 'healthy';
  } catch (error: any) {
    console.error('❌ Failed to check Ingest Service:', error.message);
    return false;
  }
}

async function checkTranscriptsInRedis() {
  console.log('\n🔍 Checking for Transcripts in Redis...');
  console.log('='.repeat(60));
  console.log('⚠️  This requires Redis access - checking via transcript consumer status');
  console.log('   If transcript consumer is running, it should discover transcripts');
  console.log('   Check frontend logs for:');
  console.log('   - "[TranscriptConsumer] Auto-discovered transcript stream"');
  console.log('   - "[TranscriptConsumer] Forwarding transcript to ingest API"');
}

async function main() {
  console.log('🔍 Transcript Flow Diagnostic');
  console.log('='.repeat(60));
  console.log(`Interaction ID: ${INTERACTION_ID}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`ASR Worker URL: ${ASR_WORKER_URL}`);
  console.log(`Ingest URL: ${INGEST_URL}`);
  
  const results = {
    transcriptConsumer: await checkTranscriptConsumer(),
    callRegistry: await checkCallRegistry(),
    asrWorker: await checkASRWorker(),
    ingestService: await checkIngestService(),
  };
  
  await checkTranscriptsInRedis();
  
  console.log('\n📊 Summary');
  console.log('='.repeat(60));
  console.log('Transcript Consumer:', results.transcriptConsumer ? '✅ Running' : '❌ Not Running');
  console.log('Call Registry:', results.callRegistry ? '✅ Registered' : '❌ Not Registered');
  console.log('ASR Worker:', results.asrWorker ? '✅ Healthy' : '❌ Unhealthy');
  console.log('Ingest Service:', results.ingestService ? '✅ Healthy' : '❌ Unhealthy');
  
  console.log('\n💡 Recommendations:');
  console.log('='.repeat(60));
  
  if (!results.transcriptConsumer) {
    console.log('1. ❌ CRITICAL: Transcript consumer is not running');
    console.log('   - Check frontend logs for instrumentation errors');
    console.log('   - Verify REDIS_URL and PUBSUB_ADAPTER env vars are set');
    console.log('   - Check if instrumentation.ts is being executed');
  }
  
  if (!results.callRegistry) {
    console.log('2. ⚠️  Call is not registered in call registry');
    console.log('   - Check ingest service logs for registration errors');
    console.log('   - Verify call-registry module is loaded correctly');
    console.log('   - Check Redis connection in ingest service');
  }
  
  if (!results.asrWorker) {
    console.log('3. ⚠️  ASR Worker health check failed');
    console.log('   - Check ASR Worker logs');
    console.log('   - Verify ASR Worker is deployed and running');
  }
  
  console.log('\n📝 Next Steps:');
  console.log('='.repeat(60));
  console.log('1. Check frontend logs for transcript consumer errors');
  console.log('2. Check ASR worker logs for transcript processing');
  console.log('3. Check ingest service logs for call registration');
  console.log('4. Verify Redis is accessible from all services');
  console.log(`5. Open UI: ${FRONTEND_URL}/test-agent-assist`);
  console.log(`   Interaction ID: ${INTERACTION_ID}`);
}

main().catch(console.error);
