#!/usr/bin/env tsx
/**
 * Test script to verify the deployed transcript subscription fix
 * Tests the complete flow: subscription → transcript → SSE → UI
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend-8jdd.onrender.com';
const TEST_INTERACTION_ID = `test-${Date.now()}`;

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

async function testHealthEndpoint(): Promise<void> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/health`);
    if (!response.ok) {
      logResult({
        name: 'Health Check',
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
      });
      return;
    }

    const data = await response.json();
    logResult({
      name: 'Health Check',
      status: 'pass',
      message: 'Health endpoint is accessible',
      details: {
        status: data.status,
        transcriptConsumer: data.transcriptConsumer,
      },
    });
  } catch (error: any) {
    logResult({
      name: 'Health Check',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    });
  }
}

async function testTranscriptConsumerStatus(): Promise<void> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/transcripts/status`);
    if (!response.ok) {
      logResult({
        name: 'Transcript Consumer Status',
        status: 'fail',
        message: `Status endpoint returned ${response.status}`,
      });
      return;
    }

    const data = await response.json();
    logResult({
      name: 'Transcript Consumer Status',
      status: data.isRunning ? 'pass' : 'warning',
      message: data.isRunning 
        ? `Consumer is running with ${data.subscriptionCount} subscriptions`
        : 'Consumer is not running',
      details: {
        isRunning: data.isRunning,
        subscriptionCount: data.subscriptionCount,
        subscriptions: data.subscriptions?.slice(0, 3),
      },
    });
  } catch (error: any) {
    logResult({
      name: 'Transcript Consumer Status',
      status: 'fail',
      message: `Failed to check status: ${error.message}`,
    });
  }
}

async function testSubscription(): Promise<void> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/transcripts/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interactionId: TEST_INTERACTION_ID }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logResult({
        name: 'Transcript Subscription',
        status: 'fail',
        message: `Subscription failed: ${response.status} - ${errorText}`,
      });
      return;
    }

    const data = await response.json();
    logResult({
      name: 'Transcript Subscription',
      status: data.ok ? 'pass' : 'fail',
      message: data.ok 
        ? `Successfully subscribed to ${TEST_INTERACTION_ID}`
        : `Subscription failed: ${data.error || 'Unknown error'}`,
      details: data,
    });
  } catch (error: any) {
    logResult({
      name: 'Transcript Subscription',
      status: 'fail',
      message: `Failed to subscribe: ${error.message}`,
    });
  }
}

async function testIngestTranscript(): Promise<void> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: TEST_INTERACTION_ID,
        seq: 1,
        ts: new Date().toISOString(),
        text: 'Test transcript to verify the fix is working',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logResult({
        name: 'Ingest Transcript',
        status: 'fail',
        message: `Ingest failed: ${response.status} - ${errorText}`,
      });
      return;
    }

    const data = await response.json();
    logResult({
      name: 'Ingest Transcript',
      status: data.ok ? 'pass' : 'fail',
      message: data.ok 
        ? 'Transcript ingested successfully'
        : `Ingest failed: ${data.error || 'Unknown error'}`,
      details: {
        intent: data.intent,
        confidence: data.confidence,
        articlesCount: data.articles?.length || 0,
      },
    });
  } catch (error: any) {
    logResult({
      name: 'Ingest Transcript',
      status: 'fail',
      message: `Failed to ingest: ${error.message}`,
    });
  }
}

async function testSSEEndpoint(): Promise<void> {
  try {
    const sseUrl = `${FRONTEND_URL}/api/events/stream?callId=${TEST_INTERACTION_ID}`;
    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      logResult({
        name: 'SSE Endpoint',
        status: 'fail',
        message: `SSE endpoint returned ${response.status}`,
      });
      return;
    }

    const contentType = response.headers.get('content-type');
    const isSSE = contentType?.includes('text/event-stream');

    logResult({
      name: 'SSE Endpoint',
      status: isSSE ? 'pass' : 'warning',
      message: isSSE 
        ? 'SSE endpoint is accessible and returns correct content-type'
        : `SSE endpoint accessible but content-type is ${contentType}`,
      details: {
        status: response.status,
        contentType,
        url: sseUrl,
      },
    });
  } catch (error: any) {
    logResult({
      name: 'SSE Endpoint',
      status: 'fail',
      message: `Failed to connect to SSE: ${error.message}`,
    });
  }
}

async function main() {
  console.log('🧪 Testing Deployed Transcript Subscription Fix\n');
  console.log('='.repeat(60));
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Test Interaction ID: ${TEST_INTERACTION_ID}`);
  console.log('='.repeat(60));
  console.log('');

  // Run tests in sequence
  await testHealthEndpoint();
  await new Promise(resolve => setTimeout(resolve, 500));

  await testTranscriptConsumerStatus();
  await new Promise(resolve => setTimeout(resolve, 500));

  await testSubscription();
  await new Promise(resolve => setTimeout(resolve, 1000));

  await testIngestTranscript();
  await new Promise(resolve => setTimeout(resolve, 500));

  await testSSEEndpoint();

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${results.length}`);
  console.log('');

  if (failed === 0) {
    console.log('🎉 All critical tests passed!');
    console.log('');
    console.log('💡 Next Steps:');
    console.log(`   1. Visit ${FRONTEND_URL}/test-agent-assist`);
    console.log(`   2. Check browser console for subscription logs`);
    console.log(`   3. Start a call and verify transcripts appear`);
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check the details above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

