/**
 * Test script to debug intent detection and KB article surfacing
 * 
 * Usage:
 *   npx tsx scripts/test-intent-kb-flow.ts
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { detectIntent, normalizeIntent } from '../lib/intent';
import { getKbAdapter } from '../lib/kb-adapter';

async function testIntentDetection() {
  console.log('\n=== Testing Intent Detection ===\n');

  const testCases = [
    "I'm following up on my replacement Platinum Credit Card. I reported fraud a few days ago.",
    "I need help with a fraudulent transaction on my debit card.",
    "Can you help me reset my SIM card?",
    "I want to update my billing information.",
    "There's an unauthorized charge on my credit card.",
  ];

  for (const text of testCases) {
    console.log(`Testing: "${text.substring(0, 60)}..."`);
    try {
      const result = await detectIntent(text);
      const normalized = normalizeIntent(result.intent);
      console.log(`  → Intent: "${result.intent}"`);
      console.log(`  → Normalized: "${normalized}"`);
      console.log(`  → Confidence: ${result.confidence.toFixed(2)}\n`);
    } catch (err) {
      console.error(`  → Error: ${err}\n`);
    }
  }
}

async function testKBSearch() {
  console.log('\n=== Testing KB Search ===\n');

  const testQueries = [
    'credit_card_fraud',
    'credit_card',
    'card_transaction',
    'fraud',
    'sim_replacement',
    'account_security',
  ];

  const adapter = await getKbAdapter('default');

  for (const query of testQueries) {
    console.log(`Searching for: "${query}"`);
    try {
      const articles = await adapter.search(query, { max: 5 });
      console.log(`  → Found ${articles.length} articles:`);
      articles.forEach((article, idx) => {
        console.log(`    ${idx + 1}. ${article.title} (${article.source})`);
        if (article.snippet) {
          console.log(`       "${article.snippet.substring(0, 60)}..."`);
        }
      });
      console.log('');
    } catch (err) {
      console.error(`  → Error: ${err}\n`);
    }
  }
}

async function testFullFlow() {
  console.log('\n=== Testing Full Flow: Intent → KB Search ===\n');

  const testText = "I'm following up on my replacement Platinum Credit Card. I reported fraud a few days ago, and I haven't received any update on the delivery status.";

  console.log(`Input text: "${testText}"\n`);

  // Step 1: Detect intent
  console.log('Step 1: Detecting intent...');
  const intentResult = await detectIntent(testText);
  const normalizedIntent = normalizeIntent(intentResult.intent);
  console.log(`  → Intent: "${intentResult.intent}"`);
  console.log(`  → Normalized: "${normalizedIntent}"`);
  console.log(`  → Confidence: ${intentResult.confidence.toFixed(2)}\n`);

  // Step 2: Search KB with intent
  console.log(`Step 2: Searching KB with intent "${normalizedIntent}"...`);
  const adapter = await getKbAdapter('default');
  const articles = await adapter.search(normalizedIntent, { max: 5 });
  console.log(`  → Found ${articles.length} articles:\n`);
  articles.forEach((article, idx) => {
    console.log(`  ${idx + 1}. ${article.title}`);
    console.log(`     Source: ${article.source}`);
    if (article.snippet) {
      console.log(`     Snippet: "${article.snippet.substring(0, 80)}..."`);
    }
    console.log('');
  });

  // Step 3: Try expanded search terms
  console.log('\nStep 3: Testing expanded search terms...');
  const expandedTerms = [
    normalizedIntent,
    'credit_card',
    'fraud',
    'card_transaction',
    'card_security',
  ];

  for (const term of expandedTerms) {
    const results = await adapter.search(term, { max: 3 });
    console.log(`  "${term}": ${results.length} results`);
    if (results.length > 0) {
      console.log(`    → ${results[0].title}`);
    }
  }
}

async function main() {
  console.log('🔍 Testing Intent Detection and KB Article Surfacing\n');
  console.log('='.repeat(60));

  try {
    await testIntentDetection();
    await testKBSearch();
    await testFullFlow();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }

  console.log('\n✅ Testing complete!');
}

main();

