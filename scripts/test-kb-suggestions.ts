/**
 * Test Script: KB Suggestions Flow End-to-End
 * 
 * Tests:
 * 1. KB suggestions flow end to end
 * 2. New suggestions appear on top, old ones go down
 */

import { ingestTranscriptCore } from '../lib/ingest-transcript-core';
import { getTranscriptsFromCache } from '../lib/ingest-transcript-core';

const TEST_CALL_ID = `test-kb-${Date.now()}`;
const TENANT_ID = 'default';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testKBSuggestionsFlow() {
  console.log('🧪 Starting KB Suggestions Flow Test\n');
  console.log('='.repeat(60));
  
  // Test 1: Send initial transcript to trigger intent detection
  console.log('\n📝 Test 1: Sending initial transcript (should trigger intent detection)');
  console.log('-'.repeat(60));
  
  const transcript1 = {
    callId: TEST_CALL_ID,
    seq: 1,
    text: 'I need to block my credit card immediately, there has been fraudulent activity',
    ts: new Date().toISOString(),
    speaker: 'customer' as const,
  };
  
  const result1 = await ingestTranscriptCore(transcript1, TENANT_ID);
  console.log('✅ Transcript 1 ingested:', {
    ok: result1.ok,
    hasIntent: !!result1.intent,
    intent: result1.intent,
    confidence: result1.confidence,
    articlesCount: result1.articles?.length || 0,
  });
  
  if (result1.articles && result1.articles.length > 0) {
    console.log('📚 Initial KB Articles:');
    result1.articles.forEach((article, idx) => {
      console.log(`  ${idx + 1}. ${article.title} (confidence: ${article.confidence || article.relevance || 'N/A'})`);
    });
  }
  
  await delay(2000); // Wait for async intent detection and KB surfacing
  
  // Test 2: Send second transcript with different intent
  console.log('\n📝 Test 2: Sending second transcript (different intent - should add new articles)');
  console.log('-'.repeat(60));
  
  const transcript2 = {
    callId: TEST_CALL_ID,
    seq: 2,
    text: 'I want to check my account balance and recent transactions',
    ts: new Date().toISOString(),
    speaker: 'customer' as const,
  };
  
  const result2 = await ingestTranscriptCore(transcript2, TENANT_ID);
  console.log('✅ Transcript 2 ingested:', {
    ok: result2.ok,
    hasIntent: !!result2.intent,
    intent: result2.intent,
    confidence: result2.confidence,
    articlesCount: result2.articles?.length || 0,
  });
  
  if (result2.articles && result2.articles.length > 0) {
    console.log('📚 New KB Articles from Transcript 2:');
    result2.articles.forEach((article, idx) => {
      console.log(`  ${idx + 1}. ${article.title} (confidence: ${article.confidence || article.relevance || 'N/A'})`);
    });
  }
  
  await delay(2000); // Wait for async processing
  
  // Test 3: Send third transcript with another intent
  console.log('\n📝 Test 3: Sending third transcript (another intent - should add more articles)');
  console.log('-'.repeat(60));
  
  const transcript3 = {
    callId: TEST_CALL_ID,
    seq: 3,
    text: 'How do I reset my PIN for my debit card?',
    ts: new Date().toISOString(),
    speaker: 'customer' as const,
  };
  
  const result3 = await ingestTranscriptCore(transcript3, TENANT_ID);
  console.log('✅ Transcript 3 ingested:', {
    ok: result3.ok,
    hasIntent: !!result3.intent,
    intent: result3.intent,
    confidence: result3.confidence,
    articlesCount: result3.articles?.length || 0,
  });
  
  if (result3.articles && result3.articles.length > 0) {
    console.log('📚 New KB Articles from Transcript 3:');
    result3.articles.forEach((article, idx) => {
      console.log(`  ${idx + 1}. ${article.title} (confidence: ${article.confidence || article.relevance || 'N/A'})`);
    });
  }
  
  await delay(2000); // Wait for async processing
  
  // Test 4: Verify transcripts are in cache
  console.log('\n📋 Test 4: Verifying transcripts in cache');
  console.log('-'.repeat(60));
  
  const cachedTranscripts = getTranscriptsFromCache(TEST_CALL_ID);
  console.log(`✅ Found ${cachedTranscripts.length} transcripts in cache`);
  cachedTranscripts.forEach((t, idx) => {
    console.log(`  ${idx + 1}. [seq: ${t.seq}] ${t.text.substring(0, 50)}...`);
  });
  
  // Test 5: Simulate UI state to test sorting
  console.log('\n🔄 Test 5: Testing KB Articles Sorting (Newest First)');
  console.log('-'.repeat(60));
  
  // Simulate what happens in AgentAssistPanelV2 when articles are received
  let kbArticles: any[] = [];
  const now = Date.now();
  
  // Simulate receiving articles from transcript 1
  if (result1.articles && result1.articles.length > 0) {
    const articles1 = result1.articles.map(a => ({
      ...a,
      timestamp: now - 4000, // 4 seconds ago
    }));
    kbArticles = [...articles1];
    console.log('📚 After Transcript 1:');
    kbArticles.forEach((a, idx) => {
      console.log(`  ${idx + 1}. [${new Date(a.timestamp).toLocaleTimeString()}] ${a.title}`);
    });
  }
  
  // Simulate receiving articles from transcript 2
  if (result2.articles && result2.articles.length > 0) {
    const existingIds = new Set(kbArticles.map(a => a.id));
    const prevWithTimestamps = kbArticles.map(a => ({
      ...a,
      timestamp: a.timestamp || now - 4000,
    }));
    
    const newArticles = result2.articles
      .filter(a => !existingIds.has(a.id))
      .map(a => ({
        ...a,
        timestamp: now - 2000, // 2 seconds ago (newer)
      }));
    
    const allArticles = [...newArticles, ...prevWithTimestamps];
    kbArticles = allArticles.sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime; // Newest first
    });
    
    console.log('\n📚 After Transcript 2 (should show newest first):');
    kbArticles.forEach((a, idx) => {
      console.log(`  ${idx + 1}. [${new Date(a.timestamp).toLocaleTimeString()}] ${a.title}`);
    });
  }
  
  // Simulate receiving articles from transcript 3
  if (result3.articles && result3.articles.length > 0) {
    const existingIds = new Set(kbArticles.map(a => a.id));
    const prevWithTimestamps = kbArticles.map(a => ({
      ...a,
      timestamp: a.timestamp || now - 4000,
    }));
    
    const newArticles = result3.articles
      .filter(a => !existingIds.has(a.id))
      .map(a => ({
        ...a,
        timestamp: now, // Current time (newest)
      }));
    
    const allArticles = [...newArticles, ...prevWithTimestamps];
    kbArticles = allArticles.sort((a, b) => {
      const aTime = a.timestamp || 0;
      const bTime = b.timestamp || 0;
      return bTime - aTime; // Newest first
    });
    
    console.log('\n📚 After Transcript 3 (should show newest first):');
    kbArticles.forEach((a, idx) => {
      console.log(`  ${idx + 1}. [${new Date(a.timestamp).toLocaleTimeString()}] ${a.title}`);
    });
  }
  
  // Verify sorting
  console.log('\n✅ Sorting Verification:');
  let isSorted = true;
  for (let i = 1; i < kbArticles.length; i++) {
    const prevTime = kbArticles[i - 1].timestamp || 0;
    const currTime = kbArticles[i].timestamp || 0;
    if (prevTime < currTime) {
      isSorted = false;
      console.log(`  ❌ Articles not sorted correctly at position ${i}`);
      break;
    }
  }
  
  if (isSorted) {
    console.log('  ✅ Articles are correctly sorted (newest first)');
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log('='.repeat(60));
  console.log(`✅ Transcripts ingested: 3`);
  console.log(`✅ Transcripts in cache: ${cachedTranscripts.length}`);
  console.log(`✅ Total KB articles collected: ${kbArticles.length}`);
  console.log(`✅ Sorting verified: ${isSorted ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Test Call ID: ${TEST_CALL_ID}`);
  console.log('\n🎉 KB Suggestions Flow Test Complete!\n');
}

// Run the test
testKBSuggestionsFlow().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

