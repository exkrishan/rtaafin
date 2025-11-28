/**
 * Test Script for External ASR API Integration
 * 
 * This script tests the new /api/transcripts/receive endpoint
 * by simulating an external ASR service sending transcripts.
 * 
 * Usage:
 *   npx tsx scripts/test-external-asr-api.ts
 * 
 * Environment:
 *   Set API_BASE_URL to test against deployed instance:
 *   API_BASE_URL=https://your-domain.com npx tsx scripts/test-external-asr-api.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TEST_CALL_ID = `test-external-asr-${Date.now()}`;

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

function logResult(test: string, passed: boolean, error?: string, duration?: number) {
  results.push({ test, passed, error, duration });
  const emoji = passed ? '✅' : '❌';
  const durationStr = duration ? ` (${duration}ms)` : '';
  console.log(`${emoji} ${test}${durationStr}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: Send a single transcript to the API
 */
async function testSendTranscript() {
  const startTime = Date.now();
  try {
    const response = await fetch(`${API_BASE_URL}/api/transcripts/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: TEST_CALL_ID,
        transcript: 'Hello, I need help with my billing account.',
        session_id: null,
        asr_service: 'Azure',
        timestamp: new Date().toISOString(),
        isFinal: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'API returned ok: false');
    }

    if (data.callId !== TEST_CALL_ID) {
      throw new Error(`CallId mismatch: expected ${TEST_CALL_ID}, got ${data.callId}`);
    }

    if (typeof data.seq !== 'number') {
      throw new Error('Seq number not returned');
    }

    logResult('Send Transcript', true, undefined, Date.now() - startTime);
    return data.seq;
  } catch (error: any) {
    logResult('Send Transcript', false, error.message, Date.now() - startTime);
    throw error;
  }
}

/**
 * Test 2: Send multiple transcripts in sequence
 */
async function testSendMultipleTranscripts() {
  const startTime = Date.now();
  try {
    const transcripts = [
      'Can you check my account balance?',
      'I was charged twice for the same transaction.',
      'The transaction was on November 15th.',
    ];

    const seqs: number[] = [];

    for (const transcript of transcripts) {
      const response = await fetch(`${API_BASE_URL}/api/transcripts/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: TEST_CALL_ID,
          transcript,
          session_id: null,
          asr_service: 'Azure',
          timestamp: new Date().toISOString(),
          isFinal: false,
        }),
      });

      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'API returned ok: false');
      }

      seqs.push(data.seq);
      await sleep(100); // Small delay between requests
    }

    // Verify seq numbers are incrementing
    for (let i = 1; i < seqs.length; i++) {
      if (seqs[i] <= seqs[i - 1]) {
        throw new Error(`Seq numbers not incrementing: ${seqs[i - 1]} -> ${seqs[i]}`);
      }
    }

    logResult('Send Multiple Transcripts', true, undefined, Date.now() - startTime);
  } catch (error: any) {
    logResult('Send Multiple Transcripts', false, error.message, Date.now() - startTime);
    throw error;
  }
}

/**
 * Test 3: Verify transcript retrieval from API
 */
async function testRetrieveTranscripts() {
  const startTime = Date.now();
  try {
    // Wait a bit for processing
    await sleep(2000);

    const response = await fetch(`${API_BASE_URL}/api/transcripts/latest?callId=${TEST_CALL_ID}`);
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'API returned ok: false');
    }

    if (!Array.isArray(data.transcripts)) {
      throw new Error('Transcripts not returned as array');
    }

    if (data.transcripts.length < 4) {
      throw new Error(`Expected at least 4 transcripts, got ${data.transcripts.length}`);
    }

    // Verify transcripts are ordered by seq
    for (let i = 1; i < data.transcripts.length; i++) {
      if (data.transcripts[i].seq <= data.transcripts[i - 1].seq) {
        throw new Error('Transcripts not ordered by seq');
      }
    }

    console.log(`   Retrieved ${data.transcripts.length} transcripts`);
    console.log(`   First transcript: "${data.transcripts[0].text.substring(0, 50)}..."`);
    
    if (data.intent && data.intent !== 'unknown') {
      console.log(`   Detected intent: ${data.intent} (confidence: ${data.confidence})`);
    }
    
    if (data.articles && data.articles.length > 0) {
      console.log(`   Found ${data.articles.length} KB articles`);
    }

    logResult('Retrieve Transcripts', true, undefined, Date.now() - startTime);
  } catch (error: any) {
    logResult('Retrieve Transcripts', false, error.message, Date.now() - startTime);
    throw error;
  }
}

/**
 * Test 4: Validate required fields
 */
async function testValidation() {
  const startTime = Date.now();
  try {
    // Test missing callId
    let response = await fetch(`${API_BASE_URL}/api/transcripts/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript: 'Test',
        timestamp: new Date().toISOString(),
        isFinal: false,
      }),
    });

    if (response.status !== 400) {
      throw new Error('Missing callId should return 400');
    }

    // Test missing transcript
    response = await fetch(`${API_BASE_URL}/api/transcripts/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: TEST_CALL_ID,
        timestamp: new Date().toISOString(),
        isFinal: false,
      }),
    });

    if (response.status !== 400) {
      throw new Error('Missing transcript should return 400');
    }

    // Test missing timestamp
    response = await fetch(`${API_BASE_URL}/api/transcripts/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: TEST_CALL_ID,
        transcript: 'Test',
        isFinal: false,
      }),
    });

    if (response.status !== 400) {
      throw new Error('Missing timestamp should return 400');
    }

    // Test missing isFinal
    response = await fetch(`${API_BASE_URL}/api/transcripts/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: TEST_CALL_ID,
        transcript: 'Test',
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.status !== 400) {
      throw new Error('Missing isFinal should return 400');
    }

    logResult('Validation', true, undefined, Date.now() - startTime);
  } catch (error: any) {
    logResult('Validation', false, error.message, Date.now() - startTime);
    throw error;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n🧪 Testing External ASR API Integration\n');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test Call ID: ${TEST_CALL_ID}\n`);

  try {
    // Run tests in sequence
    await testSendTranscript();
    await testSendMultipleTranscripts();
    await testRetrieveTranscripts();
    await testValidation();

    // Summary
    console.log('\n📊 Test Summary\n');
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ Some tests failed. See errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      console.log(`\nTest call data is stored with callId: ${TEST_CALL_ID}`);
      console.log(`View transcripts: ${API_BASE_URL}/api/transcripts/latest?callId=${TEST_CALL_ID}`);
    }
  } catch (error: any) {
    console.error('\n❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();

