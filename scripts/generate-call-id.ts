/**
 * Generate Call ID and Frontend URL
 * 
 * This script:
 * 1. Generates a unique call ID
 * 2. Registers the call in Redis call registry
 * 3. Prints the frontend URL with callId parameter
 * 
 * Usage:
 *   npx tsx scripts/generate-call-id.ts [frontend-url]
 * 
 * Example:
 *   npx tsx scripts/generate-call-id.ts https://frontend-8jdd.onrender.com
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

async function main() {
  console.log('🎯 Generate Call ID and Frontend URL\n');
  console.log('='.repeat(60));
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Redis URL: ${REDIS_URL.replace(/:[^:@]+@/, ':****@')}\n`);

  // Generate unique call ID
  const callId = `demo-call-${Date.now()}`;
  const tenantId = 'default';

  console.log(`📞 Generated Call ID: ${callId}\n`);

  // Connect to Redis and register call
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
    console.log('⚠️  Call ID generated but not registered. You can still use it manually.\n');
  }

  // Print results
  console.log('='.repeat(60));
  console.log('\n📋 Results:\n');
  console.log(`Call ID: ${callId}`);
  console.log(`Frontend URL: ${FRONTEND_URL}/live?callId=${callId}`);
  console.log('\n📝 Next Steps:');
  console.log('1. Open the URL above in your browser');
  console.log('2. Wait for the page to load and connect (you should see "Waiting for transcript...")');
  console.log('3. Run the send-transcript script with this call ID:');
  console.log(`   npx tsx scripts/send-transcript-to-call.ts ${callId}`);
  console.log('4. Transcripts should appear in real-time!\n');

  // Cleanup
  if (redis) {
    await redis.quit();
  }

  // Exit with callId for potential scripting
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

