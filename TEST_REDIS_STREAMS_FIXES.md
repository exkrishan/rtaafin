# 🧪 Testing Redis Streams Adapter Fixes Locally

This guide helps you test the enhanced validation and error handling in the Redis Streams adapter.

## Prerequisites

1. **Redis running locally or accessible**
   - Local: `redis-server` (if installed)
   - Or use the same Redis URL from production (from `.env.local`)

2. **Environment variables set**
   - Check your `.env.local` for `REDIS_URL`

## Quick Test (Frontend Service)

The frontend service uses the Redis Streams adapter via the `TranscriptConsumer`. Here's how to test:

### Step 1: Start Frontend Service

```bash
# From project root
npm run dev
```

This starts Next.js on `http://localhost:3000`

### Step 2: Monitor Logs

Watch the console output for:
- `[RedisStreamsAdapter] 🔍 Message structure analysis` - Shows actual message structure on first read
- `[RedisStreamsAdapter] ❌ Invalid messageEntry format` - Catches malformed messages
- `[RedisStreamsAdapter] ❌ Invalid msgId format` - Catches invalid message IDs
- `[RedisStreamsAdapter] ❌ Invalid message format: fields is not an array` - Catches invalid fields

### Step 3: Trigger Transcript Flow

#### Option A: Use Demo Page (Easiest)

1. Open `http://localhost:3000/demo`
2. Click "Start Call"
3. Watch console logs for transcript processing

#### Option B: Simulate Real Call

1. Open `http://localhost:3000/test-agent-assist`
2. The UI will auto-connect to active calls
3. If you have an active call, transcripts will flow through

### Step 4: Check Logs for Validation

Look for these log patterns:

**✅ Good (Validation Working):**
```
[RedisStreamsAdapter] 🔍 Message structure analysis for transcript.xxx: {
  messagesCount: 10,
  firstMessageType: 'object',
  firstMessageIsArray: true,
  ...
}
[TranscriptConsumer] ✅ Forwarded transcript successfully
```

**⚠️ Caught (Validation Catching Issues):**
```
[RedisStreamsAdapter] ❌ Invalid messageEntry format (not array): expected [msgId, fields], got: {
  index: 0,
  messageEntry: 'data',
  ...
}
```

## Detailed Test: Simulate Malformed Messages

To test the validation more thoroughly, you can manually inject malformed messages into Redis:

### Step 1: Connect to Redis

```bash
# Using redis-cli (if installed locally)
redis-cli -u $REDIS_URL

# Or using Node.js script
node -e "
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
// Test commands below
"
```

### Step 2: Create Test Stream with Malformed Message

```bash
# In redis-cli or Node.js:

# 1. Create a normal message (should work)
XADD transcript.test-call-123 * data '{"interaction_id":"test-call-123","text":"Hello","seq":1}'

# 2. Try to read it (should work)
XREADGROUP GROUP agent-assist consumer-1 STREAMS transcript.test-call-123 0
```

### Step 3: Check Frontend Logs

The frontend service should:
1. Subscribe to `transcript.test-call-123`
2. Read the message
3. Process it successfully
4. Show debug logs with message structure

## Test Script: Automated Validation Test

Create a test script to verify the fixes:

```bash
# Create test script
cat > scripts/test-redis-validation.ts << 'EOF'
import { RedisStreamsAdapter } from '../lib/pubsub/adapters/redisStreamsAdapter';
import { MessageEnvelope } from '../lib/pubsub/types';

async function testValidation() {
  const adapter = new RedisStreamsAdapter({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  await adapter.connect();

  // Test 1: Subscribe to a test topic
  const handler = async (msg: MessageEnvelope) => {
    console.log('✅ Received valid message:', msg);
  };

  const subscription = await adapter.subscribe('transcript.test-validation', handler);
  console.log('✅ Subscribed to transcript.test-validation');

  // Test 2: Publish a valid message
  await adapter.publish('transcript.test-validation', {
    interaction_id: 'test-validation',
    text: 'Test message',
    seq: 1,
    type: 'partial',
    timestamp_ms: Date.now(),
  });
  console.log('✅ Published valid message');

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Cleanup
  await adapter.unsubscribe(subscription);
  await adapter.disconnect();
  console.log('✅ Test complete');
}

testValidation().catch(console.error);
EOF

# Run test
npx tsx scripts/test-redis-validation.ts
```

## What to Look For

### ✅ Success Indicators

1. **Message Structure Logging**
   - On first read, you should see: `[RedisStreamsAdapter] 🔍 Message structure analysis`
   - This shows the actual structure of messages from Redis

2. **Valid Messages Processed**
   - `[TranscriptConsumer] ✅ Forwarded transcript successfully`
   - Transcripts appear in UI

3. **Invalid Messages Caught**
   - `[RedisStreamsAdapter] ❌ Invalid messageEntry format` - Message skipped gracefully
   - Service continues processing other messages

### ⚠️ Issues to Watch For

1. **No Structure Logging**
   - If you don't see the debug log, messages might not be flowing
   - Check Redis connection

2. **Validation Errors Still Occurring**
   - If you see the same errors after fix, check:
     - Code is deployed/restarted
     - Redis response structure is different than expected
     - Check the debug logs for actual structure

3. **Messages Not Processing**
   - Check Redis connection
   - Check consumer group exists
   - Check message format in Redis

## Testing with Real Production Data

To test with actual production data (from Render):

1. **Use Production Redis URL**
   ```bash
   # In .env.local
   REDIS_URL=redis://default:password@your-redis-host:port
   ```

2. **Start Frontend Service**
   ```bash
   npm run dev
   ```

3. **Monitor Logs**
   - Watch for the validation errors you saw in production
   - Check if they're now caught and logged properly
   - Verify messages are still processed (valid ones)

4. **Check UI**
   - Open `http://localhost:3000/test-agent-assist`
   - Verify transcripts still appear (if valid)
   - Invalid messages should be skipped without crashing

## Expected Behavior After Fix

### Before Fix:
- ❌ Errors: `TypeError: a.findIndex is not a function`
- ❌ Service crashes or stops processing
- ❌ No clear indication of what went wrong

### After Fix:
- ✅ Errors caught: `[RedisStreamsAdapter] ❌ Invalid messageEntry format`
- ✅ Service continues processing other messages
- ✅ Clear error messages with context
- ✅ Debug logging shows actual message structure
- ✅ Valid messages still process correctly

## Troubleshooting

### Issue: No logs appearing

**Solution:** Check that:
1. Frontend service is running (`npm run dev`)
2. Redis connection is working
3. Transcript consumer is active (check `/api/transcripts/status`)

### Issue: Still seeing old errors

**Solution:**
1. Restart the frontend service
2. Clear Next.js cache: `rm -rf .next`
3. Rebuild: `npm run build && npm run dev`

### Issue: Messages not processing

**Solution:**
1. Check Redis connection: `redis-cli -u $REDIS_URL ping`
2. Check consumer group exists
3. Check message format in Redis: `XREADGROUP GROUP agent-assist consumer-1 STREAMS transcript.test 0`

## Next Steps

After local testing:
1. ✅ Verify validation catches malformed messages
2. ✅ Verify valid messages still process
3. ✅ Check debug logs show actual structure
4. ✅ Deploy to Render
5. ✅ Monitor production logs for improvements

