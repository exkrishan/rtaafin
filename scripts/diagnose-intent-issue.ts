/**
 * Comprehensive diagnostic script for intent detection issues
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function diagnose() {
  console.log('🔍 Intent Detection Diagnostic\n');
  console.log('='.repeat(60));

  // 1. Check environment variables
  console.log('\n1️⃣  Environment Variables:');
  console.log(`   LLM_API_KEY: ${process.env.LLM_API_KEY ? '✅ Set (' + process.env.LLM_API_KEY.substring(0, 20) + '...)' : '❌ MISSING'}`);
  console.log(`   LLM_PROVIDER: ${process.env.LLM_PROVIDER || '⚠️  Not set (defaults to openai)'}`);
  console.log(`   GEMINI_MODEL: ${process.env.GEMINI_MODEL || '⚠️  Not set (defaults to gemini-1.5-flash)'}`);

  if (!process.env.LLM_API_KEY) {
    console.log('\n❌ CRITICAL: LLM_API_KEY is not set!');
    console.log('   Add it to .env.local: LLM_API_KEY=your-key-here');
    return;
  }

  // 2. Test server is running
  console.log('\n2️⃣  Server Status:');
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/debug/env`);
    if (healthCheck.ok) {
      console.log('   ✅ Server is running');
    } else {
      console.log('   ⚠️  Server returned error');
    }
  } catch (err: any) {
    console.log('   ❌ Server is not running or not accessible');
    console.log(`   Error: ${err.message}`);
    console.log('\n   Start server with: npm run dev');
    return;
  }

  // 3. Test debug endpoint
  console.log('\n3️⃣  Debug Endpoint Test:');
  try {
    const debugRes = await fetch(`${BASE_URL}/api/debug/intent`);
    const debugData = await debugRes.json();
    
    console.log(`   Status: ${debugRes.status}`);
    console.log(`   Environment loaded: ${debugData.env?.hasLLMKey ? '✅' : '❌'}`);
    console.log(`   Provider: ${debugData.env?.provider || 'unknown'}`);
    console.log(`   Model: ${debugData.env?.geminiModel || 'unknown'}`);
    console.log(`   Intent detected: ${debugData.result?.intent || 'unknown'}`);
    console.log(`   Confidence: ${debugData.result?.confidence || 0}`);
    
    if (debugData.error) {
      console.log(`   ❌ Error: ${debugData.error}`);
    }
    
    if (debugData.result?.intent === 'unknown') {
      console.log('\n   ⚠️  Intent detection is failing!');
      console.log('   Check server terminal logs for:');
      console.log('     - [intent] Starting detection');
      console.log('     - [intent] Calling Google Gemini API');
      console.log('     - [intent] Gemini API error');
    }
  } catch (err: any) {
    console.log(`   ❌ Debug endpoint failed: ${err.message}`);
  }

  // 4. Test actual ingest endpoint
  console.log('\n4️⃣  Ingest Endpoint Test:');
  const testText = "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.";
  
  try {
    const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: `diagnostic-${Date.now()}`,
        seq: 1,
        ts: new Date().toISOString(),
        text: testText,
      }),
    });

    const data = await response.json();
    
    console.log(`   Status: ${response.status}`);
    console.log(`   Intent: ${data.intent || 'unknown'}`);
    console.log(`   Confidence: ${data.confidence || 0}`);
    console.log(`   Articles: ${data.articles?.length || 0}`);
    
    if (data.intent === 'unknown') {
      console.log('\n   ❌ Intent detection failed in ingest endpoint!');
      console.log('\n   🔍 Next Steps:');
      console.log('   1. Check your dev server terminal for detailed logs');
      console.log('   2. Look for these log messages:');
      console.log('      - [ingest-transcript] Detecting intent for seq: 1');
      console.log('      - [intent] Starting detection');
      console.log('      - [intent] Calling Google Gemini API');
      console.log('      - [intent] Gemini API error (if any)');
      console.log('   3. Common issues:');
      console.log('      - API key invalid or expired');
      console.log('      - Network timeout');
      console.log('      - Gemini API rate limit');
      console.log('      - Model name incorrect');
    } else {
      console.log('   ✅ Intent detection working!');
    }
  } catch (err: any) {
    console.log(`   ❌ Ingest endpoint failed: ${err.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Diagnostic complete!');
  console.log('\n💡 If intent is still "unknown", check your dev server terminal');
  console.log('   for detailed error logs from the [intent] module.\n');
}

diagnose().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

