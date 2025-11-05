/**
 * Comprehensive health check for the RTAA server
 * Run: npx tsx scripts/health-check.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: any;
}

async function checkServer(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/debug/env`);
    if (response.ok) {
      const data = await response.json();
      return {
        name: 'Server Status',
        status: 'pass',
        message: 'Server is running and responding',
        details: data,
      };
    } else {
      return {
        name: 'Server Status',
        status: 'fail',
        message: `Server returned status ${response.status}`,
      };
    }
  } catch (err: any) {
    return {
      name: 'Server Status',
      status: 'fail',
      message: `Cannot connect to server: ${err.message}`,
      details: { url: BASE_URL },
    };
  }
}

async function checkIntentDetection(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/debug/intent`);
    if (!response.ok) {
      const text = await response.text();
      return {
        name: 'Intent Detection',
        status: 'fail',
        message: `Endpoint returned ${response.status}`,
        details: { response: text.substring(0, 200) },
      };
    }
    
    const data = await response.json();
    if (data.result?.intent === 'unknown') {
      return {
        name: 'Intent Detection',
        status: 'warn',
        message: 'Intent detection is returning "unknown"',
        details: {
          env: data.env,
          result: data.result,
          error: data.error,
        },
      };
    }
    
    return {
      name: 'Intent Detection',
      status: 'pass',
      message: `Intent detection working: ${data.result?.intent}`,
      details: data.result,
    };
  } catch (err: any) {
    return {
      name: 'Intent Detection',
      status: 'fail',
      message: `Error: ${err.message}`,
    };
  }
}

async function checkIngestEndpoint(): Promise<HealthCheck> {
  try {
    const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: `health-check-${Date.now()}`,
        seq: 1,
        ts: new Date().toISOString(),
        text: 'Customer: Test message',
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return {
        name: 'Ingest Endpoint',
        status: 'fail',
        message: `Returned ${response.status}: ${data.error || 'Unknown error'}`,
        details: data,
      };
    }

    if (data.intent === 'unknown') {
      return {
        name: 'Ingest Endpoint',
        status: 'warn',
        message: 'Endpoint works but intent detection failing',
        details: data,
      };
    }

    return {
      name: 'Ingest Endpoint',
      status: 'pass',
      message: `Working: detected intent "${data.intent}"`,
      details: { intent: data.intent, confidence: data.confidence },
    };
  } catch (err: any) {
    return {
      name: 'Ingest Endpoint',
      status: 'fail',
      message: `Error: ${err.message}`,
    };
  }
}

async function checkEnvironment(): Promise<HealthCheck> {
  const hasLLMKey = !!process.env.LLM_API_KEY;
  const provider = process.env.LLM_PROVIDER || 'openai';
  
  return {
    name: 'Environment Variables',
    status: hasLLMKey ? 'pass' : 'fail',
    message: hasLLMKey 
      ? `LLM_API_KEY set, provider: ${provider}`
      : 'LLM_API_KEY is missing',
    details: {
      hasLLMKey,
      provider,
      geminiModel: process.env.GEMINI_MODEL || 'default',
    },
  };
}

async function main() {
  console.log('\n🏥 RTAA Server Health Check\n');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}\n`);

  const checks = [
    await checkServer(),
    await checkEnvironment(),
    await checkIntentDetection(),
    await checkIngestEndpoint(),
  ];

  console.log('\n📊 Results:\n');
  
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const check of checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${check.name}: ${check.message}`);
    
    if (check.details) {
      console.log(`   Details:`, JSON.stringify(check.details, null, 2).split('\n').slice(0, 3).join('\n'));
    }
    console.log('');

    if (check.status === 'pass') passCount++;
    else if (check.status === 'warn') warnCount++;
    else failCount++;
  }

  console.log('='.repeat(60));
  console.log(`\nSummary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed\n`);

  if (failCount > 0) {
    console.log('❌ Health check failed. Review the issues above.\n');
    process.exit(1);
  } else if (warnCount > 0) {
    console.log('⚠️  Health check passed with warnings. System is functional but may have issues.\n');
    process.exit(0);
  } else {
    console.log('✅ All health checks passed!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

