/**
 * Complete Flow Unit Test
 * 
 * Tests the entire pipeline:
 * 1. Transcript Ingestion
 * 2. Intent Detection (Gemini LLM)
 * 3. KB Article Surfacing
 * 4. Disposition Generation
 * 
 * Usage:
 *   npx tsx tests/complete-flow.test.ts
 * 
 * Environment Variables Required:
 *   - GEMINI_API_KEY (for intent detection)
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - REDIS_URL (optional, for transcript storage)
 */

import path from 'path';
import dotenv from 'dotenv';

// Load environment variables first
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

// Disable TranscriptConsumer auto-start during tests
process.env.DISABLE_TRANSCRIPT_CONSUMER = 'true';

// Import after env vars are loaded
import { ingestTranscriptCore } from '../lib/ingest-transcript-core';
import { generateCallSummary } from '../lib/summary';
import { detectIntent } from '../lib/intent';
import { getKbAdapter } from '../lib/kb-adapter';

interface TestResult {
  stage: string;
  passed: boolean;
  error?: string;
  data?: any;
  duration?: number;
}

class CompleteFlowTest {
  private results: TestResult[] = [];
  private testCallId: string;

  constructor() {
    this.testCallId = `test-call-${Date.now()}`;
  }

  private logResult(result: TestResult) {
    this.results.push(result);
    const status = result.passed ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration.toFixed(2)}ms)` : '';
    console.log(`${status} ${result.stage}${duration}`);
    if (result.error) {
      console.error(`   Error: ${result.error}`);
    }
    if (result.data && !result.passed) {
      console.error(`   Data:`, JSON.stringify(result.data, null, 2));
    }
  }

  /**
   * Test 1: Transcript Ingestion
   */
  async testTranscriptIngestion(): Promise<TestResult> {
    const startTime = Date.now();
    const stage = 'Transcript Ingestion';

    try {
      const transcriptText = "I need to block my credit card because it was stolen";
      
      const result = await ingestTranscriptCore({
        callId: this.testCallId,
        seq: 1,
        ts: new Date().toISOString(),
        text: transcriptText,
        tenantId: 'default',
        waitForKB: true, // Wait for KB articles synchronously for testing
      });

      const duration = Date.now() - startTime;

      if (!result.ok) {
        return {
          stage,
          passed: false,
          error: result.error || 'Ingestion failed',
          duration,
        };
      }

      return {
        stage,
        passed: true,
        data: {
          intent: result.intent,
          confidence: result.confidence,
          articlesCount: result.articles?.length || 0,
        },
        duration,
      };
    } catch (error: any) {
      return {
        stage,
        passed: false,
        error: error.message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Test 2: Intent Detection
   */
  async testIntentDetection(): Promise<TestResult> {
    const startTime = Date.now();
    const stage = 'Intent Detection';

    try {
      // Test case 1: Credit card block
      const testCases = [
        {
          text: "I need to block my credit card because it was stolen",
          expectedIntent: 'credit_card_block',
        },
        {
          text: "I want to check my account balance",
          expectedIntent: 'account_balance',
        },
        {
          text: "My debit card is not working",
          expectedIntent: 'debit_card',
        },
      ];

      const results = [];
      for (const testCase of testCases) {
        const intentResult = await detectIntent(testCase.text);
        results.push({
          text: testCase.text.substring(0, 50),
          detected: intentResult.intent,
          expected: testCase.expectedIntent,
          confidence: intentResult.confidence,
          match: intentResult.intent.includes(testCase.expectedIntent.split('_')[0]) || 
                 testCase.expectedIntent.includes(intentResult.intent.split('_')[0]),
        });
      }

      const allPassed = results.every(r => r.match && r.confidence > 0.5);
      const duration = Date.now() - startTime;

      return {
        stage,
        passed: allPassed,
        data: {
          results,
          allPassed,
        },
        duration,
      };
    } catch (error: any) {
      return {
        stage,
        passed: false,
        error: error.message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Test 3: KB Article Surfacing
   */
  async testKBArticleSurfacing(): Promise<TestResult> {
    const startTime = Date.now();
    const stage = 'KB Article Surfacing';

    try {
      const kbAdapter = await getKbAdapter('default');
      
      // Test searches with different intents
      const searchQueries = [
        'credit card block',
        'account balance',
        'debit card',
      ];

      const results = [];
      for (const query of searchQueries) {
        const articles = await kbAdapter.search(query, {
          tenantId: 'default',
          max: 5,
        });
        
        results.push({
          query,
          articlesFound: articles.length,
          articles: articles.slice(0, 2).map(a => ({
            id: a.id,
            title: a.title.substring(0, 50),
            confidence: a.confidence,
          })),
        });
      }

      const hasResults = results.some(r => r.articlesFound > 0);
      const duration = Date.now() - startTime;

      return {
        stage,
        passed: hasResults,
        data: {
          results,
          hasResults,
        },
        duration,
      };
    } catch (error: any) {
      return {
        stage,
        passed: false,
        error: error.message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Test 4: Disposition Generation
   */
  async testDispositionGeneration(): Promise<TestResult> {
    const startTime = Date.now();
    const stage = 'Disposition Generation';

    try {
      // First, ingest a transcript to ensure we have data
      const transcriptText = `Customer: I need to block my credit card because I noticed some unauthorized charges on my statement.
Agent: I can help you with that. Let me verify your account first.
Customer: Sure, my account number is 123456789.
Agent: Thank you. I can see there are three unauthorized transactions totaling $450. I'll block your card immediately and issue a new one.
Customer: How long will it take to get the new card?
Agent: It will be shipped within 3-5 business days. In the meantime, I'll also help you dispute those charges.
Customer: That would be great. Thank you for your help.`;

      // Ingest transcript
      await ingestTranscriptCore({
        callId: this.testCallId,
        seq: 1,
        ts: new Date().toISOString(),
        text: transcriptText,
        tenantId: 'default',
      });

      // Wait a bit for intent detection to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate disposition
      const summaryResult = await generateCallSummary(this.testCallId, 'default');

      const duration = Date.now() - startTime;

      if (!summaryResult.ok) {
        return {
          stage,
          passed: false,
          error: summaryResult.error || 'Disposition generation failed',
          duration,
        };
      }

      const hasDispositions = summaryResult.mappedDispositions && summaryResult.mappedDispositions.length > 0;
      const hasSummary = summaryResult.summary && (
        summaryResult.summary.issue || 
        summaryResult.summary.resolution || 
        summaryResult.summary.next_steps
      );

      return {
        stage,
        passed: hasDispositions && hasSummary,
        data: {
          hasDispositions,
          hasSummary,
          dispositionsCount: summaryResult.mappedDispositions?.length || 0,
          summary: {
            hasIssue: !!summaryResult.summary?.issue,
            hasResolution: !!summaryResult.summary?.resolution,
            hasNextSteps: !!summaryResult.summary?.next_steps,
          },
        },
        duration,
      };
    } catch (error: any) {
      return {
        stage,
        passed: false,
        error: error.message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Test 5: Complete End-to-End Flow
   */
  async testCompleteFlow(): Promise<TestResult> {
    const startTime = Date.now();
    const stage = 'Complete End-to-End Flow';

    try {
      const flowCallId = `flow-test-${Date.now()}`;
      const transcriptLines = [
        "Customer: Hello, I need help with my credit card.",
        "Agent: I'd be happy to help. What seems to be the issue?",
        "Customer: I noticed some unauthorized charges on my statement. I want to block my card.",
        "Agent: I understand your concern. Let me verify your account and block the card immediately.",
        "Customer: Thank you. How long will it take to get a new card?",
        "Agent: We'll ship a new card within 3-5 business days. I'll also help you dispute those charges.",
      ];

      // Step 1: Ingest transcripts sequentially
      const ingestionResults = [];
      for (let i = 0; i < transcriptLines.length; i++) {
        const result = await ingestTranscriptCore({
          callId: flowCallId,
          seq: i + 1,
          ts: new Date().toISOString(),
          text: transcriptLines[i],
          tenantId: 'default',
          waitForKB: i === transcriptLines.length - 1, // Wait for KB on last transcript
        });
        ingestionResults.push({
          seq: i + 1,
          ok: result.ok,
          intent: result.intent,
          articlesCount: result.articles?.length || 0,
        });
      }

      // Step 2: Wait for async intent detection
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Step 3: Generate disposition
      const summaryResult = await generateCallSummary(flowCallId, 'default');

      const duration = Date.now() - startTime;

      const allIngested = ingestionResults.every(r => r.ok);
      const hasIntent = ingestionResults.some(r => r.intent && r.intent !== 'unknown');
      const hasKB = ingestionResults.some(r => r.articlesCount > 0);
      const hasDisposition = summaryResult.ok && summaryResult.mappedDispositions && summaryResult.mappedDispositions.length > 0;

      return {
        stage,
        passed: allIngested && hasIntent && hasKB && hasDisposition,
        data: {
          allIngested,
          hasIntent,
          hasKB,
          hasDisposition,
          ingestionResults,
          dispositionCount: summaryResult.mappedDispositions?.length || 0,
        },
        duration,
      };
    } catch (error: any) {
      return {
        stage,
        passed: false,
        error: error.message || String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('\n🧪 Complete Flow Unit Test');
    console.log('='.repeat(70));
    console.log(`Test Call ID: ${this.testCallId}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(70));
    console.log('');

    // Check prerequisites
    if (!process.env.GEMINI_API_KEY && !process.env.LLM_API_KEY) {
      console.error('❌ Missing GEMINI_API_KEY or LLM_API_KEY environment variable');
      console.error('   Intent detection will not work without an API key');
      process.exit(1);
    }

    // Stop TranscriptConsumer if it's running (from instrumentation)
    try {
      const { stopTranscriptConsumer } = await import('../lib/transcript-consumer');
      await stopTranscriptConsumer();
      console.log('✅ Stopped TranscriptConsumer for clean test environment\n');
    } catch (error) {
      // Ignore errors - consumer might not be running
    }

    // Run tests sequentially
    console.log('📝 Running tests...\n');

    await this.testTranscriptIngestion();
    await this.testIntentDetection();
    await this.testKBArticleSurfacing();
    await this.testDispositionGeneration();
    await this.testCompleteFlow();

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Test Summary');
    console.log('='.repeat(70));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('');

    // Print detailed results
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      const duration = result.duration ? ` (${result.duration.toFixed(2)}ms)` : '';
      console.log(`${index + 1}. ${status} ${result.stage}${duration}`);
      if (result.data && Object.keys(result.data).length > 0) {
        console.log(`   Data:`, JSON.stringify(result.data, null, 2).split('\n').slice(0, 5).join('\n'));
      }
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(70));

    if (failed > 0) {
      console.error(`\n❌ ${failed} test(s) failed. Please review the errors above.`);
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const test = new CompleteFlowTest();
  
  // Set timeout for the entire test suite (5 minutes)
  const timeout = setTimeout(() => {
    console.error('\n❌ Test suite timed out after 5 minutes');
    process.exit(1);
  }, 5 * 60 * 1000);

  test.runAllTests()
    .then(() => {
      clearTimeout(timeout);
      // Cleanup: Stop TranscriptConsumer if it was started
      import('../lib/transcript-consumer')
        .then(({ stopTranscriptConsumer }) => stopTranscriptConsumer())
        .catch(() => {}) // Ignore cleanup errors
        .finally(() => process.exit(0));
    })
    .catch(error => {
      clearTimeout(timeout);
      console.error('Fatal error running tests:', error);
      // Cleanup on error
      import('../lib/transcript-consumer')
        .then(({ stopTranscriptConsumer }) => stopTranscriptConsumer())
        .catch(() => {}) // Ignore cleanup errors
        .finally(() => process.exit(1));
    });
}

export { CompleteFlowTest };

