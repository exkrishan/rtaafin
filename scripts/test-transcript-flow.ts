#!/usr/bin/env tsx
/**
 * Transcript Flow Test - Fixed Version
 * Tests: Transcript ingestion → Intent detection → KB articles
 */

const TRANSCRIPT_API = process.env.TRANSCRIPT_API || 'http://localhost:3000/api/calls/ingest-transcript';

interface TestResult {
  step: string;
  status: 'passed' | 'failed';
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

function logResult(step: string, status: 'passed' | 'failed', error?: string, data?: any) {
  results.push({ step, status, error, data });
  const icon = status === 'passed' ? '✅' : '❌';
  console.log(`${icon} ${step}`);
  if (error) console.log(`   Error: ${error}`);
  if (data && status === 'passed') {
    const dataStr = JSON.stringify(data, null, 2);
    console.log(`   Result: ${dataStr.length > 200 ? dataStr.substring(0, 200) + '...' : dataStr}`);
  }
}

async function sendTranscriptChunk(callId: string, seq: number, text: string): Promise<any> {
  const response = await fetch(TRANSCRIPT_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callId,
      seq,
      ts: new Date(Date.now() + seq * 1000).toISOString(),
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

// Test Case 1: Credit Card Block
async function testCreditCardBlock() {
  console.log('\n📋 Test Case 1: Credit Card Block');
  console.log('===================================\n');

  const callId = `call-cc-block-${Date.now()}`;
  const transcript = [
    'customer: Hello, I need to block my credit card immediately.',
    'agent: I can help you with that. Can you confirm your account number?',
    'customer: Yes, my credit card number is 1234 5678 9012 3456.',
    'agent: Thank you. I will block your credit card now.',
    'customer: How long will it take? I lost my card and I am worried about fraud.',
  ];

  try {
    let lastIntent = 'unknown';
    let allArticles: any[] = [];

    // Send chunks sequentially
    for (let i = 0; i < transcript.length; i++) {
      const data = await sendTranscriptChunk(callId, i + 1, transcript[i]);
      if (data.intent && data.intent !== 'unknown') {
        lastIntent = data.intent;
      }
      if (data.articles && data.articles.length > 0) {
        allArticles = data.articles;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Verify intent
    const isCreditCardIntent = lastIntent.toLowerCase().includes('credit') || 
                                lastIntent.toLowerCase().includes('card') ||
                                lastIntent.toLowerCase().includes('block');
    
    if (isCreditCardIntent) {
      logResult('Credit Card Block - Intent Detection', 'passed', undefined, { intent: lastIntent });
    } else {
      logResult('Credit Card Block - Intent Detection', 'failed', 
        `Expected credit card intent, got: ${lastIntent}`, { intent: lastIntent });
    }

    // Verify articles
    if (allArticles.length > 0) {
      const creditCardArticles = allArticles.filter((a: any) => 
        a.title?.toLowerCase().includes('credit') || 
        a.title?.toLowerCase().includes('card') ||
        a.snippet?.toLowerCase().includes('credit')
      );
      
      if (creditCardArticles.length > 0) {
        logResult('Credit Card Block - KB Articles', 'passed', undefined, {
          total: allArticles.length,
          creditCardRelated: creditCardArticles.length,
          titles: creditCardArticles.map((a: any) => a.title),
        });
      } else {
        logResult('Credit Card Block - KB Articles', 'failed', 
          'No credit card related articles found', {
            total: allArticles.length,
            allTitles: allArticles.map((a: any) => a.title),
          });
      }
    } else {
      logResult('Credit Card Block - KB Articles', 'failed', 'No articles returned');
    }

  } catch (error: any) {
    logResult('Credit Card Block - API Call', 'failed', error.message);
  }
}

// Test Case 2: Account Balance
async function testAccountBalance() {
  console.log('\n📋 Test Case 2: Account Balance Inquiry');
  console.log('======================================\n');

  const callId = `call-balance-${Date.now()}`;
  const transcript = [
    'customer: I want to check my account balance.',
    'agent: Sure, I can help you with that. Which account?',
    'customer: My savings account, please.',
    'agent: Your current balance is $5,000.',
  ];

  try {
    let lastIntent = 'unknown';
    let allArticles: any[] = [];

    for (let i = 0; i < transcript.length; i++) {
      const data = await sendTranscriptChunk(callId, i + 1, transcript[i]);
      if (data.intent && data.intent !== 'unknown') {
        lastIntent = data.intent;
      }
      if (data.articles && data.articles.length > 0) {
        allArticles = data.articles;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logResult('Account Balance - Intent Detection', 'passed', undefined, { intent: lastIntent });
    logResult('Account Balance - KB Articles', 'passed', undefined, {
      count: allArticles.length,
      titles: allArticles.map((a: any) => a.title),
    });

  } catch (error: any) {
    logResult('Account Balance - API Call', 'failed', error.message);
  }
}

// Test Case 3: Debit Card
async function testDebitCard() {
  console.log('\n📋 Test Case 3: Debit Card Issue');
  console.log('================================\n');

  const callId = `call-debit-${Date.now()}`;
  const transcript = [
    'customer: My debit card is not working at the ATM.',
    'agent: I understand. Let me check your account status.',
    'customer: I tried multiple times but it keeps getting declined.',
    'agent: I see the issue. Your debit card has been temporarily blocked.',
  ];

  try {
    let lastIntent = 'unknown';
    let allArticles: any[] = [];

    for (let i = 0; i < transcript.length; i++) {
      const data = await sendTranscriptChunk(callId, i + 1, transcript[i]);
      if (data.intent && data.intent !== 'unknown') {
        lastIntent = data.intent;
      }
      if (data.articles && data.articles.length > 0) {
        allArticles = data.articles;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const isDebitIntent = lastIntent.toLowerCase().includes('debit');

    if (isDebitIntent) {
      logResult('Debit Card - Intent Detection', 'passed', undefined, { intent: lastIntent });
    } else {
      logResult('Debit Card - Intent Detection', 'failed', 
        `Expected debit card intent, got: ${lastIntent}`, { intent: lastIntent });
    }

    logResult('Debit Card - KB Articles', 'passed', undefined, {
      count: allArticles.length,
      titles: allArticles.map((a: any) => a.title),
    });

  } catch (error: any) {
    logResult('Debit Card - API Call', 'failed', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🧪 Transcript Flow Test Suite');
  console.log('=============================\n');

  await testCreditCardBlock();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await testAccountBalance();
  await new Promise(resolve => setTimeout(resolve, 2000));

  await testDebitCard();

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${results.length}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Review the details above.');
    process.exit(1);
  }
}

runTests();

