/**
 * Diagnostic script to check transcript flow end-to-end
 * 
 * Checks:
 * 1. Transcript consumer status
 * 2. Transcript parsing in ElevenLabs provider
 * 3. callId/interactionId mapping
 * 4. SSE connection status
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const ASR_WORKER_URL = process.env.ASR_WORKER_URL || 'http://localhost:3001';

interface DiagnosticResult {
  check: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

async function checkTranscriptConsumerStatus(): Promise<DiagnosticResult> {
  try {
    const response = await fetch(`${FRONTEND_URL}/api/transcripts/status`);
    if (!response.ok) {
      return {
        check: 'Transcript Consumer Status',
        status: 'fail',
        message: `Status endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    if (!data.isRunning) {
      return {
        check: 'Transcript Consumer Status',
        status: 'fail',
        message: 'Transcript consumer is not running',
        details: data,
      };
    }
    
    return {
      check: 'Transcript Consumer Status',
      status: 'pass',
      message: `Consumer is running, ${data.subscriptionCount || 0} active subscription(s)`,
      details: data,
    };
  } catch (error: any) {
    return {
      check: 'Transcript Consumer Status',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function checkASRWorkerHealth(): Promise<DiagnosticResult> {
  try {
    const response = await fetch(`${ASR_WORKER_URL}/health`);
    if (!response.ok) {
      return {
        check: 'ASR Worker Health',
        status: 'fail',
        message: `Health endpoint returned ${response.status}`,
      };
    }
    
    const data = await response.json();
    
    return {
      check: 'ASR Worker Health',
      status: 'pass',
      message: `ASR Worker is healthy, provider: ${data.provider || 'unknown'}`,
      details: data,
    };
  } catch (error: any) {
    return {
      check: 'ASR Worker Health',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function checkTranscriptParsing(): Promise<DiagnosticResult> {
  // This is a code analysis check
  // The issue: logs show hasTranscript: false but transcriptPreview shows text
  // This suggests data.text exists but data.transcript doesn't
  
  return {
    check: 'Transcript Parsing Logic',
    status: 'warning',
    message: 'Code uses data.transcript || data.text, but logs suggest data.text is not being extracted correctly',
    details: {
      issue: 'Logs show transcriptPreview with text but hasTranscript: false',
      expected: 'data.text should be extracted when data.transcript is undefined',
      recommendation: 'Check if ElevenLabs SDK is transforming the data structure',
    },
  };
}

async function checkIngestTranscriptAPI(): Promise<DiagnosticResult> {
  try {
    // Test if the API is accessible
    const response = await fetch(`${FRONTEND_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: 'test-diagnostic',
        seq: 1,
        ts: new Date().toISOString(),
        text: 'Test transcript',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        check: 'Ingest Transcript API',
        status: 'fail',
        message: `API returned ${response.status}: ${errorText}`,
      };
    }
    
    const data = await response.json();
    
    return {
      check: 'Ingest Transcript API',
      status: 'pass',
      message: 'API is accessible and responding',
      details: {
        intent: data.intent,
        articlesCount: data.articles?.length || 0,
      },
    };
  } catch (error: any) {
    return {
      check: 'Ingest Transcript API',
      status: 'fail',
      message: `Failed to connect: ${error.message}`,
    };
  }
}

async function main() {
  console.log('🔍 Diagnosing Transcript Flow...\n');
  
  const results: DiagnosticResult[] = [];
  
  // Check 1: Transcript Consumer Status
  console.log('1️⃣ Checking Transcript Consumer Status...');
  const consumerStatus = await checkTranscriptConsumerStatus();
  results.push(consumerStatus);
  console.log(`   ${consumerStatus.status === 'pass' ? '✅' : consumerStatus.status === 'warning' ? '⚠️' : '❌'} ${consumerStatus.message}`);
  if (consumerStatus.details) {
    console.log(`   Details:`, JSON.stringify(consumerStatus.details, null, 2));
  }
  console.log();
  
  // Check 2: ASR Worker Health
  console.log('2️⃣ Checking ASR Worker Health...');
  const asrHealth = await checkASRWorkerHealth();
  results.push(asrHealth);
  console.log(`   ${asrHealth.status === 'pass' ? '✅' : asrHealth.status === 'warning' ? '⚠️' : '❌'} ${asrHealth.message}`);
  if (asrHealth.details) {
    console.log(`   Provider: ${asrHealth.details.provider}`);
    console.log(`   Active Buffers: ${asrHealth.details.activeBuffers || 0}`);
  }
  console.log();
  
  // Check 3: Transcript Parsing
  console.log('3️⃣ Checking Transcript Parsing Logic...');
  const parsingCheck = await checkTranscriptParsing();
  results.push(parsingCheck);
  console.log(`   ${parsingCheck.status === 'pass' ? '✅' : parsingCheck.status === 'warning' ? '⚠️' : '❌'} ${parsingCheck.message}`);
  if (parsingCheck.details) {
    console.log(`   Issue: ${parsingCheck.details.issue}`);
    console.log(`   Recommendation: ${parsingCheck.details.recommendation}`);
  }
  console.log();
  
  // Check 4: Ingest Transcript API
  console.log('4️⃣ Checking Ingest Transcript API...');
  const apiCheck = await checkIngestTranscriptAPI();
  results.push(apiCheck);
  console.log(`   ${apiCheck.status === 'pass' ? '✅' : apiCheck.status === 'warning' ? '⚠️' : '❌'} ${apiCheck.message}`);
  if (apiCheck.details) {
    console.log(`   Intent: ${apiCheck.details.intent}`);
    console.log(`   Articles: ${apiCheck.details.articlesCount}`);
  }
  console.log();
  
  // Summary
  console.log('📊 Summary:');
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warnCount = results.filter(r => r.status === 'warning').length;
  
  console.log(`   ✅ Pass: ${passCount}`);
  console.log(`   ⚠️  Warning: ${warnCount}`);
  console.log(`   ❌ Fail: ${failCount}`);
  console.log();
  
  // Recommendations
  if (failCount > 0 || warnCount > 0) {
    console.log('🔧 Recommendations:');
    
    if (consumerStatus.status === 'fail') {
      console.log('   1. Start transcript consumer:');
      console.log(`      curl -X POST ${FRONTEND_URL}/api/transcripts/start`);
      console.log();
    }
    
    if (consumerStatus.status === 'pass' && consumerStatus.details?.subscriptionCount === 0) {
      console.log('   2. Subscribe to transcript stream:');
      console.log(`      curl -X POST ${FRONTEND_URL}/api/transcripts/subscribe \\`);
      console.log(`        -H "Content-Type: application/json" \\`);
      console.log(`        -d '{"interactionId": "ab7cbdeac69d2a44ef890ecf164e19bh"}'`);
      console.log();
    }
    
    if (parsingCheck.status === 'warning') {
      console.log('   3. Fix transcript parsing - check if ElevenLabs SDK transforms data structure');
      console.log('      The code expects data.transcript but receives data.text');
      console.log();
    }
  }
  
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(console.error);

