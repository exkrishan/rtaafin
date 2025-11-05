/**
 * Smoke test for KB search and auto_notes API endpoints
 * Run with: npx tsx tests/ui-kb-smoke.ts
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local if it exists
try {
  const envPath = join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  const env = dotenv.parse(envContent);
  Object.assign(process.env, env);
} catch (err) {
  console.warn('[smoke] No .env.local found, using existing env vars');
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function testKBSearch(): Promise<boolean> {
  console.log('\n🔍 Testing KB Search API...');
  try {
    const url = `${BASE_URL}/api/kb/search?q=${encodeURIComponent('order status')}&tenantId=default`;
    console.log(`  GET ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('  ❌ Search failed:', data);
      return false;
    }

    if (!data.ok) {
      console.error('  ❌ Search returned ok:false:', data.error);
      return false;
    }

    console.log('  ✅ Search successful');
    console.log(`  Results: ${Array.isArray(data.results) ? data.results.length : 0} articles`);
    if (Array.isArray(data.results) && data.results.length > 0) {
      console.log('  Sample article:', JSON.stringify(data.results[0], null, 2));
    }

    return true;
  } catch (err: any) {
    console.error('  ❌ Search error:', err.message);
    return false;
  }
}

async function testAutoNotes(): Promise<boolean> {
  console.log('\n💾 Testing Auto Notes API...');
  try {
    const payload = {
      callId: 'demo-call-1',
      tenantId: 'default',
      author: 'agent-ui',
      notes: 'Test notes from smoke test',
      dispositions: [
        {
          code: 'GENERAL_INQUIRY',
          title: 'General Inquiry',
          score: 0.45,
        },
      ],
      confidence: 0.45,
      raw_llm_output: null,
    };

    const url = `${BASE_URL}/api/calls/auto_notes`;
    console.log(`  POST ${url}`);
    console.log('  Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('  ❌ Auto notes failed:', data);
      return false;
    }

    if (!data.ok) {
      console.error('  ❌ Auto notes returned ok:false:', data.error);
      return false;
    }

    console.log('  ✅ Auto notes saved successfully');
    console.log('  Response:', JSON.stringify(data, null, 2));

    return true;
  } catch (err: any) {
    console.error('  ❌ Auto notes error:', err.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting UI KB Smoke Tests');
  console.log(`   Base URL: ${BASE_URL}\n`);

  const searchOk = await testKBSearch();
  const notesOk = await testAutoNotes();

  console.log('\n📊 Test Summary:');
  console.log(`   KB Search: ${searchOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Auto Notes: ${notesOk ? '✅ PASS' : '❌ FAIL'}`);

  const allPassed = searchOk && notesOk;
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});

