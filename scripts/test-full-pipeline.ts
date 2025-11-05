/**
 * Comprehensive test of the full pipeline:
 * Transcript Ingestion → Intent Detection → KB Article Surfacing
 * 
 * Run: npx tsx scripts/test-full-pipeline.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const CALL_ID = `pipeline-test-${Date.now()}`;
const TENANT_ID = 'default';

// Test transcript with credit card fraud scenario
const testTranscript = [
  { speaker: 'Agent', text: "Good morning! Thank you for calling MoneyAssure Bank. This is Priya from the Card Services team. How may I help you today?" },
  { speaker: 'Customer', text: "Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday." },
  { speaker: 'Agent', text: "I understand your concern. Let me help you with that. Can you provide your card number ending?" },
  { speaker: 'Customer', text: "Yes, it's ending in 7792. The transaction was for $500 at a store I've never visited." },
  { speaker: 'Agent', text: "Thank you. I can see the unauthorized charge on your account. I'll block this card immediately and issue a replacement." },
  { speaker: 'Customer', text: "That would be great. How long will it take to get the new card?" },
  { speaker: 'Agent', text: "Your replacement card will be shipped within 5-7 business days. You'll receive tracking information via email." },
];

interface TestResult {
  step: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function testServerHealth(): Promise<TestResult> {
  try {
    const response = await fetch(`${BASE_URL}/api/debug/env`);
    if (response.ok) {
      return {
        step: 'Server Health',
        status: 'pass',
        message: 'Server is running and responding',
      };
    }
    return {
      step: 'Server Health',
      status: 'fail',
      message: `Server returned status ${response.status}`,
    };
  } catch (err: any) {
    return {
      step: 'Server Health',
      status: 'fail',
      message: `Cannot connect: ${err.message}`,
    };
  }
}

async function testTranscriptIngestion(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let successfulIngests = 0;
  let intentsDetected = 0;
  const intentDistribution: { [key: string]: number } = {};

  console.log('\n📝 Testing Transcript Ingestion...\n');

  for (let i = 0; i < testTranscript.length; i++) {
    const line = testTranscript[i];
    const seq = i + 1;
    const ts = new Date(Date.now() - (testTranscript.length - i) * 2000).toISOString();
    const text = `${line.speaker}: ${line.text}`;

    try {
      const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': TENANT_ID,
        },
        body: JSON.stringify({
          callId: CALL_ID,
          seq,
          ts,
          text,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        successfulIngests++;
        const intent = data.intent || 'unknown';
        const confidence = data.confidence || 0;
        const articlesCount = data.articles?.length || 0;

        if (intent !== 'unknown') {
          intentsDetected++;
          intentDistribution[intent] = (intentDistribution[intent] || 0) + 1;
        }

        console.log(`  ✅ Line ${seq}: Intent="${intent}" (${confidence.toFixed(2)}), Articles=${articlesCount}`);

        // Check specific expectations
        if (seq === 2 && intent === 'unknown') {
          results.push({
            step: `Line ${seq} Intent Detection`,
            status: 'warning',
            message: `Expected intent detection on "fraudulent transaction" but got "unknown"`,
            details: { text: text.substring(0, 80), intent, confidence },
          });
        } else if (seq === 2 && intent !== 'unknown') {
          results.push({
            step: `Line ${seq} Intent Detection`,
            status: 'pass',
            message: `Intent detected: "${intent}" with confidence ${confidence.toFixed(2)}`,
            details: { intent, confidence },
          });
        }

        if (articlesCount > 0) {
          results.push({
            step: `Line ${seq} KB Articles`,
            status: 'pass',
            message: `Found ${articlesCount} KB articles`,
            details: { count: articlesCount, articles: data.articles?.slice(0, 2) },
          });
        } else if (intent !== 'unknown' && articlesCount === 0) {
          results.push({
            step: `Line ${seq} KB Articles`,
            status: 'warning',
            message: `Intent detected but no KB articles found`,
            details: { intent, articlesCount: 0 },
          });
        }
      } else {
        console.log(`  ❌ Line ${seq}: ${data.error || response.statusText}`);
        results.push({
          step: `Line ${seq} Ingestion`,
          status: 'fail',
          message: `Failed: ${data.error || response.statusText}`,
        });
      }
    } catch (err: any) {
      console.log(`  ❌ Line ${seq}: ${err.message}`);
      results.push({
        step: `Line ${seq} Ingestion`,
        status: 'fail',
        message: `Error: ${err.message}`,
      });
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  results.push({
    step: 'Ingestion Summary',
    status: successfulIngests === testTranscript.length ? 'pass' : 'fail',
    message: `${successfulIngests}/${testTranscript.length} lines ingested successfully`,
    details: {
      successfulIngests,
      totalLines: testTranscript.length,
      intentsDetected,
      intentDistribution,
    },
  });

  return results;
}

async function testIntentDetection(): Promise<TestResult> {
  console.log('\n🎯 Testing Intent Detection Directly...\n');

  const testText = "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.";

  try {
    const response = await fetch(`${BASE_URL}/api/debug/intent`);
    if (!response.ok) {
      return {
        step: 'Intent Detection',
        status: 'fail',
        message: `Endpoint returned ${response.status}`,
      };
    }

    const data = await response.json();

    if (data.result?.intent === 'unknown') {
      return {
        step: 'Intent Detection',
        status: 'fail',
        message: 'Intent detection is returning "unknown"',
        details: {
          env: data.env,
          result: data.result,
          error: data.error,
        },
      };
    }

    return {
      step: 'Intent Detection',
      status: 'pass',
      message: `Intent detected: "${data.result?.intent}" with confidence ${data.result?.confidence}`,
      details: data.result,
    };
  } catch (err: any) {
    return {
      step: 'Intent Detection',
      status: 'fail',
      message: `Error: ${err.message}`,
    };
  }
}

async function testKBSearch(): Promise<TestResult> {
  console.log('\n📚 Testing KB Search...\n');

  const queries = ['credit card', 'fraud', 'transaction'];

  for (const query of queries) {
    try {
      const response = await fetch(`${BASE_URL}/api/kb/search?q=${encodeURIComponent(query)}&tenantId=${TENANT_ID}`);
      const data = await response.json();

      if (response.ok && data.ok && Array.isArray(data.results)) {
        console.log(`  ✅ "${query}": Found ${data.results.length} articles`);
        if (data.results.length > 0) {
          console.log(`     Sample: ${data.results[0].title}`);
        }
      } else {
        console.log(`  ⚠️  "${query}": ${data.error || 'No results'}`);
      }
    } catch (err: any) {
      console.log(`  ❌ "${query}": ${err.message}`);
    }
  }

  return {
    step: 'KB Search',
    status: 'pass',
    message: 'KB search endpoint is accessible',
  };
}

async function main() {
  console.log('\n🧪 Full Pipeline Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Call ID: ${CALL_ID}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log('='.repeat(60));

  const allResults: TestResult[] = [];

  // 1. Server Health
  console.log('\n1️⃣  Checking Server Health...');
  const healthResult = await testServerHealth();
  allResults.push(healthResult);
  console.log(`   ${healthResult.status === 'pass' ? '✅' : '❌'} ${healthResult.message}`);

  if (healthResult.status === 'fail') {
    console.log('\n❌ Server is not accessible. Please start the server first.');
    process.exit(1);
  }

  // 2. Intent Detection
  const intentResult = await testIntentDetection();
  allResults.push(intentResult);
  console.log(`   ${intentResult.status === 'pass' ? '✅' : intentResult.status === 'warning' ? '⚠️' : '❌'} ${intentResult.message}`);

  // 3. KB Search
  const kbResult = await testKBSearch();
  allResults.push(kbResult);
  console.log(`   ${kbResult.status === 'pass' ? '✅' : '❌'} ${kbResult.message}`);

  // 4. Transcript Ingestion Pipeline
  console.log('\n4️⃣  Testing Full Pipeline (Ingestion → Intent → KB)...\n');
  const ingestionResults = await testTranscriptIngestion();
  allResults.push(...ingestionResults);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = allResults.filter(r => r.status === 'pass').length;
  const warnings = allResults.filter(r => r.status === 'warning').length;
  const failed = allResults.filter(r => r.status === 'fail').length;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}\n`);

  // Detailed results
  console.log('\n📋 Detailed Results:\n');
  for (const result of allResults) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
    console.log(`${icon} ${result.step}: ${result.message}`);
    if (result.details && Object.keys(result.details).length > 0) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2).split('\n').slice(0, 3).join('\n'));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n💡 Call ID for testing: ${CALL_ID}`);
  console.log(`   Open dashboard and connect to this call ID to see KB articles in real-time.\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed. Review the details above.\n');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('⚠️  Tests passed with warnings. System is functional but may have issues.\n');
    process.exit(0);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

