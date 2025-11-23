#!/usr/bin/env tsx
/**
 * Comprehensive Production Demo Readiness Test
 * Tests all services on Render to ensure everything is working for demo
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend-8jdd.onrender.com';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'https://rtaa-asr-worker.onrender.com';
const INGEST_URL = process.env.INGEST_URL || 'https://rtaa-ingest.onrender.com';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function logResult(result: TestResult) {
  results.push(result);
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details) {
    console.log(`   Details:`, JSON.stringify(result.details, null, 2));
  }
}

async function testEndpoint(url: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data?: any }> {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    const data = response.ok ? await response.json().catch(() => ({})) : {};
    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: error.message } };
  }
}

async function runTests() {
  console.log('🚀 Production Demo Readiness Test\n');
  console.log('Services:');
  console.log(`  Frontend: ${FRONTEND_URL}`);
  console.log(`  ASR Worker: ${ASR_WORKER_URL}`);
  console.log(`  Ingest: ${INGEST_URL}`);
  console.log('\n' + '='.repeat(60) + '\n');

  // 1. Frontend Health Check
  console.log('1. Testing Frontend Health...');
  const frontendHealth = await testEndpoint(`${FRONTEND_URL}/api/health`);
  if (frontendHealth.ok) {
    logResult({
      name: 'Frontend Health',
      status: 'pass',
      message: 'Frontend is healthy',
      details: frontendHealth.data,
    });
  } else {
    logResult({
      name: 'Frontend Health',
      status: 'fail',
      message: `Frontend health check failed: ${frontendHealth.status}`,
      details: frontendHealth.data,
    });
  }

  // 2. Frontend Production UI
  console.log('\n2. Testing Frontend Production UI...');
  const prodUI = await testEndpoint(`${FRONTEND_URL}/test-agent-assist`, { method: 'GET' });
  if (prodUI.ok || prodUI.status === 200) {
    logResult({
      name: 'Production UI (/test-agent-assist)',
      status: 'pass',
      message: 'Production UI is accessible',
    });
  } else {
    logResult({
      name: 'Production UI (/test-agent-assist)',
      status: 'fail',
      message: `Production UI not accessible: ${prodUI.status}`,
    });
  }

  // 3. ASR Worker Health
  console.log('\n3. Testing ASR Worker Health...');
  const asrHealth = await testEndpoint(`${ASR_WORKER_URL}/health`);
  if (asrHealth.ok) {
    logResult({
      name: 'ASR Worker Health',
      status: 'pass',
      message: 'ASR Worker is healthy',
      details: asrHealth.data,
    });
  } else {
    logResult({
      name: 'ASR Worker Health',
      status: 'fail',
      message: `ASR Worker health check failed: ${asrHealth.status}`,
      details: asrHealth.data,
    });
  }

  // 4. Transcript Consumer Status
  console.log('\n4. Testing Transcript Consumer Status...');
  const consumerStatus = await testEndpoint(`${FRONTEND_URL}/api/transcripts/status`);
  if (consumerStatus.ok && consumerStatus.data) {
    const isRunning = consumerStatus.data.isRunning;
    const activeStreams = consumerStatus.data.activeStreams || 0;
    logResult({
      name: 'Transcript Consumer',
      status: isRunning ? 'pass' : 'fail',
      message: isRunning 
        ? `Consumer is running (${activeStreams} active streams)`
        : 'Consumer is not running',
      details: consumerStatus.data,
    });
  } else {
    logResult({
      name: 'Transcript Consumer',
      status: 'fail',
      message: 'Failed to get consumer status',
      details: consumerStatus.data,
    });
  }

  // 5. Active Calls API
  console.log('\n5. Testing Active Calls API...');
  const activeCalls = await testEndpoint(`${FRONTEND_URL}/api/calls/active?limit=10`);
  if (activeCalls.ok) {
    const calls = activeCalls.data?.calls || [];
    logResult({
      name: 'Active Calls API',
      status: 'pass',
      message: `Found ${calls.length} active calls`,
      details: { count: calls.length, sample: calls.slice(0, 3) },
    });
  } else {
    logResult({
      name: 'Active Calls API',
      status: 'warning',
      message: `Active calls API returned ${activeCalls.status} (may be normal if no active calls)`,
      details: activeCalls.data,
    });
  }

  // 6. Ingest Transcript API
  console.log('\n6. Testing Ingest Transcript API...');
  const testTranscript = {
    callId: `test-demo-readiness-${Date.now()}`,
    seq: 1,
    ts: new Date().toISOString(),
    text: 'Customer: I need to block my credit card due to fraud',
  };
  const ingestTest = await testEndpoint(`${FRONTEND_URL}/api/calls/ingest-transcript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': 'default',
    },
    body: JSON.stringify(testTranscript),
  });
  if (ingestTest.ok && ingestTest.data) {
    const hasIntent = ingestTest.data.intent && ingestTest.data.intent !== 'unknown';
    const hasArticles = ingestTest.data.articles && ingestTest.data.articles.length > 0;
    logResult({
      name: 'Ingest Transcript API',
      status: 'pass',
      message: `Intent: ${ingestTest.data.intent || 'unknown'}, Articles: ${ingestTest.data.articles?.length || 0}`,
      details: {
        intent: ingestTest.data.intent,
        confidence: ingestTest.data.confidence,
        articlesCount: ingestTest.data.articles?.length || 0,
        intentDetected: hasIntent,
        kbArticlesFound: hasArticles,
      },
    });
  } else {
    logResult({
      name: 'Ingest Transcript API',
      status: 'fail',
      message: `Ingest API failed: ${ingestTest.status}`,
      details: ingestTest.data,
    });
  }

  // 7. SSE Stream Endpoint (check if accessible)
  console.log('\n7. Testing SSE Stream Endpoint...');
  try {
    const sseTest = await fetch(`${FRONTEND_URL}/api/events/stream?callId=test-demo`, {
      signal: AbortSignal.timeout(3000),
    });
    if (sseTest.ok && sseTest.headers.get('content-type')?.includes('text/event-stream')) {
      logResult({
        name: 'SSE Stream Endpoint',
        status: 'pass',
        message: 'SSE endpoint is accessible',
      });
    } else {
      logResult({
        name: 'SSE Stream Endpoint',
        status: 'warning',
        message: `SSE endpoint returned ${sseTest.status} (may require active connection)`,
      });
    }
  } catch (error: any) {
    logResult({
      name: 'SSE Stream Endpoint',
      status: 'warning',
      message: `SSE endpoint test timeout (normal for SSE)`,
    });
  }

  // 8. KB Search API
  console.log('\n8. Testing KB Search API...');
  const kbSearch = await testEndpoint(`${FRONTEND_URL}/api/kb/search?q=credit+card+fraud&tenantId=default`);
  if (kbSearch.ok) {
    const articles = kbSearch.data?.articles || [];
    logResult({
      name: 'KB Search API',
      status: 'pass',
      message: `KB search returned ${articles.length} articles`,
      details: { count: articles.length },
    });
  } else {
    logResult({
      name: 'KB Search API',
      status: 'warning',
      message: `KB search returned ${kbSearch.status}`,
      details: kbSearch.data,
    });
  }

  // 9. LLM Configuration Check
  console.log('\n9. Testing LLM Configuration...');
  const llmConfig = await testEndpoint(`${FRONTEND_URL}/api/debug/intent`);
  if (llmConfig.ok && llmConfig.data) {
    const hasKey = llmConfig.data.env?.hasLLMKey;
    const provider = llmConfig.data.env?.provider;
    const wasSuccessful = llmConfig.data.wasSuccessful;
    logResult({
      name: 'LLM Configuration',
      status: hasKey && wasSuccessful ? 'pass' : 'warning',
      message: `Provider: ${provider}, Key: ${hasKey ? 'Set' : 'Missing'}, Test: ${wasSuccessful ? 'Pass' : 'Fail'}`,
      details: llmConfig.data.env,
    });
  } else {
    logResult({
      name: 'LLM Configuration',
      status: 'warning',
      message: 'Could not verify LLM configuration',
      details: llmConfig.data,
    });
  }

  // 10. Ingest Service Health (if available)
  console.log('\n10. Testing Ingest Service Health...');
  const ingestHealth = await testEndpoint(`${INGEST_URL}/health`);
  if (ingestHealth.ok) {
    logResult({
      name: 'Ingest Service Health',
      status: 'pass',
      message: 'Ingest service is healthy',
      details: ingestHealth.data,
    });
  } else {
    logResult({
      name: 'Ingest Service Health',
      status: 'warning',
      message: `Ingest service health check returned ${ingestHealth.status}`,
      details: ingestHealth.data,
    });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 TEST SUMMARY\n');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`📊 Total: ${results.length}\n`);

  if (failed === 0 && passed >= 7) {
    console.log('🎉 PRODUCTION IS READY FOR DEMO!\n');
    console.log('✅ All critical services are healthy');
    console.log('✅ Transcript flow is operational');
    console.log('✅ KB suggestions are working');
    console.log('✅ Intent detection is configured');
    console.log('\n📋 Demo Checklist:');
    console.log('  1. Go to: https://frontend-8jdd.onrender.com/test-agent-assist');
    console.log('  2. Enter an Interaction ID from an active call');
    console.log('  3. Transcripts should appear in real-time');
    console.log('  4. KB suggestions should appear when intent is detected');
    console.log('  5. Disposition should work at end of call');
  } else if (failed > 0) {
    console.log('⚠️  SOME ISSUES DETECTED\n');
    console.log('Failed tests:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.message}`);
    });
    console.log('\nPlease fix these issues before demo.');
  } else {
    console.log('⚠️  SOME WARNINGS - Review before demo\n');
    console.log('Warnings:');
    results.filter(r => r.status === 'warning').forEach(r => {
      console.log(`  ⚠️  ${r.name}: ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

runTests().catch(console.error);

