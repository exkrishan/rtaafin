/**
 * Test individual API endpoints to verify they're working
 * Run: npx tsx scripts/test-individual-apis.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function testAPI(name: string, url: string, options?: RequestInit) {
  console.log(`\n🔍 Testing ${name}...`);
  console.log(`   URL: ${url}`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, options);
    const latency = Date.now() - startTime;
    
    let data: any;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { raw: text.substring(0, 200) };
    }
    
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Latency: ${latency}ms`);
    
    if (response.ok) {
      console.log(`   ✅ SUCCESS`);
      if (data.ok !== undefined) {
        console.log(`   Response: ok=${data.ok}`);
      }
      if (data.intent) {
        console.log(`   Intent: ${data.intent} (confidence: ${data.confidence})`);
      }
      if (data.articles || data.results) {
        const count = data.articles?.length || data.results?.length || 0;
        console.log(`   Articles: ${count}`);
      }
      return { success: true, data };
    } else {
      console.log(`   ❌ FAILED`);
      console.log(`   Error: ${data.error || data.message || JSON.stringify(data).substring(0, 100)}`);
      return { success: false, error: data };
    }
  } catch (err: any) {
    console.log(`   ❌ ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('\n🧪 Individual API Endpoint Tests');
  console.log('='.repeat(60));
  
  const results: Array<{ name: string; success: boolean }> = [];
  
  // 1. Server Health
  const health = await testAPI(
    'Server Health',
    `${BASE_URL}/api/debug/env`
  );
  results.push({ name: 'Server Health', success: health.success });
  
  // 2. Intent Detection Debug
  const intentDebug = await testAPI(
    'Intent Detection Debug',
    `${BASE_URL}/api/debug/intent`
  );
  results.push({ name: 'Intent Detection', success: intentDebug.success && intentDebug.data?.result?.intent !== 'unknown' });
  
  // 3. KB Search
  const kbSearch = await testAPI(
    'KB Search',
    `${BASE_URL}/api/kb/search?q=credit+card&tenantId=default`
  );
  results.push({ name: 'KB Search', success: kbSearch.success });
  
  // 4. Transcript Ingestion
  const ingest = await testAPI(
    'Transcript Ingestion',
    `${BASE_URL}/api/calls/ingest-transcript`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'default',
      },
      body: JSON.stringify({
        callId: `test-${Date.now()}`,
        seq: 1,
        ts: new Date().toISOString(),
        text: 'Customer: Test message about credit card fraud',
      }),
    }
  );
  results.push({ name: 'Transcript Ingestion', success: ingest.success });
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}\n`);
  
  for (const result of results) {
    console.log(`${result.success ? '✅' : '❌'} ${result.name}`);
  }
  
  console.log('\n');
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

