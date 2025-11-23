/**
 * Debug script to check Gemini LLM configuration and test API calls
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function checkEnvironmentVariables() {
  console.log('\n🔍 Checking Environment Variables:\n');
  
  const envVars = {
    'LLM_API_KEY': process.env.LLM_API_KEY,
    'LLM_PROVIDER': process.env.LLM_PROVIDER || 'openai (default)',
    'GEMINI_MODEL': process.env.GEMINI_MODEL || 'gemini-2.0-flash (default)',
    'GEMINI_API_KEY': process.env.GEMINI_API_KEY, // Some code might check this
  };
  
  let allSet = true;
  for (const [key, value] of Object.entries(envVars)) {
    const status = value && value !== 'openai (default)' && value !== 'gemini-2.0-flash (default)' 
      ? '✅' 
      : key === 'LLM_API_KEY' 
        ? '❌ MISSING (REQUIRED)' 
        : '⚠️  Not set (using default)';
    console.log(`   ${status} ${key}: ${value ? (key.includes('KEY') ? value.substring(0, 20) + '...' : value) : '(not set)'}`);
    if (key === 'LLM_API_KEY' && !value) {
      allSet = false;
    }
  }
  
  return allSet;
}

async function testIntentDetection() {
  console.log('\n🧪 Testing Intent Detection API:\n');
  
  try {
    const testText = "Customer: Hi, I'm calling about my credit card. I noticed a fraudulent transaction yesterday.";
    
    const response = await fetch(`${BASE_URL}/api/debug/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ API returned ${response.status}: ${errorText}`);
      return false;
    }
    
    const data = await response.json();
    console.log(`   Response:`, JSON.stringify(data, null, 2));
    
    if (data.intent === 'unknown' || data.confidence === 0) {
      console.log(`   ⚠️  Intent detection returned 'unknown' - this indicates an issue`);
      return false;
    }
    
    console.log(`   ✅ Intent detected: ${data.intent} (confidence: ${data.confidence})`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testKBSearch() {
  console.log('\n🔍 Testing KB Search API:\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/kb/search?q=credit+card+fraud&tenantId=default&limit=5`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ API returned ${response.status}: ${errorText}`);
      return false;
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      console.log(`   ❌ KB search failed: ${data.error || 'unknown error'}`);
      return false;
    }
    
    console.log(`   ✅ KB search successful: ${data.results?.length || 0} articles found`);
    if (data.results && data.results.length > 0) {
      console.log(`   Sample article: ${data.results[0].title}`);
    }
    return true;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testSummaryGeneration() {
  console.log('\n📝 Testing Summary Generation API:\n');
  
  try {
    // First, we need a callId with some transcripts
    // For testing, we'll use a test callId
    const testCallId = 'test-call-' + Date.now();
    
    // Send a test transcript first
    await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: testCallId,
        seq: 1,
        ts: new Date().toISOString(),
        text: 'Customer: I need to block my credit card due to fraud.',
      }),
    });
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Now test summary
    const response = await fetch(`${BASE_URL}/api/calls/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: testCallId, tenantId: 'default' }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ API returned ${response.status}: ${errorText}`);
      return false;
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      console.log(`   ❌ Summary generation failed: ${data.error || 'unknown error'}`);
      return false;
    }
    
    console.log(`   ✅ Summary generated successfully`);
    console.log(`   Dispositions: ${data.dispositions?.length || 0}`);
    console.log(`   Used fallback: ${data.usedFallback || false}`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function testDirectGeminiAPI() {
  console.log('\n🔬 Testing Direct Gemini API Call:\n');
  
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log('   ⚠️  Skipping - LLM_API_KEY not set');
    return false;
  }
  
  const provider = process.env.LLM_PROVIDER || 'openai';
  if (provider !== 'gemini' && provider !== 'google') {
    console.log(`   ⚠️  Skipping - LLM_PROVIDER is '${provider}', not 'gemini'`);
    return false;
  }
  
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'What is 2+2? Respond with just the number.',
          }],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 50,
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Gemini API returned ${response.status}: ${errorText}`);
      return false;
    }
    
    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      console.log(`   ❌ No content in response:`, JSON.stringify(data, null, 2));
      return false;
    }
    
    console.log(`   ✅ Gemini API working! Response: ${content.trim()}`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 Gemini LLM Debug Script');
  console.log('='.repeat(60));
  
  const envOk = await checkEnvironmentVariables();
  
  if (!envOk) {
    console.log('\n❌ CRITICAL: LLM_API_KEY is not set!');
    console.log('\n📋 To fix this:');
    console.log('   1. Create a .env.local file in the project root');
    console.log('   2. Add: LLM_API_KEY=your-gemini-api-key');
    console.log('   3. Add: LLM_PROVIDER=gemini');
    console.log('   4. Restart your dev server (npm run dev)');
    console.log('\n💡 Get your Gemini API key from: https://aistudio.google.com/app/apikey');
    process.exit(1);
  }
  
  const directTest = await testDirectGeminiAPI();
  const intentTest = await testIntentDetection();
  const kbTest = await testKBSearch();
  const summaryTest = await testSummaryGeneration();
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log('='.repeat(60));
  console.log(`   Direct Gemini API: ${directTest ? '✅' : '❌'}`);
  console.log(`   Intent Detection: ${intentTest ? '✅' : '❌'}`);
  console.log(`   KB Search: ${kbTest ? '✅' : '❌'}`);
  console.log(`   Summary Generation: ${summaryTest ? '✅' : '❌'}`);
  
  if (!directTest || !intentTest || !summaryTest) {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
    process.exit(1);
  }
  
  console.log('\n✅ All tests passed!');
}

main().catch(console.error);

