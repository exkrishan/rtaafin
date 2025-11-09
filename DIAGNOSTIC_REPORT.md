# 🔍 Diagnostic Report - Test 3 Still Failing

**Date:** 2025-11-09  
**Status:** ❌ **Metrics still zero after all fixes**

---

## Fixes Applied

### ✅ Fix 1: First Read from Beginning (Commit `70e5aa2`)
- First read uses `'0'` instead of `'>'`
- Should catch existing messages

### ✅ Fix 2: Pending Message Handling (Commit `09b394b`)
- Checks for pending messages on first read
- Claims and processes pending messages

### ✅ Fix 3: Consumer Group Reset (Commit `829ba3f`)
- Resets consumer group position to `0` when group exists
- Uses `XGROUP SETID` command

---

## Current Status

**Test Results:**
- ✅ Test 1: Both services healthy
- ✅ Test 2: WebSocket connects, audio sent successfully
- ❌ Test 3: Metrics still zero/null after 30+ seconds

**Metrics:**
```json
{
  "audioChunksSent": null,
  "transcriptsReceived": null,
  "connectionsCreated": null
}
```

---

## Possible Issues

### 1. Consumer Group Reset Not Working
- `XGROUP SETID` might be failing silently
- Consumer group might not exist yet
- Stream might not exist when reset is attempted

### 2. Messages Not Being Published
- Ingest service might not be publishing to Redis
- Redis connection might be failing
- Topic name mismatch (unlikely - both use `audio_stream`)

### 3. Messages Not Being Consumed
- ASR Worker subscription might not be working
- Consumer group might be reading from wrong position
- Messages might be getting ACKed before processing

### 4. Metrics Not Initialized
- Metrics might be `null` because no messages processed
- Metrics collector might not be initialized
- Deepgram provider might not be updating metrics

---

## Next Steps to Debug

### 1. Check Render Logs (CRITICAL)

**ASR Worker Logs - Look for:**
```
[RedisStreamsAdapter] ✅ Reset existing consumer group asr-worker for audio_stream to position 0
[RedisStreamsAdapter] 🔍 First read for audio_stream, reading from beginning (position: 0)
[RedisStreamsAdapter] ✅ First read completed for audio_stream, found X message(s)
[ASRWorker] 📥 Received audio chunk
```

**Ingest Service Logs - Look for:**
```
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', topic: 'audio_stream' }
[exotel] Published audio frame
```

### 2. Verify Consumer Group Reset

The reset happens in `ensureConsumerGroup`:
```typescript
await this.redis.xgroup('SETID', topic, groupName, '0');
```

**Check if this is being called and succeeding.**

### 3. Verify Messages in Redis

If possible, check Redis directly:
```bash
redis-cli -u <REDIS_URL>
XREAD STREAMS audio_stream 0
XINFO GROUPS audio_stream
XPENDING audio_stream asr-worker
```

### 4. Check Subscription Timing

The subscription happens in `AsrWorker.start()`:
```typescript
const audioHandle = await this.pubsub.subscribe(audioTopicName, async (msg) => {
  await this.handleAudioFrame(msg as any);
});
```

**Verify this is being called and handler is registered.**

---

## Most Likely Issue

**Consumer group reset might be failing silently**, or **messages are being published after the first read completes**, causing them to be missed.

The fix should work, but we need to verify:
1. Consumer group reset is actually happening
2. First read is catching messages
3. Messages are being published before first read completes

---

## Recommendation

**Check Render logs first** to see:
1. If consumer group reset is happening
2. If first read is finding messages
3. If ASR Worker is receiving audio chunks

If logs show reset is happening but no messages found, the issue is timing - messages published after first read.

If logs show no reset happening, the issue is the reset logic itself.
