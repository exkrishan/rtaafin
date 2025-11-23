/**
 * Script to check UI SSE connection and callId matching
 * 
 * This script helps diagnose:
 * 1. What callId the UI is using
 * 2. What callId transcripts are being broadcast with
 * 3. If there's a mismatch
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const INTERACTION_ID = process.env.INTERACTION_ID || 'ab7cbdeac69d2a44ef890ecf164e19bh';

interface DiagnosticResult {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function checkSSEClients(): Promise<DiagnosticResult> {
  try {
    // Check if we can see active SSE clients
    // Note: This would require an API endpoint to expose client info
    // For now, we'll check the transcript consumer status which shows subscriptions
    
    const response = await fetch(`${FRONTEND_URL}/api/transcripts/status`);
    if (!response.ok) {
      return {
        check: 'SSE Clients Check',
        status: 'fail',
        message: `Status endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    // Check if target interaction is subscribed
    const targetSubscription = data.subscriptions?.find(
      (sub: any) => sub.interactionId === INTERACTION_ID
    );
    
    if (!targetSubscription) {
      return {
        check: 'SSE Clients Check',
        status: 'warning',
        message: `No subscription found for interaction ${INTERACTION_ID}`,
        details: {
          totalSubscriptions: data.subscriptionCount,
          subscriptions: data.subscriptions?.slice(0, 5).map((s: any) => ({
            interactionId: s.interactionId,
            transcriptCount: s.transcriptCount,
          })),
        },
      };
    }
    
    return {
      check: 'SSE Clients Check',
      status: 'pass',
      message: `Subscription found for ${INTERACTION_ID} with ${targetSubscription.transcriptCount} transcripts`,
      details: targetSubscription,
    };
  } catch (error: any) {
    return {
      check: 'SSE Clients Check',
      status: 'fail',
      message: `Failed to check: ${error.message}`,
    };
  }
}

async function testBroadcast(): Promise<DiagnosticResult> {
  try {
    // Send a test transcript to see if it gets broadcast
    const testResponse = await fetch(`${FRONTEND_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: INTERACTION_ID,
        seq: 999999,
        ts: new Date().toISOString(),
        text: `[TEST] Diagnostic test transcript at ${new Date().toISOString()}`,
      }),
    });
    
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      return {
        check: 'Broadcast Test',
        status: 'fail',
        message: `Test broadcast failed: ${testResponse.status} - ${errorText}`,
      };
    }
    
    const result = await testResponse.json();
    
    return {
      check: 'Broadcast Test',
      status: 'pass',
      message: 'Test transcript broadcast successfully',
      details: {
        intent: result.intent,
        articlesCount: result.articles?.length || 0,
        note: 'Check browser console to see if UI received this test transcript',
      },
    };
  } catch (error: any) {
    return {
      check: 'Broadcast Test',
      status: 'fail',
      message: `Failed to test broadcast: ${error.message}`,
    };
  }
}

async function checkCallIdMapping(): Promise<DiagnosticResult> {
  return {
    check: 'CallId Mapping',
    status: 'info',
    message: 'Verify UI is using correct callId',
    details: {
      expectedInteractionId: INTERACTION_ID,
      uiPages: {
        '/live': {
          component: 'AgentAssistPanelV2',
          prop: 'interactionId',
          source: 'User input (callId state)',
          note: 'User must enter the interaction ID in the input field',
        },
        '/dashboard': {
          component: 'TranscriptPanel',
          prop: 'callId',
          source: 'Hardcoded to "call-123"',
          note: '⚠️ This won\'t match Exotel interaction IDs - needs to be updated',
        },
        '/test-agent-assist': {
          component: 'AgentAssistPanelV2',
          prop: 'interactionId',
          source: 'State variable (default: "test-call-123")',
          note: 'User can change this in the input field',
        },
      },
      flow: {
        step1: 'UI connects to SSE with callId from prop',
        step2: 'Transcript Consumer forwards with callId = interactionId',
        step3: 'Ingest API broadcasts with callId from request',
        step4: 'SSE matches clients by callId',
        critical: 'All callIds must match exactly',
      },
    },
  };
}

async function main() {
  console.log('🔍 Checking UI SSE Connection Issues...\n');
  console.log(`Target Interaction ID: ${INTERACTION_ID}\n`);
  
  const results: DiagnosticResult[] = [];
  
  // Check 1: SSE Clients
  console.log('1️⃣ Checking SSE Client Subscriptions...');
  const clientCheck = await checkSSEClients();
  results.push(clientCheck);
  console.log(`   ${clientCheck.status === 'pass' ? '✅' : clientCheck.status === 'warning' ? '⚠️' : '❌'} ${clientCheck.message}`);
  if (clientCheck.details) {
    console.log(`   Details:`, JSON.stringify(clientCheck.details, null, 2));
  }
  console.log();
  
  // Check 2: Broadcast Test
  console.log('2️⃣ Testing Broadcast...');
  const broadcastTest = await testBroadcast();
  results.push(broadcastTest);
  console.log(`   ${broadcastTest.status === 'pass' ? '✅' : broadcastTest.status === 'warning' ? '⚠️' : '❌'} ${broadcastTest.message}`);
  if (broadcastTest.details) {
    console.log(`   Intent: ${broadcastTest.details.intent}`);
    console.log(`   Articles: ${broadcastTest.details.articlesCount}`);
    console.log(`   ${broadcastTest.details.note}`);
  }
  console.log();
  
  // Check 3: CallId Mapping
  console.log('3️⃣ CallId Mapping Information...');
  const mappingCheck = await checkCallIdMapping();
  results.push(mappingCheck);
  console.log(`   ℹ️  ${mappingCheck.message}`);
  if (mappingCheck.details) {
    console.log(`   Expected Interaction ID: ${mappingCheck.details.expectedInteractionId}`);
    console.log(`   UI Pages:`);
    Object.entries(mappingCheck.details.uiPages).forEach(([page, info]: [string, any]) => {
      console.log(`     ${page}:`);
      console.log(`       Component: ${info.component}`);
      console.log(`       Prop: ${info.prop}`);
      console.log(`       Source: ${info.source}`);
      console.log(`       Note: ${info.note}`);
    });
  }
  console.log();
  
  // Summary
  console.log('📊 Summary:');
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warning' || r.status === 'info').length;
  
  console.log(`   ✅ Pass: ${passCount}`);
  console.log(`   ⚠️  Warning/Info: ${warnCount}`);
  console.log(`   ❌ Fail: ${failCount}`);
  console.log();
  
  // Recommendations
  console.log('🔧 Recommendations:');
  console.log();
  console.log('1. **Verify UI Page and CallId:**');
  console.log(`   - Go to /live page`);
  console.log(`   - Enter interaction ID: ${INTERACTION_ID}`);
  console.log(`   - Check browser console for SSE connection logs`);
  console.log(`   - Look for: "[AgentAssistPanel] ✅ SSE connection opened"`);
  console.log();
  console.log('2. **Check Browser Console:**');
  console.log(`   - Open browser DevTools → Console`);
  console.log(`   - Look for transcript_line events`);
  console.log(`   - Check if eventCallId matches expectedCallId`);
  console.log(`   - Look for "Skipping transcript_line" messages with reason`);
  console.log();
  console.log('3. **Verify CallId Match:**');
  console.log(`   - UI SSE URL should be: /api/events/stream?callId=${INTERACTION_ID}`);
  console.log(`   - Transcript broadcasts should use callId: ${INTERACTION_ID}`);
  console.log(`   - Both must match exactly (case-sensitive)`);
  console.log();
  console.log('4. **Test with Test Broadcast:**');
  console.log(`   - The test broadcast above should appear in UI if callId matches`);
  console.log(`   - Check browser console for the test transcript`);
  console.log();
  
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(console.error);

