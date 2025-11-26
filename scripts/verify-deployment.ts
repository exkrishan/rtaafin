#!/usr/bin/env tsx
/**
 * Deployment Verification Script for Exotel → Deepgram Bridge
 * 
 * This script verifies that both ingest and asr-worker services are deployed correctly
 * and that the Exotel bridge feature is enabled.
 * 
 * Usage:
 *   tsx scripts/verify-deployment.ts [ingest-url] [asr-worker-url]
 * 
 * Example:
 *   tsx scripts/verify-deployment.ts https://rtaa-ingest.onrender.com https://rtaa-asr-worker.onrender.com
 */

const INGEST_URL = process.argv[2] || process.env.INGEST_URL || 'https://rtaa-ingest.onrender.com';
const ASR_WORKER_URL = process.argv[3] || process.env.ASR_WORKER_URL || 'https://rtaa-asr-worker.onrender.com';

interface HealthResponse {
  status?: string;
  service?: string;
  exotelBridge?: string;
  exotelMetrics?: any;
  deepgramMetrics?: any;
  asrProvider?: string;
}

async function checkHealth(url: string, serviceName: string): Promise<{ success: boolean; data?: HealthResponse; error?: string }> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json() as HealthResponse;
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

async function verifyDeployment() {
  console.log('🔍 Verifying Deployment Status\n');
  console.log(`Ingest Service: ${INGEST_URL}`);
  console.log(`ASR Worker Service: ${ASR_WORKER_URL}\n`);
  console.log('━'.repeat(60));

  // Test 1: Ingest Service Health
  console.log('\n📡 Test 1: Ingest Service Health Check');
  console.log('─'.repeat(60));
  const ingestHealth = await checkHealth(INGEST_URL, 'Ingest');
  
  if (ingestHealth.success && ingestHealth.data) {
    console.log('✅ Ingest service is healthy');
    console.log(`   Status: ${ingestHealth.data.status || 'unknown'}`);
    console.log(`   Service: ${ingestHealth.data.service || 'unknown'}`);
    
    if (ingestHealth.data.exotelBridge) {
      const bridgeStatus = ingestHealth.data.exotelBridge;
      if (bridgeStatus === 'enabled') {
        console.log(`   ✅ Exotel Bridge: ${bridgeStatus.toUpperCase()}`);
      } else {
        console.log(`   ⚠️  Exotel Bridge: ${bridgeStatus} (should be 'enabled')`);
      }
      
      if (ingestHealth.data.exotelMetrics) {
        console.log(`   📊 Exotel Metrics:`, JSON.stringify(ingestHealth.data.exotelMetrics, null, 2));
      }
    } else {
      console.log(`   ⚠️  Exotel Bridge status not found in health response`);
    }
  } else {
    console.log('❌ Ingest service health check failed');
    if (ingestHealth.error) {
      console.log(`   Error: ${ingestHealth.error}`);
    }
  }

  // Test 2: ASR Worker Service Health
  console.log('\n🎤 Test 2: ASR Worker Service Health Check');
  console.log('─'.repeat(60));
  const asrHealth = await checkHealth(ASR_WORKER_URL, 'ASR Worker');
  
  if (asrHealth.success && asrHealth.data) {
    console.log('✅ ASR Worker service is healthy');
    console.log(`   Status: ${asrHealth.data.status || 'unknown'}`);
    console.log(`   Service: ${asrHealth.data.service || 'unknown'}`);
    
    if (asrHealth.data.asrProvider) {
      const provider = asrHealth.data.asrProvider;
      if (provider === 'deepgram') {
        console.log(`   ✅ ASR Provider: ${provider.toUpperCase()}`);
      } else {
        console.log(`   ⚠️  ASR Provider: ${provider} (should be 'deepgram')`);
      }
    } else {
      console.log(`   ⚠️  ASR Provider not found in health response`);
    }
    
    if (asrHealth.data.deepgramMetrics) {
      console.log(`   📊 Deepgram Metrics:`, JSON.stringify(asrHealth.data.deepgramMetrics, null, 2));
    }
  } else {
    console.log('❌ ASR Worker service health check failed');
    if (asrHealth.error) {
      console.log(`   Error: ${asrHealth.error}`);
    }
  }

  // Test 3: WebSocket Connection Test
  console.log('\n🔌 Test 3: WebSocket Connection Test');
  console.log('─'.repeat(60));
  const wsUrl = INGEST_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/v1/ingest';
  console.log(`   WebSocket URL: ${wsUrl}`);
  console.log('   ⚠️  Manual test required: Use wscat or WebSocket client');
  console.log(`   Command: wscat -c ${wsUrl}`);

  // Summary
  console.log('\n' + '━'.repeat(60));
  console.log('📋 Summary');
  console.log('━'.repeat(60));
  
  const ingestOk = ingestHealth.success && ingestHealth.data?.status === 'ok';
  const asrOk = asrHealth.success && asrHealth.data?.status === 'ok';
  const bridgeEnabled = ingestHealth.data?.exotelBridge === 'enabled';
  const deepgramEnabled = asrHealth.data?.asrProvider === 'deepgram';
  
  console.log(`Ingest Service:     ${ingestOk ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`ASR Worker Service: ${asrOk ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`Exotel Bridge:       ${bridgeEnabled ? '✅ Enabled' : '❌ Not Enabled'}`);
  console.log(`Deepgram Provider:   ${deepgramEnabled ? '✅ Enabled' : '❌ Not Enabled'}`);
  
  if (ingestOk && asrOk && bridgeEnabled && deepgramEnabled) {
    console.log('\n✅ All checks passed! Deployment is ready.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some checks failed. Please review the output above.');
    process.exit(1);
  }
}

// Run verification
verifyDeployment().catch((error) => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});





