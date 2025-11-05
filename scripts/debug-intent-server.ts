/**
 * Debug script to test intent detection through the actual server endpoint
 * This will show exactly what the server is doing
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';

async function testServerEndpoint() {
  console.log('🔍 Testing Intent Detection Through Server\n');
  console.log('='.repeat(60));
  console.log(`Server URL: ${BASE_URL}`);
  console.log(`LLM_API_KEY: ${process.env.LLM_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`LLM_PROVIDER: ${process.env.LLM_PROVIDER || 'openai (default)'}`);
  console.log(`GEMINI_MODEL: ${process.env.GEMINI_MODEL || 'gemini-1.5-flash (default)'}`);
  console.log('='.repeat(60));
  console.log('');

  const testText = "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.";

  try {
    console.log('📤 Sending request to /api/calls/ingest-transcript...');
    console.log(`Text: "${testText}"\n`);

    const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: `debug-${Date.now()}`,
        seq: 1,
        ts: new Date().toISOString(),
        text: testText,
      }),
    });

    console.log(`📥 Response Status: ${response.status} ${response.statusText}\n`);

    const data = await response.json();
    console.log('📊 Response Data:');
    console.log(JSON.stringify(data, null, 2));

    if (data.intent === 'unknown') {
      console.log('\n❌ Intent detection failed!');
      console.log('\n🔍 Possible Issues:');
      console.log('1. Check server terminal for these logs:');
      console.log('   - [ingest-transcript] Detecting intent for seq: 1');
      console.log('   - [intent] Calling Google Gemini API');
      console.log('   - [intent] Gemini API error');
      console.log('   - [intent] Failed to parse Gemini response');
      console.log('\n2. Common causes:');
      console.log('   - Server not restarted after code changes');
      console.log('   - LLM_API_KEY not loaded in server (check .env.local)');
      console.log('   - Gemini API returning errors');
      console.log('   - Network issues');
    } else {
      console.log(`\n✅ Intent detected: "${data.intent}" (confidence: ${data.confidence})`);
      console.log(`📚 KB Articles found: ${data.articles?.length || 0}`);
    }

  } catch (err: any) {
    console.error('\n❌ Request failed:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Server is not running on', BASE_URL);
      console.error('   Start server with: npm run dev');
    }
  }
}

testServerEndpoint().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

