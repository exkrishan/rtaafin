#!/usr/bin/env tsx
/**
 * Production Services Testing Script
 * Tests all deployed services on Render for demo readiness
 */

interface ServiceStatus {
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
  details?: any;
}

const SERVICES = {
  frontend: process.env.FRONTEND_URL || 'https://frontend-8jdd.onrender.com',
  asrWorker: process.env.ASR_WORKER_URL || 'https://rtaa-asr-worker.onrender.com',
  ingest: process.env.INGEST_URL || 'https://rtaa-ingest.onrender.com',
};

async function testService(name: string, url: string, path: string = '/health'): Promise<ServiceStatus> {
  const startTime = Date.now();
  try {
    const response = await fetch(`${url}${path}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    const responseTime = Date.now() - startTime;
    const data = await response.json().catch(() => ({}));
    
    if (response.ok) {
      return {
        name,
        url,
        status: 'healthy',
        responseTime,
        details: data,
      };
    } else {
      return {
        name,
        url,
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: data,
      };
    }
  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    return {
      name,
      url,
      status: 'unhealthy',
      responseTime,
      error: err.message || String(err),
    };
  }
}

async function testFrontendEndpoints(baseUrl: string): Promise<any> {
  const endpoints = [
    { path: '/api/health', name: 'Health Check' },
    { path: '/api/transcripts/status', name: 'Transcript Consumer Status' },
    { path: '/api/calls/active', name: 'Active Calls' },
    { path: '/test-agent-assist', name: 'Test Agent Assist Page' },
  ];
  
  const results: any = {};
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      const data = await response.json().catch(() => ({}));
      results[endpoint.name] = {
        status: response.ok ? 'ok' : 'error',
        statusCode: response.status,
        data: Object.keys(data).length > 0 ? data : null,
      };
    } catch (err: any) {
      results[endpoint.name] = {
        status: 'error',
        error: err.message,
      };
    }
  }
  
  return results;
}

async function testASRWorkerEndpoints(baseUrl: string): Promise<any> {
  const endpoints = [
    { path: '/health', name: 'Health Check' },
    { path: '/metrics', name: 'Metrics' },
  ];
  
  const results: any = {};
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      
      const data = await response.json().catch(() => ({}));
      results[endpoint.name] = {
        status: response.ok ? 'ok' : 'error',
        statusCode: response.status,
        data: Object.keys(data).length > 0 ? data : null,
      };
    } catch (err: any) {
      results[endpoint.name] = {
        status: 'error',
        error: err.message,
      };
    }
  }
  
  return results;
}

async function testIngestService(baseUrl: string): Promise<any> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    
    const data = await response.json().catch(() => ({}));
    return {
      status: response.ok ? 'ok' : 'error',
      statusCode: response.status,
      data: Object.keys(data).length > 0 ? data : null,
    };
  } catch (err: any) {
    return {
      status: 'error',
      error: err.message,
    };
  }
}

async function testTranscriptFlow(baseUrl: string): Promise<any> {
  // Test if we can send a transcript and see it in the system
  const testCallId = `test-${Date.now()}`;
  const testText = 'Customer: Hello, I need help with my credit card.';
  
  try {
    // Send a test transcript
    const response = await fetch(`${baseUrl}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: testCallId,
        seq: 1,
        ts: new Date().toISOString(),
        text: testText,
      }),
      signal: AbortSignal.timeout(10000),
    });
    
    const data = await response.json().catch(() => ({}));
    
    return {
      status: response.ok ? 'ok' : 'error',
      statusCode: response.status,
      intentDetected: data.intent && data.intent !== 'unknown',
      kbArticlesFound: Array.isArray(data.articles) && data.articles.length > 0,
      data: {
        intent: data.intent,
        confidence: data.confidence,
        articlesCount: data.articles?.length || 0,
      },
    };
  } catch (err: any) {
    return {
      status: 'error',
      error: err.message,
    };
  }
}

async function main() {
  console.log('🔍 Production Services Testing\n');
  console.log('=' .repeat(60));
  console.log('');
  
  // Test Frontend
  console.log('📱 Testing Frontend Service...');
  console.log(`   URL: ${SERVICES.frontend}`);
  const frontendHealth = await testService('Frontend', SERVICES.frontend, '/api/health');
  console.log(`   Status: ${frontendHealth.status === 'healthy' ? '✅' : '❌'} ${frontendHealth.status}`);
  if (frontendHealth.responseTime) {
    console.log(`   Response Time: ${frontendHealth.responseTime}ms`);
  }
  if (frontendHealth.error) {
    console.log(`   Error: ${frontendHealth.error}`);
  }
  console.log('');
  
  // Test Frontend Endpoints
  if (frontendHealth.status === 'healthy') {
    console.log('   Testing Frontend Endpoints...');
    const frontendEndpoints = await testFrontendEndpoints(SERVICES.frontend);
    for (const [name, result] of Object.entries(frontendEndpoints)) {
      const icon = result.status === 'ok' ? '✅' : '❌';
      console.log(`   ${icon} ${name}: ${result.status}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }
    console.log('');
  }
  
  // Test ASR Worker
  console.log('🎤 Testing ASR Worker Service...');
  console.log(`   URL: ${SERVICES.asrWorker}`);
  const asrHealth = await testService('ASR Worker', SERVICES.asrWorker, '/health');
  console.log(`   Status: ${asrHealth.status === 'healthy' ? '✅' : '❌'} ${asrHealth.status}`);
  if (asrHealth.responseTime) {
    console.log(`   Response Time: ${asrHealth.responseTime}ms`);
  }
  if (asrHealth.error) {
    console.log(`   Error: ${asrHealth.error}`);
  }
  console.log('');
  
  // Test ASR Worker Endpoints
  if (asrHealth.status === 'healthy') {
    console.log('   Testing ASR Worker Endpoints...');
    const asrEndpoints = await testASRWorkerEndpoints(SERVICES.asrWorker);
    for (const [name, result] of Object.entries(asrEndpoints)) {
      const icon = result.status === 'ok' ? '✅' : '❌';
      console.log(`   ${icon} ${name}: ${result.status}`);
      if (result.error) {
        console.log(`      Error: ${result.error}`);
      }
    }
    console.log('');
  }
  
  // Test Ingest Service
  console.log('📥 Testing Ingest Service...');
  console.log(`   URL: ${SERVICES.ingest}`);
  const ingestHealth = await testService('Ingest', SERVICES.ingest, '/health');
  console.log(`   Status: ${ingestHealth.status === 'healthy' ? '✅' : '❌'} ${ingestHealth.status}`);
  if (ingestHealth.responseTime) {
    console.log(`   Response Time: ${ingestHealth.responseTime}ms`);
  }
  if (ingestHealth.error) {
    console.log(`   Error: ${ingestHealth.error}`);
  }
  console.log('');
  
  // Test Transcript Flow
  if (frontendHealth.status === 'healthy') {
    console.log('🔄 Testing Transcript Flow...');
    const transcriptFlow = await testTranscriptFlow(SERVICES.frontend);
    console.log(`   Status: ${transcriptFlow.status === 'ok' ? '✅' : '❌'} ${transcriptFlow.status}`);
    if (transcriptFlow.intentDetected) {
      console.log(`   ✅ Intent Detection: Working (${transcriptFlow.data.intent}, confidence: ${transcriptFlow.data.confidence})`);
    } else {
      console.log(`   ⚠️  Intent Detection: Not working or returned 'unknown'`);
    }
    if (transcriptFlow.kbArticlesFound) {
      console.log(`   ✅ KB Articles: Found ${transcriptFlow.data.articlesCount} articles`);
    } else {
      console.log(`   ⚠️  KB Articles: None found`);
    }
    console.log('');
  }
  
  // Summary
  console.log('=' .repeat(60));
  console.log('📊 Summary');
  console.log('=' .repeat(60));
  console.log('');
  
  const allServices = [frontendHealth, asrHealth, ingestHealth];
  const healthyCount = allServices.filter(s => s.status === 'healthy').length;
  const totalCount = allServices.length;
  
  console.log(`Services Status: ${healthyCount}/${totalCount} healthy`);
  console.log('');
  
  if (healthyCount === totalCount) {
    console.log('✅ All services are healthy and ready for demo!');
  } else {
    console.log('⚠️  Some services are unhealthy. Check errors above.');
  }
  
  console.log('');
  console.log('🎯 Demo Readiness Checklist:');
  console.log('');
  console.log(`   ${frontendHealth.status === 'healthy' ? '✅' : '❌'} Frontend is accessible`);
  console.log(`   ${asrHealth.status === 'healthy' ? '✅' : '❌'} ASR Worker is running`);
  console.log(`   ${ingestHealth.status === 'healthy' ? '✅' : '❌'} Ingest Service is running`);
  
  if (frontendHealth.status === 'healthy') {
    const transcriptFlow = await testTranscriptFlow(SERVICES.frontend);
    console.log(`   ${transcriptFlow.status === 'ok' ? '✅' : '❌'} Transcript ingestion works`);
    console.log(`   ${transcriptFlow.intentDetected ? '✅' : '⚠️ '} Intent detection works`);
    console.log(`   ${transcriptFlow.kbArticlesFound ? '✅' : '⚠️ '} KB articles are available`);
  }
  
  console.log('');
  console.log('🔗 Demo URLs:');
  console.log(`   Test Agent Assist: ${SERVICES.frontend}/test-agent-assist`);
  console.log(`   Demo Page: ${SERVICES.frontend}/demo`);
  console.log('');
}

main().catch(console.error);

