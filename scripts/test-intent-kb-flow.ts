/**
 * Test script to debug intent detection and KB article flow
 */

const BASE_URL = 'http://localhost:3000';

async function testIntentDetection() {
  console.log('\n🧪 Testing Intent Detection:\n');

  const testText = "Customer: I need to block my credit card due to fraud";
  
  try {
    const response = await fetch(`${BASE_URL}/api/debug/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ API returned ${response.status}: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    
    if (data.result?.intent === 'unknown') {
      console.log(`   ⚠️  Intent detection returned 'unknown'`);
      console.log(`   Check server logs for errors`);
    } else {
      console.log(`   ✅ Intent detected: ${data.result?.intent} (confidence: ${data.result?.confidence})`);
    }
    
    return data;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function testIngestTranscript() {
  console.log('\n📝 Testing Ingest Transcript (Full Flow):\n');

  const testCallId = `test-call-${Date.now()}`;
  const testText = "Customer: I need to block my credit card due to fraud";
  
    try {
    const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: testCallId,
        seq: 1,
        ts: new Date().toISOString(),
        text: testText,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ API returned ${response.status}: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    console.log('   Response:', JSON.stringify(data, null, 2));
    
    if (data.intent === 'unknown') {
      console.log(`   ⚠️  Intent is 'unknown' - KB articles won't be fetched`);
      console.log(`   This is why KB suggestions aren't appearing!`);
    } else {
      console.log(`   ✅ Intent: ${data.intent} (confidence: ${data.confidence})`);
      console.log(`   ✅ KB Articles: ${data.articles?.length || 0}`);
      
      if (data.articles && data.articles.length > 0) {
        console.log(`   Sample article: ${data.articles[0].title}`);
      } else {
        console.log(`   ⚠️  No KB articles returned (even though intent was detected)`);
      }
    }
    
    return data;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function testKBSearch() {
  console.log('\n🔍 Testing KB Search Directly:\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/kb/search?q=credit+card+fraud&tenantId=default&limit=5`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ API returned ${response.status}: ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      console.log(`   ❌ KB search failed: ${data.error || 'unknown error'}`);
      return null;
    }
    
    console.log(`   ✅ KB search successful: ${data.results?.length || 0} articles found`);
    if (data.results && data.results.length > 0) {
      console.log(`   Sample: ${data.results[0].title}`);
    }
    return data;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 Intent Detection & KB Article Flow Debug');
  console.log('='.repeat(60));
  
  const intentTest = await testIntentDetection();
  const kbSearchTest = await testKBSearch();
  const ingestTest = await testIngestTranscript();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));

  if (intentTest?.result?.intent === 'unknown') {
    console.log('   ❌ Intent Detection: FAILING (returning "unknown")');
    console.log('   ⚠️  This is blocking KB article surfacing!');
    console.log('\n   🔧 To fix:');
    console.log('   1. Check server logs for OpenAI API errors');
    console.log('   2. Verify LLM_API_KEY is set correctly');
    console.log('   3. Verify LLM_PROVIDER=openai');
    console.log('   4. Restart dev server after env changes');
  } else {
    console.log(`   ✅ Intent Detection: Working (${intentTest?.result?.intent})`);
  }
  
  if (kbSearchTest?.ok) {
    console.log(`   ✅ KB Search: Working (${kbSearchTest.results?.length || 0} articles)`);
  } else {
    console.log('   ❌ KB Search: FAILING');
  }
  
  if (ingestTest?.intent === 'unknown') {
    console.log('   ❌ Ingest Transcript: Intent detection failing');
  } else if (ingestTest?.articles?.length > 0) {
    console.log(`   ✅ Ingest Transcript: Working (${ingestTest.articles.length} articles)`);
  } else {
    console.log('   ⚠️  Ingest Transcript: Intent detected but no articles returned');
  }
  
  console.log('\n💡 Next Steps:');
  console.log('   1. Check browser console on /demo page for errors');
  console.log('   2. Check server terminal logs for [intent] errors');
  console.log('   3. Verify .env.local has correct LLM_API_KEY and LLM_PROVIDER');
  console.log('   4. Restart dev server if env vars were changed');
}

main().catch(console.error);
