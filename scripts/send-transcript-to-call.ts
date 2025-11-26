/**
 * Send Transcripts to Specific Call ID
 * 
 * This script sends transcript chunks to a specific call ID.
 * Use this AFTER opening the frontend URL in your browser.
 * 
 * Usage:
 *   npx tsx scripts/send-transcript-to-call.ts <callId> [frontend-url]
 * 
 * Example:
 *   npx tsx scripts/send-transcript-to-call.ts demo-call-1764124172366 https://frontend-8jdd.onrender.com
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const CALL_ID = process.argv[2];
const FRONTEND_URL = process.argv[3] || process.env.FRONTEND_URL || 'https://frontend-8jdd.onrender.com';

// Sample transcript for testing
const sampleTranscript = [
  { speaker: 'agent', text: 'Good morning! Thank you for calling. How may I help you today?' },
  { speaker: 'customer', text: 'Hi, I need to block my credit card. It was stolen yesterday.' },
  { speaker: 'agent', text: 'I understand your concern. Let me help you block your credit card immediately.' },
  { speaker: 'customer', text: 'Thank you. I also noticed some unauthorized charges on my account.' },
  { speaker: 'agent', text: 'I can see those charges. We will investigate and reverse any fraudulent transactions.' },
  { speaker: 'customer', text: 'That would be great. How long will it take to get a new card?' },
  { speaker: 'agent', text: 'Your new card will be dispatched within 5-7 business days. Is there anything else I can help you with?' },
  { speaker: 'customer', text: 'No, that covers everything. Thank you for your help!' },
  { speaker: 'agent', text: 'You are welcome. Have a great day!' },
];

async function sendTranscriptChunk(
  frontendUrl: string,
  callId: string,
  seq: number,
  text: string,
  tenantId: string = 'default'
): Promise<boolean> {
  const url = `${frontendUrl}/api/calls/ingest-transcript`;
  
  // Use https module directly - avoids undici File API compatibility issues
  return new Promise<boolean>((resolve) => {
    const https = require('https');
    const { URL } = require('url');
    
    const urlObj = new URL(url);
    const bodyString = JSON.stringify({
      callId,
      seq,
      ts: new Date().toISOString(),
      text,
    });
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId,
        'Content-Length': Buffer.byteLength(bodyString),
      },
      // Create agent that allows self-signed certificates (demo only)
      agent: new https.Agent({
        rejectUnauthorized: false, // ⚠️ Demo only - disables cert validation
      }),
    };
    
    const req = https.request(options, (res: any) => {
      let responseData = '';
      
      res.on('data', (chunk: Buffer) => {
        responseData += chunk.toString();
      });
      
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errorData;
          try {
            errorData = JSON.parse(responseData);
          } catch {
            errorData = { error: responseData || `HTTP ${res.statusCode}` };
          }
          console.error(`❌ Failed to send transcript chunk ${seq} (HTTP ${res.statusCode}):`, errorData.error || res.statusMessage);
          resolve(false);
          return;
        }
        
        try {
          const data = JSON.parse(responseData);
          console.log(`✅ Sent transcript chunk ${seq}`, {
            text: text.substring(0, 50) + '...',
            intent: data.intent,
            kbArticles: data.articles?.length || 0,
          });
          resolve(true);
        } catch (parseError: any) {
          console.error(`❌ Failed to parse response for chunk ${seq}:`, parseError.message);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error: any) => {
      console.error(`❌ Request error for chunk ${seq}:`, error.message);
      resolve(false);
    });
    
    // Set timeout (30 seconds)
    req.setTimeout(30000, () => {
      req.destroy();
      console.error(`❌ Request timeout for chunk ${seq}`);
      resolve(false);
    });
    
    // Send the request
    req.write(bodyString);
    req.end();
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!CALL_ID) {
    console.error('❌ Error: Call ID is required');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/send-transcript-to-call.ts <callId> [frontend-url]');
    console.log('\nExample:');
    console.log('  npx tsx scripts/send-transcript-to-call.ts demo-call-1764124172366');
    console.log('\n💡 Tip: Use scripts/generate-call-id.ts to generate a call ID first');
    process.exit(1);
  }

  console.log('📤 Sending Transcripts to Call\n');
  console.log('='.repeat(60));
  console.log(`Call ID: ${CALL_ID}`);
  console.log(`Frontend URL: ${FRONTEND_URL}\n`);

  const tenantId = 'default';

  // Send transcript chunks
  console.log('Sending transcript chunks...\n');
  
  let successCount = 0;
  for (let i = 0; i < sampleTranscript.length; i++) {
    const line = sampleTranscript[i];
    const seq = i + 1;
    const text = `${line.speaker === 'agent' ? 'Agent' : 'Customer'}: ${line.text}`;

    const success = await sendTranscriptChunk(FRONTEND_URL, CALL_ID, seq, text, tenantId);
    if (success) {
      successCount++;
    }

    // Wait between chunks (simulate real-time)
    if (i < sampleTranscript.length - 1) {
      await sleep(1500); // 1.5 seconds between chunks
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary\n');
  console.log(`Call ID: ${CALL_ID}`);
  console.log(`Transcript chunks sent: ${successCount}/${sampleTranscript.length}`);
  console.log(`Frontend URL: ${FRONTEND_URL}/live?callId=${CALL_ID}`);
  console.log('\n✅ Transcripts sent successfully!');
  console.log('\n📝 Check your browser - transcripts should appear in real-time!\n');

  process.exit(successCount === sampleTranscript.length ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

