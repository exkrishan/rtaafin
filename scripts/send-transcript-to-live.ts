/**
 * Send Transcript to Live UI Script
 * 
 * This script:
 * 1. Registers a call in the call registry (for auto-discovery)
 * 2. Sends transcript chunks to /api/calls/ingest-transcript
 * 3. Frontend auto-discovers the call and displays transcripts
 * 
 * Usage:
 *   npx tsx scripts/send-transcript-to-live.ts [frontend-url]
 * 
 * Example:
 *   npx tsx scripts/send-transcript-to-live.ts https://frontend-8jdd.onrender.com
 */

// Dynamic import for ioredis
let ioredis: any = null;
try {
  ioredis = require('ioredis');
} catch (e) {
  console.error('❌ ioredis not available. Install it: npm install ioredis');
  process.exit(1);
}

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const FRONTEND_URL = process.argv[2] || process.env.FRONTEND_URL || 'https://frontend-8jdd.onrender.com';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

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

interface CallMetadata {
  interactionId: string;
  callSid: string;
  from: string;
  to: string;
  tenantId: string;
  startTime: number;
  status: 'active' | 'ended';
  lastActivity: number;
}

async function registerCallInRegistry(
  redis: any,
  interactionId: string,
  metadata: Omit<CallMetadata, 'interactionId'>
): Promise<void> {
  const CALL_METADATA_KEY_PREFIX = 'call:metadata:';
  const CALL_METADATA_TTL_SECONDS = 3600; // 1 hour

  const callMetadata: CallMetadata = {
    interactionId,
    ...metadata,
  };

  try {
    const key = `${CALL_METADATA_KEY_PREFIX}${interactionId}`;
    await redis.setex(
      key,
      CALL_METADATA_TTL_SECONDS,
      JSON.stringify(callMetadata)
    );
    console.log(`✅ Registered call in registry: ${interactionId}`);
  } catch (error: any) {
    console.error(`❌ Failed to register call:`, error.message);
    throw error;
  }
}

async function sendTranscriptChunk(
  frontendUrl: string,
  callId: string,
  seq: number,
  text: string,
  tenantId: string = 'default'
): Promise<boolean> {
  const url = `${frontendUrl}/api/calls/ingest-transcript`;
  
  // Use https module directly - avoids undici File API compatibility issues
  // This is the most reliable approach for Node.js
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
      // This is our "special pass" to bypass TLS certificate validation
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
  console.log('🚀 Sending Transcript to Live UI\n');
  console.log('='.repeat(60));
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Redis URL: ${REDIS_URL.replace(/:[^:@]+@/, ':****@')}\n`);

  // Generate unique call ID
  const callId = `demo-call-${Date.now()}`;
  const tenantId = 'default';

  console.log(`📞 Call ID: ${callId}\n`);

  // Step 1: Connect to Redis and register call
  console.log('Step 1: Registering call in call registry...');
  let redis: any = null;
  
  try {
    redis = new ioredis(REDIS_URL, {
      retryStrategy: (times: number) => {
        if (times > 5) return null;
        return Math.min(times * 50, 1000);
      },
      maxRetriesPerRequest: null,
    });

    await redis.ping();
    console.log('✅ Connected to Redis');

    // Register call
    await registerCallInRegistry(redis, callId, {
      callSid: callId,
      from: '+91-XXXX-1234',
      to: '+91-XXXX-5678',
      tenantId,
      startTime: Date.now(),
      status: 'active',
      lastActivity: Date.now(),
    });

    console.log('✅ Call registered successfully\n');
  } catch (error: any) {
    console.error('❌ Failed to register call:', error.message);
    console.log('⚠️  Continuing anyway - frontend may not auto-discover, but transcripts will still be sent\n');
  }

  // Step 2: Verify frontend is accessible
  console.log('Step 2: Verifying frontend accessibility...');
  try {
    const healthCheck = await fetch(`${FRONTEND_URL}/api/health`).catch(() => null);
    if (healthCheck && healthCheck.ok) {
      console.log('✅ Frontend is accessible');
    } else {
      console.log('⚠️  Frontend health check failed, but continuing...');
    }
  } catch (error: any) {
    console.log(`⚠️  Could not verify frontend health: ${error.message}`);
    console.log('   Continuing anyway - endpoint might still work...');
  }
  
  console.log('Step 3: Waiting for auto-discovery...');
  await sleep(2000); // Give frontend 2 seconds to discover the call
  console.log('✅ Ready to send transcripts\n');

  // Step 4: Send transcript chunks
  console.log('Step 4: Sending transcript chunks...\n');
  
  let successCount = 0;
  for (let i = 0; i < sampleTranscript.length; i++) {
    const line = sampleTranscript[i];
    const seq = i + 1;
    const text = `${line.speaker === 'agent' ? 'Agent' : 'Customer'}: ${line.text}`;

    const success = await sendTranscriptChunk(FRONTEND_URL, callId, seq, text, tenantId);
    if (success) {
      successCount++;
    }

    // Wait between chunks (simulate real-time)
    if (i < sampleTranscript.length - 1) {
      await sleep(1500); // 1.5 seconds between chunks
    }
  }

  // Step 5: Update last activity
  if (redis) {
    try {
      const key = `call:metadata:${callId}`;
      const existing = await redis.get(key);
      if (existing) {
        const metadata: CallMetadata = JSON.parse(existing);
        metadata.lastActivity = Date.now();
        await redis.setex(key, 3600, JSON.stringify(metadata));
      }
    } catch (error: any) {
      console.warn('⚠️  Failed to update last activity:', error.message);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary\n');
  console.log(`Call ID: ${callId}`);
  console.log(`Transcript chunks sent: ${successCount}/${sampleTranscript.length}`);
  console.log(`Frontend URL: ${FRONTEND_URL}/live`);
  console.log('\n✅ Transcript sent successfully!');
  console.log('\n📝 Next Steps:');
  console.log(`1. Open this URL in your browser (callId pre-filled):`);
  console.log(`   ${FRONTEND_URL}/live?callId=${callId}`);
  console.log(`\n   Or manually add ?callId=${callId} to the URL`);
  console.log('\n2. Transcripts should appear in the right panel');
  console.log('3. KB articles and intent should be detected automatically');
  console.log('\n💡 Note: If auto-discovery doesn\'t work, use the URL with callId parameter above\n');

  // Cleanup
  if (redis) {
    await redis.quit();
  }

  process.exit(successCount === sampleTranscript.length ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

