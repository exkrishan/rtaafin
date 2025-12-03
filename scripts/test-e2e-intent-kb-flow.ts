#!/usr/bin/env tsx
/**
 * End-to-End Flow Testing - Intent Detection and KB Article Flow
 * 
 * Tests the complete flow:
 * 1. Send transcript to API
 * 2. Verify intent detection (Gemini/OpenAI)
 * 3. Verify KB article search
 * 4. Verify SSE broadcast (if possible)
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

interface TestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

async function testIntentDetection(): Promise<TestResult> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const apiUrl = `${baseUrl}/api/calls/ingest-transcript`;

  const testTranscripts = [
    {
      text: "I need to block my credit card because it was stolen",
      expectedIntent: "credit_card_block",
      description: "Credit card block request",
    },
    {
      text: "I noticed a fraudulent transaction on my account yesterday",
      expectedIntent: "credit_card_fraud",
      description: "Fraudulent transaction report",
    },
    {
      text: "I want to check my account balance",
      expectedIntent: "account_balance",
      description: "Account balance inquiry",
    },
  ];

  console.log('🧪 Testing Intent Detection and KB Article Flow\n');
  console.log('='.repeat(60));
  console.log('');

  const results: TestResult[] = [];

  for (let i = 0; i < testTranscripts.length; i++) {
    const test = testTranscripts[i];
    console.log(`\n📋 Test ${i + 1}: ${test.description}`);
    console.log(`   Text: "${test.text}"`);
    console.log(`   Expected Intent: ${test.expectedIntent}`);
    console.log('');

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'test-tenant',
        },
        body: JSON.stringify({
          callId: `test-call-${Date.now()}-${i}`,
          seq: i + 1,
          ts: new Date().toISOString(),
          text: test.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        results.push({
          step: `Test ${i + 1}: API Call`,
          success: false,
          message: `API returned ${response.status}`,
          error: errorText,
        });
        console.log(`   ❌ API Error: ${response.status}`);
        console.log(`   ${errorText}`);
        continue;
      }

      const result = await response.json();
      
      console.log(`   ✅ API Response received`);
      console.log(`   Intent: ${result.intent}`);
      console.log(`   Confidence: ${result.confidence}`);
      console.log(`   Articles: ${result.articles?.length || 0}`);

      // Verify intent detection
      const intentMatch = result.intent && result.intent !== 'unknown';
      const confidenceGood = result.confidence && result.confidence > 0.5;

      results.push({
        step: `Test ${i + 1}: Intent Detection`,
        success: intentMatch && confidenceGood,
        message: intentMatch 
          ? `Intent detected: ${result.intent} (confidence: ${result.confidence})`
          : `Intent detection failed: ${result.intent || 'unknown'}`,
        data: {
          intent: result.intent,
          confidence: result.confidence,
          expectedIntent: test.expectedIntent,
          match: result.intent?.includes(test.expectedIntent.split('_')[0]) || false,
        },
      });

      // Verify KB articles
      const hasArticles = result.articles && Array.isArray(result.articles) && result.articles.length > 0;
      results.push({
        step: `Test ${i + 1}: KB Articles`,
        success: hasArticles,
        message: hasArticles
          ? `Found ${result.articles.length} KB articles`
          : 'No KB articles returned',
        data: {
          articleCount: result.articles?.length || 0,
          articles: result.articles?.slice(0, 3).map((a: any) => ({
            id: a.id,
            title: a.title,
            url: a.url,
          })) || [],
        },
      });

      if (hasArticles) {
        console.log(`   ✅ KB Articles found:`);
        result.articles.slice(0, 3).forEach((article: any, idx: number) => {
          console.log(`      ${idx + 1}. ${article.title || article.id}`);
        });
      } else {
        console.log(`   ⚠️  No KB articles returned`);
      }

      // Wait a bit between tests
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      results.push({
        step: `Test ${i + 1}: API Call`,
        success: false,
        message: 'Network or API error',
        error: error.message || String(error),
      });
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  return {
    step: 'Intent Detection Tests',
    success: results.every(r => r.success),
    message: `${results.filter(r => r.success).length}/${results.length} tests passed`,
    data: results,
  };
}

async function testSSEBroadcast(): Promise<TestResult> {
  console.log('\n📡 Testing SSE Broadcast\n');
  console.log('='.repeat(60));
  console.log('');

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const testCallId = `test-sse-${Date.now()}`;
  const sseUrl = `${baseUrl}/api/events/stream?callId=${testCallId}`;

  console.log(`SSE Endpoint: ${sseUrl}`);
  console.log('Note: SSE testing requires a browser or EventSource client');
  console.log('This test verifies the endpoint is accessible\n');

  try {
    // Just check if endpoint is accessible (SSE requires EventSource)
    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    if (response.ok || response.status === 200) {
      return {
        step: 'SSE Endpoint',
        success: true,
        message: 'SSE endpoint is accessible',
        data: {
          url: sseUrl,
          status: response.status,
        },
      };
    } else {
      return {
        step: 'SSE Endpoint',
        success: false,
        message: `SSE endpoint returned ${response.status}`,
        error: await response.text(),
      };
    }
  } catch (error: any) {
    return {
      step: 'SSE Endpoint',
      success: false,
      message: 'SSE endpoint not accessible',
      error: error.message || String(error),
    };
  }
}

async function main() {
  console.log('🚀 End-to-End Flow Testing - Intent & KB Articles\n');
  console.log('='.repeat(60));
  console.log('');

  // Check environment
  const hasApiKey = !!process.env.LLM_API_KEY;
  const provider = process.env.LLM_PROVIDER || 'openai';
  
  console.log('📋 Configuration:');
  console.log(`   LLM_API_KEY: ${hasApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   LLM_PROVIDER: ${provider}`);
  console.log(`   Base URL: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}`);
  console.log('');

  if (!hasApiKey) {
    console.log('❌ LLM_API_KEY is required for intent detection');
    console.log('   Set it in .env.local: LLM_API_KEY=your-key');
    process.exit(1);
  }

  // Test intent detection
  const intentResult = await testIntentDetection();

  // Test SSE endpoint
  const sseResult = await testSSEBroadcast();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary\n');

  const allResults = [intentResult, sseResult];
  const passed = allResults.filter(r => r.success).length;
  const total = allResults.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log('');

  if (intentResult.data) {
    console.log('Intent Detection Details:');
    intentResult.data.forEach((r: TestResult) => {
      const icon = r.success ? '✅' : '❌';
      console.log(`   ${icon} ${r.step}: ${r.message}`);
    });
  }

  console.log('');
  console.log(`   ${sseResult.success ? '✅' : '❌'} ${sseResult.step}: ${sseResult.message}`);

  console.log('\n' + '='.repeat(60));
  console.log('');

  if (passed === total) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Review the output above.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


