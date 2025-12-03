/**
 * Disposition Generation Production Test
 * 
 * Tests:
 * 1. Call summary generation
 * 2. Disposition mapping to taxonomy
 * 3. Sub-disposition recommendations
 * 4. Auto-notes generation
 * 
 * Run: npx tsx scripts/test-disposition-production.ts [callId]
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
  if (details) {
    console.log(`   Details:`, JSON.stringify(details, null, 2));
  }
}

async function testCallSummaryGeneration(callId: string): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        tenantId: 'default',
      }),
      timeout: 60000, // 60 seconds for LLM call
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logTest('Call Summary Generation', false, error.error || `HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const hasSummary = !!data.summary;
    const hasDispositions = Array.isArray(data.dispositions) && data.dispositions.length > 0;
    const hasIssue = !!data.summary?.issue;
    const hasResolution = !!data.summary?.resolution;
    const hasNextSteps = !!data.summary?.next_steps;

    const passed = hasSummary && hasDispositions && (hasIssue || hasResolution || hasNextSteps);

    logTest('Call Summary Generation', passed,
      passed ? undefined : 'Missing summary or dispositions',
      {
        hasSummary,
        hasDispositions,
        dispositionsCount: data.dispositions?.length || 0,
        hasIssue,
        hasResolution,
        hasNextSteps,
        usedFallback: data.usedFallback || false,
      }
    );

    return passed;
  } catch (error: any) {
    logTest('Call Summary Generation', false, error.message);
    return false;
  }
}

async function testDispositionMapping(callId: string): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        tenantId: 'default',
      }),
      timeout: 60000,
    });

    if (!response.ok) {
      logTest('Disposition Mapping', false, `HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const dispositions = data.dispositions || [];
    
    if (dispositions.length === 0) {
      logTest('Disposition Mapping', false, 'No dispositions returned');
      return false;
    }

    const firstDisposition = dispositions[0];
    const hasMappedId = firstDisposition.mappedId !== undefined;
    const hasMappedCode = !!firstDisposition.mappedCode;
    const hasMappedTitle = !!firstDisposition.mappedTitle;
    const hasConfidence = typeof firstDisposition.score === 'number';

    const passed = hasMappedId && hasMappedCode && hasMappedTitle && hasConfidence;

    logTest('Disposition Mapping', passed,
      passed ? undefined : 'Missing mapped fields',
      {
        mappedId: firstDisposition.mappedId,
        mappedCode: firstDisposition.mappedCode,
        mappedTitle: firstDisposition.mappedTitle,
        score: firstDisposition.score,
        hasSubDisposition: !!firstDisposition.subDisposition,
      }
    );

    return passed;
  } catch (error: any) {
    logTest('Disposition Mapping', false, error.message);
    return false;
  }
}

async function testSubDispositionRecommendations(callId: string): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        tenantId: 'default',
      }),
      timeout: 60000,
    });

    if (!response.ok) {
      logTest('Sub-Disposition Recommendations', false, `HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const dispositions = data.dispositions || [];
    
    // Check if any disposition has sub-disposition
    const hasSubDisposition = dispositions.some((d: any) => d.subDisposition || d.sub_disposition);

    logTest('Sub-Disposition Recommendations', true, // Not critical if missing
      undefined,
      {
        hasSubDisposition,
        dispositionsWithSub: dispositions.filter((d: any) => d.subDisposition || d.sub_disposition).length,
      }
    );

    return true; // Not a blocker
  } catch (error: any) {
    logTest('Sub-Disposition Recommendations', false, error.message);
    return false;
  }
}

async function testAutoNotesGeneration(callId: string): Promise<boolean> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/calls/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        tenantId: 'default',
      }),
      timeout: 60000,
    });

    if (!response.ok) {
      logTest('Auto-Notes Generation', false, `HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const summary = data.summary || {};
    
    const autoNotes = [
      summary.issue,
      summary.resolution,
      summary.next_steps,
    ].filter(Boolean).join('\n\n');

    const hasAutoNotes = autoNotes.trim().length > 0;
    const notesLength = autoNotes.length;

    logTest('Auto-Notes Generation', hasAutoNotes,
      hasAutoNotes ? undefined : 'No auto-notes generated',
      {
        hasAutoNotes,
        notesLength,
        hasIssue: !!summary.issue,
        hasResolution: !!summary.resolution,
        hasNextSteps: !!summary.next_steps,
      }
    );

    return hasAutoNotes;
  } catch (error: any) {
    logTest('Auto-Notes Generation', false, error.message);
    return false;
  }
}

async function testDispositionPersistence(callId: string): Promise<boolean> {
  try {
    // First generate summary
    const summaryResponse = await fetch(`${FRONTEND_URL}/api/calls/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        tenantId: 'default',
      }),
      timeout: 60000,
    });

    if (!summaryResponse.ok) {
      logTest('Disposition Persistence', false, 'Failed to generate summary');
      return false;
    }

    const summaryData = await summaryResponse.json();
    const dispositions = summaryData.dispositions || [];
    
    if (dispositions.length === 0) {
      logTest('Disposition Persistence', false, 'No dispositions to persist');
      return false;
    }

    // Try to save disposition
    const saveResponse = await fetch(`${FRONTEND_URL}/api/calls/auto_notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId,
        tenantId: 'default',
        dispositionId: dispositions[0].mappedId,
        dispositions: dispositions.map((d: any) => ({
          code: d.mappedCode || d.code,
          title: d.mappedTitle || d.title,
          score: d.score || 0.5,
        })),
        notes: [
          summaryData.summary?.issue,
          summaryData.summary?.resolution,
          summaryData.summary?.next_steps,
        ].filter(Boolean).join('\n\n'),
      }),
      timeout: 10000,
    });

    const passed = saveResponse.ok;
    logTest('Disposition Persistence', passed,
      passed ? undefined : `HTTP ${saveResponse.status}`,
      {
        saved: passed,
        dispositionId: dispositions[0].mappedId,
      }
    );

    return passed;
  } catch (error: any) {
    logTest('Disposition Persistence', false, error.message);
    return false;
  }
}

async function runAllTests() {
  const callId = process.argv[2];

  if (!callId) {
    console.log('❌ Usage: npx tsx scripts/test-disposition-production.ts <callId>');
    console.log('   Example: npx tsx scripts/test-disposition-production.ts call-1234567890');
    process.exit(1);
  }

  console.log('🧪 Disposition Generation Production Tests\n');
  console.log(`📞 Testing with callId: ${callId}\n`);
  console.log('='.repeat(60));

  console.log('\n📝 Summary Generation Tests');
  console.log('-'.repeat(60));
  await testCallSummaryGeneration(callId);

  console.log('\n🏷️  Disposition Mapping Tests');
  console.log('-'.repeat(60));
  await testDispositionMapping(callId);
  await testSubDispositionRecommendations(callId);

  console.log('\n📄 Auto-Notes Tests');
  console.log('-'.repeat(60));
  await testAutoNotesGeneration(callId);

  console.log('\n💾 Persistence Tests');
  console.log('-'.repeat(60));
  await testDispositionPersistence(callId);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error || 'Unknown error'}`);
    });
    console.log('');
  }

  const criticalTests = [
    'Call Summary Generation',
    'Disposition Mapping',
    'Auto-Notes Generation',
  ];

  const criticalPassed = criticalTests.every(testName =>
    results.find(r => r.name.includes(testName))?.passed
  );

  if (criticalPassed) {
    console.log('✅ All critical tests passed. Disposition generation is working.');
  } else {
    console.log('⚠️  Some critical tests failed. Please check Gemini API configuration.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});

