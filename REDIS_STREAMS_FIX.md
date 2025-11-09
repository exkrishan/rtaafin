# 🔧 Redis Streams Consumer Group Fix

**Date:** 2025-11-09  
**Issue:** Test 3 showing zero metrics - audio not being consumed  
**Root Cause:** Redis Streams consumer group read position timing issue

---

## Problem

When ASR Worker subscribes to Redis Streams:
1. Consumer group is created from position `0` (beginning)
2. First read uses `'>'` (new messages only)
3. Messages published **before** first read are **missed**
4. Result: Zero metrics, no audio processed

---

## Solution

**Modified:** `lib/pubsub/adapters/redisStreamsAdapter.ts`

### Changes

1. **Added tracking fields to `RedisSubscription`:**
   - `firstRead: boolean` - Track if this is the first read
   - `lastReadId: string` - Track last read message ID

2. **Smart read position logic:**
   - **First read:** Use `'0'` to read from beginning (catch existing messages)
   - **Subsequent reads:** Use `'>'` to read only new messages
   - **Resume:** Use `lastReadId` to continue from where we left off

3. **Enhanced logging:**
   - Log when first read starts
   - Log how many messages were found
   - Log when switching to `'>'` mode
   - Log processed message counts

### Code Changes

```typescript
// Before: Always used '>'
'>' // Read new messages

// After: Smart read position
let readPosition: string;
if (subscription.firstRead) {
  readPosition = '0'; // First read: catch existing messages
} else if (subscription.lastReadId && subscription.lastReadId !== '0') {
  readPosition = subscription.lastReadId; // Resume from last position
} else {
  readPosition = '>'; // Subsequent reads: new messages only
}
```

---

## Benefits

1. ✅ **Catches existing messages** - First read from `'0'` ensures no messages are missed
2. ✅ **Efficient subsequent reads** - Uses `'>'` for new messages only
3. ✅ **Better observability** - Enhanced logging shows exactly what's happening
4. ✅ **Backward compatible** - Existing subscriptions continue to work

---

## Testing

After deployment, Test 3 should now:
1. ✅ Read existing messages from Redis Stream
2. ✅ Process audio chunks
3. ✅ Show non-zero metrics
4. ✅ Create Deepgram connections
5. ✅ Send audio to Deepgram

---

## Deployment

1. **Build library:**
   ```bash
   cd lib/pubsub && npm run build
   ```

2. **Deploy services:**
   - ASR Worker will automatically use the fix
   - No configuration changes needed

3. **Verify:**
   - Check ASR Worker logs for: `[RedisStreamsAdapter] First read for audio_stream`
   - Check metrics: Should show non-zero `audioChunksSent`

---

## Expected Log Output

```
[RedisStreamsAdapter] First read for audio_stream, reading from beginning (position: 0) to catch existing messages
[RedisStreamsAdapter] ✅ First read completed for audio_stream, found 5 message(s). Switching to '>' for new messages only.
[RedisStreamsAdapter] ✅ Processed 5 message(s) from audio_stream
[ASRWorker] 📥 Received audio chunk: { interaction_id: 'test-call-...', ... }
```

---

## Impact

- **Fixes:** Test 3 zero metrics issue
- **Improves:** Message consumption reliability
- **Enhances:** Observability with better logging
- **Maintains:** Backward compatibility

