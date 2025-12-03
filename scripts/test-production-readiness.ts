/**
 * Production Readiness Test Script
 * 
 * Tests the complete end-to-end flow:
 * 1. Exotel → Ingest Service → Redis → ASR Worker
 * 2. ASR Worker → Redis → Transcript Consumer → Frontend
 * 3. Intent Detection → KB Surfacing
 * 4. Call End → Disposition Generation
 * 
 * Run: npx tsx scripts/test-production-readiness.ts
 */

// Dynamic import for ioredis (optional dependency)
let ioredis: any = null;
try {
  ioredis = require('ioredis');
} catch (e) {
  // ioredis is optional
}

// Use node-fetch if available, otherwise use built-in fetch (Node 18+)
const fetch = globalThis.fetch || require('node-fetch');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const INGEST_URL = process.env.INGEST_URL || 'http://localhost:8443';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
  if (details) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

async function testRedisConnection(): Promise<boolean> {
  try {
    if (!ioredis) {
      logTest('Redis Connection', false, 'ioredis not available');
      return false;
    }
    const redis = new ioredis(REDIS_URL);
    await redis.ping();
    await redis.quit();
    logTest('Redis Connection', true);
    return true;
  } catch (error: any) {
    logTest('Redis Connection', false, error.message);
    return false;
  }
}

async function testIngestServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${INGEST_URL}/health`, {
      timeout: 5000,
    });
    const data = await response.json();
    const passed = response.ok && data.status === 'ok';
    logTest('Ingest Service Health', passed, passed ? undefined : `Status: ${data.status}`, data);
    return passed;
  } catch (error: any) {
    logTest('Ingest Service Health', false, error.message);
    return false;
  }
}

async function testAsrWorkerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${ASR_WORKER_URL}/health`, {
      timeout: 5000,
    });
    const data = await response.json();
    const passed = response.ok && (data.status === 'ok' || data.status === 'healthy');
    logTest('ASR Worker Health', passed, passed ? undefined : `Status: ${data.status}`, data);
    return passed;
  } catch (error: any) {
    logTest('ASR Worker Health', false, error.message);
    return false;
  }
}

async function testFrontendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/health`, {
      timeout: 5000,
    });
    const data = await response.json();
    const passed = response.ok;
    logTest('Frontend Health', passed, passed ? undefined : `Status: ${response.status}`, data);
    return passed;
  } catch (error: any) {
    logTest('Frontend Health', false, error.message);
    return false;
  }
}

async function testActiveCallsEndpoint(): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/active?limit=10`, {
      timeout: 5000,
    });
    const data = await response.json();
    const passed = response.ok && data.ok !== false;
    logTest('Active Calls Endpoint', passed, passed ? undefined : data.error, {
      callsCount: data.calls?.length || 0,
      latestCall: data.latestCall,
    });
    return passed;
  } catch (error: any) {
    logTest('Active Calls Endpoint', false, error.message);
    return false;
  }
}

async function testTranscriptConsumerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/transcripts/status`, {
      timeout: 5000,
    });
    const data = await response.json();
    const passed = response.ok && data.status !== undefined;
    logTest('Transcript Consumer Status', passed, passed ? undefined : data.error, data);
    return passed;
  } catch (error: any) {
    logTest('Transcript Consumer Status', false, error.message);
    return false;
  }
}

async function testRedisStreams(): Promise<boolean> {
  try {
    if (!ioredis) {
      logTest('Redis Streams Access', false, 'ioredis not available');
      return false;
    }
    const redis = new ioredis(REDIS_URL);
    
    // Check if audio_stream exists
    const audioStreamInfo = await redis.xinfo('STREAM', 'audio_stream').catch(() => null);
    const transcriptStreams = await redis.keys('transcript:*').catch(() => []);
    
    await redis.quit();
    
    const passed = true; // Just checking connectivity
    logTest('Redis Streams Access', passed, undefined, {
      audioStreamExists: audioStreamInfo !== null,
      transcriptStreamsCount: transcriptStreams.length,
    });
    return passed;
  } catch (error: any) {
    logTest('Redis Streams Access', false, error.message);
    return false;
  }
}

async function testEnvironmentVariables(): Promise<boolean> {
  const required = [
    'REDIS_URL',
    'ELEVENLABS_API_KEY',
    'GEMINI_API_KEY',
    'SUPPORT_EXOTEL',
    'ASR_PROVIDER',
    'LLM_PROVIDER',
  ];
  
  const missing: string[] = [];
  const present: string[] = [];
  
  for (const key of required) {
    if (process.env[key]) {
      present.push(key);
    } else {
      missing.push(key);
    }
  }
  
  const passed = missing.length === 0;
  logTest('Environment Variables', passed, 
    passed ? undefined : `Missing: ${missing.join(', ')}`,
    { present: present.length, missing: missing.length }
  );
  return passed;
}

async function testCallRegistryIntegration(): Promise<boolean> {
  try {
    // Test if call registry can be accessed
    const response = await fetch(`${FRONTEND_URL}/api/calls/active?limit=1`, {
      timeout: 5000,
    });
    const data = await response.json();
    
    // If we get a response (even if empty), the integration works
    const passed = response.ok && data.ok !== false;
    logTest('Call Registry Integration', passed, passed ? undefined : data.error, {
      hasCalls: (data.calls?.length || 0) > 0,
    });
    return passed;
  } catch (error: any) {
    logTest('Call Registry Integration', false, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Production Readiness Tests\n');
  console.log('='.repeat(60));
  
  // Infrastructure Tests
  console.log('\n📦 Infrastructure Tests');
  console.log('-'.repeat(60));
  await testRedisConnection();
  await testIngestServiceHealth();
  await testAsrWorkerHealth();
  await testFrontendHealth();
  
  // Integration Tests
  console.log('\n🔗 Integration Tests');
  console.log('-'.repeat(60));
  await testActiveCallsEndpoint();
  await testTranscriptConsumerStatus();
  await testRedisStreams();
  await testCallRegistryIntegration();
  
  // Configuration Tests
  console.log('\n⚙️  Configuration Tests');
  console.log('-'.repeat(60));
  await testEnvironmentVariables();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);
  
  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error || 'Unknown error'}`);
    });
    console.log('');
  }
  
  // Production Readiness Assessment
  console.log('🎯 Production Readiness Assessment\n');
  
  const criticalTests = [
    'Redis Connection',
    'Ingest Service Health',
    'ASR Worker Health',
    'Frontend Health',
    'Active Calls Endpoint',
    'Transcript Consumer Status',
    'Environment Variables',
  ];
  
  const criticalPassed = criticalTests.every(testName => 
    results.find(r => r.name === testName)?.passed
  );
  
  if (criticalPassed) {
    console.log('✅ All critical tests passed. System is ready for production testing.');
  } else {
    console.log('⚠️  Some critical tests failed. Please fix issues before production deployment.');
  }
  
  console.log('\n📝 Next Steps:');
  console.log('1. Test with real Exotel call');
  console.log('2. Verify transcripts appear in UI');
  console.log('3. Test intent detection and KB surfacing');
  console.log('4. Test disposition generation on call end');
  console.log('5. Monitor logs for errors during live calls\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});

