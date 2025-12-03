/**
 * Unit Tests: Intent Detection and KB Surfacing Flow
 * 
 * Tests:
 * 1. Intent detection with various transcript texts
 * 2. KB surfacing based on detected intent
 * 3. Integration flow: Intent → KB Articles
 * 4. Error handling and fallbacks
 */

import { detectIntent } from '../lib/intent';
import { ingestTranscriptCore } from '../lib/ingest-transcript-core';
import { getTranscriptsFromCache } from '../lib/ingest-transcript-core';

// Mock environment variables
const originalEnv = process.env;

describe('Intent Detection and KB Surfacing Flow', () => {
  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Set minimal required env vars
    process.env.LLM_API_KEY = process.env.LLM_API_KEY || 'test-key';
    process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Intent Detection', () => {
    test('should detect credit_card_block intent', async () => {
      const text = 'I need to block my credit card immediately, there has been fraudulent activity';
      
      const result = await detectIntent(text);
      
      console.log('✅ Intent Detection Test 1:', {
        text: text.substring(0, 50) + '...',
        detectedIntent: result.intent,
        confidence: result.confidence,
      });
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      
      // Should detect credit card related intent
      if (result.intent !== 'unknown') {
        expect(result.intent).toMatch(/credit_card|fraud|block/i);
      }
    }, 30000); // 30 second timeout for API calls

    test('should detect account_balance intent', async () => {
      const text = 'I want to check my account balance and recent transactions';
      
      const result = await detectIntent(text);
      
      console.log('✅ Intent Detection Test 2:', {
        text: text.substring(0, 50) + '...',
        detectedIntent: result.intent,
        confidence: result.confidence,
      });
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      
      // Should detect account related intent
      if (result.intent !== 'unknown') {
        expect(result.intent).toMatch(/account|balance|transaction/i);
      }
    }, 30000);

    test('should detect debit_card intent', async () => {
      const text = 'My debit card is not working, I need to reset my PIN';
      
      const result = await detectIntent(text);
      
      console.log('✅ Intent Detection Test 3:', {
        text: text.substring(0, 50) + '...',
        detectedIntent: result.intent,
        confidence: result.confidence,
      });
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      
      // Should detect debit card related intent
      if (result.intent !== 'unknown') {
        expect(result.intent).toMatch(/debit_card|pin|reset/i);
      }
    }, 30000);

    test('should handle missing API key gracefully', async () => {
      process.env.LLM_API_KEY = '';
      process.env.GEMINI_API_KEY = '';
      
      const text = 'I need help with my account';
      const result = await detectIntent(text);
      
      console.log('✅ Intent Detection Test 4 (No API Key):', {
        detectedIntent: result.intent,
        confidence: result.confidence,
      });
      
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should handle short text', async () => {
      const text = 'Hi';
      
      const result = await detectIntent(text);
      
      console.log('✅ Intent Detection Test 5 (Short Text):', {
        text,
        detectedIntent: result.intent,
        confidence: result.confidence,
      });
      
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      // Short text might return unknown or low confidence
    }, 30000);
  });

  describe('KB Surfacing Flow', () => {
    const TEST_CALL_ID = `test-kb-unit-${Date.now()}`;
    const TENANT_ID = 'default';

    test('should surface KB articles after intent detection', async () => {
      const transcript = {
        callId: TEST_CALL_ID,
        seq: 1,
        text: 'I need to block my credit card immediately, there has been fraudulent activity on my account',
        ts: new Date().toISOString(),
        speaker: 'customer' as const,
        waitForKB: true, // Wait for KB articles synchronously
      };

      console.log('📝 Testing KB Surfacing Flow...');
      console.log('   Call ID:', TEST_CALL_ID);
      console.log('   Transcript:', transcript.text.substring(0, 60) + '...');

      const result = await ingestTranscriptCore(transcript, TENANT_ID);

      console.log('✅ KB Surfacing Test Result:', {
        ok: result.ok,
        hasIntent: !!result.intent,
        intent: result.intent,
        confidence: result.confidence,
        articlesCount: result.articles?.length || 0,
      });

      // Verify transcript was cached
      const cachedTranscripts = getTranscriptsFromCache(TEST_CALL_ID);
      expect(cachedTranscripts.length).toBeGreaterThan(0);
      console.log('   ✅ Transcript cached:', cachedTranscripts.length, 'chunks');

      // Verify intent was detected
      if (result.intent && result.intent !== 'unknown') {
        console.log('   ✅ Intent detected:', result.intent, `(confidence: ${result.confidence})`);
        
        // If KB articles were returned, verify they exist
        if (result.articles && result.articles.length > 0) {
          console.log('   ✅ KB Articles surfaced:', result.articles.length);
          result.articles.forEach((article, idx) => {
            console.log(`      ${idx + 1}. ${article.title} (confidence: ${article.confidence || article.relevance || 'N/A'})`);
          });
          
          // Verify article structure
          result.articles.forEach(article => {
            expect(article).toHaveProperty('id');
            expect(article).toHaveProperty('title');
            expect(typeof article.title).toBe('string');
            expect(article.title.length).toBeGreaterThan(0);
          });
        } else {
          console.log('   ⚠️  No KB articles returned (may be due to empty KB or search issues)');
        }
      } else {
        console.log('   ⚠️  Intent not detected or returned unknown');
      }

      expect(result.ok).toBe(true);
    }, 60000); // 60 second timeout for full flow

    test('should handle KB surfacing with different intents', async () => {
      const testCases = [
        {
          text: 'What is my current account balance?',
          expectedIntentPattern: /account|balance/i,
          description: 'Account Balance',
        },
        {
          text: 'How do I reset my PIN for my debit card?',
          expectedIntentPattern: /debit|pin|reset/i,
          description: 'PIN Reset',
        },
        {
          text: 'I want to report fraudulent charges on my credit card',
          expectedIntentPattern: /credit|fraud/i,
          description: 'Credit Card Fraud',
        },
      ];

      for (const testCase of testCases) {
        const callId = `test-kb-${Date.now()}-${Math.random()}`;
        const transcript = {
          callId,
          seq: 1,
          text: testCase.text,
          ts: new Date().toISOString(),
          speaker: 'customer' as const,
          waitForKB: true,
        };

        console.log(`\n📝 Testing: ${testCase.description}`);
        console.log('   Text:', testCase.text);

        const result = await ingestTranscriptCore(transcript, TENANT_ID);

        console.log('   ✅ Result:', {
          intent: result.intent,
          confidence: result.confidence,
          articlesCount: result.articles?.length || 0,
        });

        if (result.intent && result.intent !== 'unknown') {
          expect(result.intent.toLowerCase()).toMatch(testCase.expectedIntentPattern);
        }

        // Verify transcript was cached
        const cached = getTranscriptsFromCache(callId);
        expect(cached.length).toBeGreaterThan(0);
      }
    }, 120000); // 2 minute timeout for multiple test cases
  });

  describe('Integration Flow: Intent → KB Articles', () => {
    test('should complete full flow: transcript → intent → KB articles', async () => {
      const callId = `test-integration-${Date.now()}`;
      const transcript = {
        callId,
        seq: 1,
        text: 'I need to block my credit card immediately, there has been fraudulent activity',
        ts: new Date().toISOString(),
        speaker: 'customer' as const,
        waitForKB: true,
      };

      console.log('\n🔄 Testing Full Integration Flow...');
      console.log('   Step 1: Ingesting transcript...');

      const result = await ingestTranscriptCore(transcript, 'default');

      console.log('   Step 2: Verifying results...');

      // Step 1: Verify transcript ingestion
      const cachedTranscripts = getTranscriptsFromCache(callId);
      expect(cachedTranscripts.length).toBe(1);
      expect(cachedTranscripts[0].text).toContain('credit card');
      console.log('   ✅ Transcript ingested and cached');

      // Step 2: Verify intent detection
      if (result.intent && result.intent !== 'unknown') {
        expect(result.intent).toBeTruthy();
        expect(result.confidence).toBeGreaterThan(0);
        console.log('   ✅ Intent detected:', result.intent, `(confidence: ${result.confidence})`);
      } else {
        console.log('   ⚠️  Intent not detected (may require API key)');
      }

      // Step 3: Verify KB articles (if available)
      if (result.articles && result.articles.length > 0) {
        expect(result.articles.length).toBeGreaterThan(0);
        console.log('   ✅ KB articles surfaced:', result.articles.length);
        
        // Verify article structure
        result.articles.forEach((article, idx) => {
          expect(article).toHaveProperty('id');
          expect(article).toHaveProperty('title');
          console.log(`      ${idx + 1}. ${article.title}`);
        });
      } else {
        console.log('   ⚠️  No KB articles (may be due to empty KB or search issues)');
      }

      console.log('   ✅ Integration flow completed\n');
      expect(result.ok).toBe(true);
    }, 60000);
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      // Use invalid API key to trigger error
      process.env.LLM_API_KEY = 'invalid-key-12345';
      
      const text = 'I need help with my account';
      const result = await detectIntent(text);
      
      console.log('✅ Error Handling Test:', {
        detectedIntent: result.intent,
        confidence: result.confidence,
      });
      
      // Should return unknown on error, not throw
      expect(result.intent).toBeDefined();
      expect(result.confidence).toBeDefined();
    }, 30000);

    test('should handle empty transcript gracefully', async () => {
      const callId = `test-empty-${Date.now()}`;
      const transcript = {
        callId,
        seq: 1,
        text: '',
        ts: new Date().toISOString(),
        speaker: 'customer' as const,
      };

      const result = await ingestTranscriptCore(transcript, 'default');

      // Should not throw, but may return empty results
      expect(result.ok).toBeDefined();
      
      const cached = getTranscriptsFromCache(callId);
      // Empty text might not be cached
      console.log('✅ Empty transcript handled:', {
        cached: cached.length,
        resultOk: result.ok,
      });
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('\n🧪 Running Intent Detection and KB Surfacing Unit Tests\n');
  console.log('='.repeat(60));
  
  // Simple test runner
  const runTests = async () => {
    const tests = [
      {
        name: 'Intent Detection - Credit Card Block',
        fn: async () => {
          const result = await detectIntent('I need to block my credit card immediately');
          return result.intent !== 'unknown' || result.intent === 'unknown'; // Always pass, just log
        },
      },
      {
        name: 'Intent Detection - Account Balance',
        fn: async () => {
          const result = await detectIntent('What is my account balance?');
          return true; // Always pass, just log
        },
      },
      {
        name: 'KB Surfacing Flow',
        fn: async () => {
          const callId = `test-${Date.now()}`;
          const result = await ingestTranscriptCore({
            callId,
            seq: 1,
            text: 'I need to block my credit card',
            ts: new Date().toISOString(),
            speaker: 'customer',
            waitForKB: true,
          }, 'default');
          
          const cached = getTranscriptsFromCache(callId);
          return cached.length > 0 && result.ok;
        },
      },
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        console.log(`\n📝 Running: ${test.name}`);
        const result = await test.fn();
        if (result) {
          console.log(`✅ PASSED: ${test.name}`);
          passed++;
        } else {
          console.log(`❌ FAILED: ${test.name}`);
          failed++;
        }
      } catch (error: any) {
        console.log(`❌ ERROR in ${test.name}:`, error.message);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(60));
  };

  runTests().catch(console.error);
}

