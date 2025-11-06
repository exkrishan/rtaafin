#!/usr/bin/env tsx
/**
 * Test script for hierarchical disposition taxonomy
 * Tests: /api/dispositions, /api/sub-dispositions, and full flow
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  data?: any;
}

async function testAPI(name: string, url: string, options?: RequestInit): Promise<TestResult> {
  try {
    const start = Date.now();
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    const latency = Date.now() - start;
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        name,
        status: 'fail',
        message: `HTTP ${response.status}: ${data.error || response.statusText}`,
        data,
      };
    }

    return {
      name,
      status: 'pass',
      message: `✅ ${response.status} OK (${latency}ms)`,
      data,
    };
  } catch (err: any) {
    return {
      name,
      status: 'fail',
      message: `❌ Error: ${err.message}`,
    };
  }
}

async function testParentDispositions(): Promise<TestResult> {
  console.log('\n📋 Testing Parent Dispositions API...');
  const result = await testAPI('Get Parent Dispositions', `${BASE_URL}/api/dispositions`);

  if (result.status === 'pass' && result.data) {
    const { dispositions, count } = result.data;
    console.log(`   Found ${count} parent dispositions`);
    
    if (dispositions && dispositions.length > 0) {
      const first = dispositions[0];
      console.log(`   Sample: ${first.title} (code: ${first.code}, id: ${first.id})`);
      
      if (first.sub_dispositions && first.sub_dispositions.length > 0) {
        console.log(`   └─ Has ${first.sub_dispositions.length} sub-dispositions`);
        console.log(`      Example: ${first.sub_dispositions[0].label} (id: ${first.sub_dispositions[0].id})`);
      }
    } else {
      result.status = 'warning';
      result.message += ' - No dispositions returned';
    }
  }

  return result;
}

async function testSubDispositions(): Promise<TestResult[]> {
  console.log('\n📋 Testing Sub-Dispositions API...');
  const results: TestResult[] = [];

  // First, get a parent disposition to test with
  const parentResult = await testAPI('Get Parent Dispositions', `${BASE_URL}/api/dispositions`);
  if (parentResult.status !== 'pass' || !parentResult.data?.dispositions?.length) {
    results.push({
      name: 'Get Sub-Dispositions',
      status: 'fail',
      message: 'Cannot test sub-dispositions: no parent dispositions found',
    });
    return results;
  }

  const parentDispositions = parentResult.data.dispositions;
  const testParent = parentDispositions.find((p: any) => p.code) || parentDispositions[0];

  console.log(`   Testing with parent: ${testParent.title} (${testParent.code})`);

  // Test by code
  const codeResult = await testAPI(
    'Get Sub-Dispositions by Code',
    `${BASE_URL}/api/sub-dispositions?dispositionCode=${encodeURIComponent(testParent.code)}`
  );
  results.push(codeResult);

  if (codeResult.status === 'pass' && codeResult.data) {
    const { subDispositions, count } = codeResult.data;
    console.log(`   Found ${count} sub-dispositions for "${testParent.code}"`);
    
    if (subDispositions && subDispositions.length > 0) {
      const first = subDispositions[0];
      console.log(`   Sample: ${first.title || first.label} (code: ${first.code}, id: ${first.id})`);
    } else {
      console.log(`   ⚠️  No sub-dispositions found for this parent`);
    }
  }

  // Test by ID if available
  if (testParent.id) {
    const idResult = await testAPI(
      'Get Sub-Dispositions by ID',
      `${BASE_URL}/api/sub-dispositions?dispositionId=${testParent.id}`
    );
    results.push(idResult);
  }

  return results;
}

async function testFullCallFlow(): Promise<TestResult[]> {
  console.log('\n📞 Testing Full Call Flow (Transcript → Intent → KB → Disposition)...');
  const results: TestResult[] = [];
  const callId = `test-disposition-${Date.now()}`;
  const tenantId = 'default';

  // Step 1: Send transcript lines
  console.log('\n   1️⃣  Sending transcript lines...');
  const transcriptLines = [
    { speaker: 'agent', text: 'Hello, how can I help you today?' },
    { speaker: 'customer', text: 'I noticed a fraudulent transaction on my credit card' },
    { speaker: 'agent', text: 'I understand your concern. Let me help you with that.' },
    { speaker: 'customer', text: 'I need to block my card immediately' },
  ];

  for (let i = 0; i < transcriptLines.length; i++) {
    const line = transcriptLines[i];
    const ingestResult = await testAPI(
      `Ingest Line ${i + 1}`,
      `${BASE_URL}/api/calls/ingest-transcript`,
      {
        method: 'POST',
        body: JSON.stringify({
          callId,
          tenantId,
          seq: i + 1,
          speaker: line.speaker,
          text: line.text,
        }),
      }
    );
    results.push(ingestResult);
    
    if (ingestResult.status === 'pass') {
      console.log(`      ✅ "${line.text.substring(0, 40)}..."`);
    } else {
      console.log(`      ❌ Failed to ingest line ${i + 1}`);
    }
    
    // Small delay between lines
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Step 2: Generate summary (which includes disposition mapping)
  console.log('\n   2️⃣  Generating call summary...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for intent detection
  
  const summaryResult = await testAPI(
    'Generate Summary',
    `${BASE_URL}/api/calls/summary`,
    {
      method: 'POST',
      body: JSON.stringify({ callId, tenantId }),
    }
  );
  results.push(summaryResult);

  if (summaryResult.status === 'pass' && summaryResult.data) {
    const { dispositions, summary } = summaryResult.data;
    console.log(`      ✅ Summary generated`);
    
    if (dispositions && dispositions.length > 0) {
      const first = dispositions[0];
      console.log(`      📋 Suggested Disposition: ${first.mappedTitle || first.title}`);
      console.log(`         Code: ${first.mappedCode || first.code}`);
      console.log(`         ID: ${first.mappedId || 'N/A'}`);
      console.log(`         Score: ${first.score || 0}`);
      
      if (first.subDisposition || first.subDispositionId) {
        console.log(`         Sub-Disposition: ${first.subDisposition || 'N/A'} (ID: ${first.subDispositionId || 'N/A'})`);
      }
    }

    if (summary) {
      console.log(`      📝 Issue: ${summary.issue?.substring(0, 60)}...`);
    }
  }

  // Step 3: Save disposition (with IDs)
  if (summaryResult.status === 'pass' && summaryResult.data?.dispositions?.length > 0) {
    console.log('\n   3️⃣  Saving disposition with IDs...');
    const firstDisposition = summaryResult.data.dispositions[0];
    
    const saveResult = await testAPI(
      'Save Disposition',
      `${BASE_URL}/api/calls/auto_notes`,
      {
        method: 'POST',
        body: JSON.stringify({
          callId,
          tenantId,
          author: 'test-script',
          notes: summaryResult.data.summary?.issue || 'Test notes',
          dispositions: [{
            code: firstDisposition.mappedCode || firstDisposition.code,
            title: firstDisposition.mappedTitle || firstDisposition.title,
            score: firstDisposition.score || 0.5,
          }],
          dispositionId: firstDisposition.mappedId || firstDisposition.id,
          subDisposition: firstDisposition.subDisposition || null,
          subDispositionId: firstDisposition.subDispositionId || null,
          confidence: firstDisposition.confidence || 0.5,
        }),
      }
    );
    results.push(saveResult);

    if (saveResult.status === 'pass') {
      console.log(`      ✅ Disposition saved successfully`);
      console.log(`         Disposition ID: ${firstDisposition.mappedId || 'N/A'}`);
      console.log(`         Sub-Disposition ID: ${firstDisposition.subDispositionId || 'N/A'}`);
    }
  }

  return results;
}

async function main() {
  console.log('\n🧪 Hierarchical Disposition Taxonomy Test');
  console.log('='.repeat(70));
  console.log(`Base URL: ${BASE_URL}`);
  console.log('='.repeat(70));

  const allResults: TestResult[] = [];

  // Test 1: Parent Dispositions
  const parentResult = await testParentDispositions();
  allResults.push(parentResult);
  console.log(`   ${parentResult.status === 'pass' ? '✅' : parentResult.status === 'warning' ? '⚠️' : '❌'} ${parentResult.message}`);

  // Test 2: Sub-Dispositions
  const subResults = await testSubDispositions();
  allResults.push(...subResults);
  subResults.forEach(r => {
    console.log(`   ${r.status === 'pass' ? '✅' : '❌'} ${r.message}`);
  });

  // Test 3: Full Call Flow
  const flowResults = await testFullCallFlow();
  allResults.push(...flowResults);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Test Summary');
  console.log('='.repeat(70));

  const passed = allResults.filter(r => r.status === 'pass').length;
  const warnings = allResults.filter(r => r.status === 'warning').length;
  const failed = allResults.filter(r => r.status === 'fail').length;

  console.log(`\n✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}\n`);

  if (failed === 0) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the output above for details.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
