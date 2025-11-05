/**
 * Comprehensive debug script to test full flow
 * Tests: Ingestion → Intent Detection → KB Search → UI Updates
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const CALL_ID = `debug-test-${Date.now()}`;
const TENANT_ID = 'default';

// Single test line with credit card content
const testLine = {
  seq: 1,
  ts: new Date().toISOString(),
  text: "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.",
};

async function testIngest() {
  console.log('\n🔍 Testing Ingestion API\n');
  console.log('='.repeat(60));
  console.log(`Call ID: ${CALL_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Line: "${testLine.text.substring(0, 60)}..."`);
  console.log('='.repeat(60));
  console.log('');

  try {
    console.log('📤 Sending request to /api/calls/ingest-transcript...');
    const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
      },
      body: JSON.stringify({
        callId: CALL_ID,
        seq: testLine.seq,
        ts: testLine.ts,
        text: testLine.text,
      }),
    });

    console.log(`📥 Response status: ${response.status} ${response.statusText}`);
    
    const data = await response.json();
    console.log('\n📊 Response Data:');
    console.log(JSON.stringify(data, null, 2));

    if (response.ok && data.ok) {
      console.log('\n✅ Ingestion successful!');
      console.log(`   Intent: "${data.intent}" (confidence: ${data.confidence?.toFixed(2) || 'N/A'})`);
      console.log(`   Articles found: ${data.articles?.length || 0}`);
      
      if (data.articles && data.articles.length > 0) {
        console.log('\n📚 KB Articles:');
        data.articles.forEach((article: any, idx: number) => {
          console.log(`   ${idx + 1}. ${article.title || article.code || 'Unknown'}`);
          if (article.snippet) {
            console.log(`      "${article.snippet.substring(0, 60)}..."`);
          }
        });
      } else {
        console.log('\n⚠️  No KB articles found');
        if (data.intent === 'unknown') {
          console.log('   ⚠️  Intent is "unknown" - this means intent detection failed');
          console.log('   Check server logs for:');
          console.log('     - "[intent] LLM_API_KEY not configured"');
          console.log('     - "[intent] Gemini API error" or "[intent] OpenAI API error"');
        }
      }
    } else {
      console.log('\n❌ Ingestion failed!');
      console.log(`   Error: ${data.error || 'Unknown error'}`);
    }

    return data;
  } catch (err: any) {
    console.error('\n❌ Request failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Server is not running on', BASE_URL);
      console.error('   Make sure to run: npm run dev');
    }
    return null;
  }
}

async function testKBSearch() {
  console.log('\n\n🔍 Testing KB Search API\n');
  console.log('='.repeat(60));

  const testQueries = [
    'credit card',
    'fraud',
    'credit_card_fraud',
    'transaction',
  ];

  for (const query of testQueries) {
    try {
      console.log(`\n📤 Searching for: "${query}"`);
      const response = await fetch(`${BASE_URL}/api/kb/search?q=${encodeURIComponent(query)}&tenantId=${TENANT_ID}&limit=5`);
      const data = await response.json();

      if (response.ok && data.ok) {
        console.log(`   ✅ Found ${data.results?.length || 0} articles`);
        if (data.results && data.results.length > 0) {
          data.results.slice(0, 3).forEach((article: any, idx: number) => {
            console.log(`      ${idx + 1}. ${article.title || 'Unknown'}`);
          });
        }
      } else {
        console.log(`   ❌ Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error(`   ❌ Failed: ${err.message}`);
    }
  }
}

async function checkEnvironment() {
  console.log('\n\n🔍 Checking Environment\n');
  console.log('='.repeat(60));
  
  const hasLLMKey = !!process.env.LLM_API_KEY;
  const provider = process.env.LLM_PROVIDER || 'openai';
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasSupabaseKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`LLM_API_KEY: ${hasLLMKey ? '✅ Set' : '❌ Missing'}`);
  if (hasLLMKey) {
    console.log(`   Key preview: ${process.env.LLM_API_KEY?.substring(0, 20)}...`);
  }
  console.log(`LLM_PROVIDER: ${provider}`);
  console.log(`NEXT_PUBLIC_SUPABASE_URL: ${hasSupabaseUrl ? '✅ Set' : '❌ Missing'}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${hasSupabaseKey ? '✅ Set' : '❌ Missing'}`);

  if (!hasLLMKey) {
    console.log('\n⚠️  LLM_API_KEY is missing!');
    console.log('   Intent detection will not work without this.');
    console.log('   Add to .env.local:');
    console.log('   LLM_API_KEY=your-api-key');
    console.log('   LLM_PROVIDER=gemini  # or openai');
  }
}

async function main() {
  console.log('🚀 Full Flow Debug Test\n');
  
  await checkEnvironment();
  await testKBSearch();
  await testIngest();

  console.log('\n\n' + '='.repeat(60));
  console.log('✅ Test Complete!');
  console.log('='.repeat(60));
  console.log(`\n💡 Call ID for dashboard: ${CALL_ID}`);
  console.log('   Open http://localhost:3000/dashboard');
  console.log('   Connect to the call ID above to see transcript\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

