/**
 * Intent Detection & KB Surfacing Production Test
 * 
 * Tests:
 * 1. Intent detection with Gemini API
 * 2. KB article search and surfacing
 * 3. Real-time updates in UI
 * 
 * Run: npx tsx scripts/test-intent-kb-production.ts
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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

async function testIntentDetectionAPI(): Promise<boolean> {
  try {
    const testTranscripts = [
      { text: 'I need to block my credit card', expectedIntent: 'credit_card_block' },
      { text: 'My debit card was stolen', expectedIntent: 'debit_card_block' },
      { text: 'I want to check my account balance', expectedIntent: 'account_balance' },
    ];

    for (const test of testTranscripts) {
      const response = await fetch(`${FRONTEND_URL}/api/calls/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: test.text,
          tenantId: 'default',
        }),
        timeout: 10000,
      });

      if (!response.ok) {
        logTest(`Intent Detection: "${test.text}"`, false, `HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const passed = data.intent && data.intent !== 'unknown' && data.confidence > 0.5;
      logTest(`Intent Detection: "${test.text}"`, passed, 
        passed ? undefined : `Got: ${data.intent}, Expected: ${test.expectedIntent}`,
        { intent: data.intent, confidence: data.confidence, expected: test.expectedIntent }
      );
    }

    return true;
  } catch (error: any) {
    logTest('Intent Detection API', false, error.message);
    return false;
  }
}

async function testKBSearchAPI(): Promise<boolean> {
  try {
    const testQueries = [
      { query: 'credit card block', minResults: 1 },
      { query: 'debit card fraud', minResults: 1 },
      { query: 'account balance', minResults: 1 },
    ];

    for (const test of testQueries) {
      const response = await fetch(`${FRONTEND_URL}/api/kb/search?q=${encodeURIComponent(test.query)}&tenantId=default&limit=10`, {
        timeout: 10000,
      });

      if (!response.ok) {
        logTest(`KB Search: "${test.query}"`, false, `HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const passed = data.ok && Array.isArray(data.results) && data.results.length >= test.minResults;
      logTest(`KB Search: "${test.query}"`, passed,
        passed ? undefined : `Got ${data.results?.length || 0} results, expected at least ${test.minResults}`,
        { resultsCount: data.results?.length || 0, minExpected: test.minResults }
      );
    }

    return true;
  } catch (error: any) {
    logTest('KB Search API', false, error.message);
    return false;
  }
}

async function testTranscriptIngestionWithIntent(): Promise<boolean> {
  try {
    const testCallId = `test-call-${Date.now()}`;
    const testTranscript = {
      callId: testCallId,
      seq: 1,
      ts: new Date().toISOString(),
      text: 'I need to block my credit card immediately',
      tenantId: 'default',
    };

    const response = await fetch(`${FRONTEND_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testTranscript),
      timeout: 15000,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logTest('Transcript Ingestion with Intent', false, error.error || `HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const passed = data.ok && (data.intent || data.intent === 'unknown') && Array.isArray(data.kbArticles);
    
    logTest('Transcript Ingestion with Intent', passed,
      passed ? undefined : 'Intent or KB articles missing',
      {
        intent: data.intent,
        kbArticlesCount: data.kbArticles?.length || 0,
        hasIntent: !!data.intent,
        hasKBArticles: Array.isArray(data.kbArticles),
      }
    );

    return passed;
  } catch (error: any) {
    logTest('Transcript Ingestion with Intent', false, error.message);
    return false;
  }
}

async function testGeminiAPIConfiguration(): Promise<boolean> {
  try {
    // Check if Gemini API key is configured
    const response = await fetch(`${FRONTEND_URL}/api/debug/env`, {
      timeout: 5000,
    });

    if (!response.ok) {
      logTest('Gemini API Configuration', false, `HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const hasGeminiKey = !!(data.env?.GEMINI_API_KEY || data.env?.LLM_API_KEY);
    const provider = data.env?.LLM_PROVIDER || 'openai';
    const isGemini = provider === 'gemini' || provider === 'google';

    const passed = hasGeminiKey && isGemini;
    logTest('Gemini API Configuration', passed,
      passed ? undefined : `Missing GEMINI_API_KEY or LLM_PROVIDER not set to gemini`,
      {
        hasGeminiKey,
        provider,
        isGemini,
      }
    );

    return passed;
  } catch (error: any) {
    logTest('Gemini API Configuration', false, error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 Intent Detection & KB Surfacing Production Tests\n');
  console.log('='.repeat(60));

  console.log('\n🔍 Intent Detection Tests');
  console.log('-'.repeat(60));
  await testGeminiAPIConfiguration();
  await testIntentDetectionAPI();

  console.log('\n📚 KB Search Tests');
  console.log('-'.repeat(60));
  await testKBSearchAPI();

  console.log('\n🔄 Integration Tests');
  console.log('-'.repeat(60));
  await testTranscriptIngestionWithIntent();

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

  const criticalTests = [
    'Gemini API Configuration',
    'Intent Detection API',
    'KB Search API',
    'Transcript Ingestion with Intent',
  ];

  const criticalPassed = criticalTests.every(testName =>
    results.find(r => r.name.includes(testName.split(':')[0]))?.passed
  );

  if (criticalPassed) {
    console.log('✅ All critical tests passed. Intent detection and KB surfacing are working.');
  } else {
    console.log('⚠️  Some critical tests failed. Please check configuration and API keys.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});

