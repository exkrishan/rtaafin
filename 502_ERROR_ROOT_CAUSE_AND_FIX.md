# 502 Bad Gateway Error - Root Cause and Fix

## 🔍 Root Cause Analysis

### Problem Identified
The frontend service was experiencing **502 Bad Gateway** errors when:
- Auto-discovering calls via `/api/calls/active`
- Connecting to SSE streams via `/api/events/stream`

### Root Cause: Memory Leak from Unbounded Subscriptions

**The Issue:**
1. Transcript Consumer auto-discovers ALL transcript streams in Redis
2. Subscribes to each stream (creates Redis consumer groups, keeps connections open)
3. **NEVER unsubscribes** when calls end
4. Subscriptions accumulate indefinitely:
   - Each subscription holds:
     - Redis connection
     - Consumer group
     - Memory for message handlers
     - Event listeners
   - After many calls, memory usage grows unbounded
   - Server runs out of memory → crashes → 502 errors

**Evidence from Logs:**
- 8+ active subscriptions found in health check
- Multiple old call IDs still subscribed:
  - `demo-call-1764124172366`
  - `test-1764104419`
  - `call_51fe647094ab27fa`
  - `42f4e00956dfa8eb9c3ab066ee6b19bq`
  - And more...

## ✅ Fixes Implemented

### Fix 1: Unsubscribe When Call Ends
**File:** `app/api/calls/end/route.ts`

Added cleanup when calls end:
```typescript
// CRITICAL FIX: Unsubscribe from transcript streams when call ends
await unsubscribeFromTranscripts(interactionId);
```

**Impact:**
- Subscriptions are cleaned up immediately when calls end
- Prevents accumulation of old subscriptions

### Fix 2: Automatic Cleanup of Old Subscriptions
**File:** `lib/transcript-consumer.ts`

Added periodic cleanup (runs every 5 seconds):
```typescript
private async cleanupEndedCallSubscriptions(): Promise<void> {
  // Check call registry for ended calls
  // Unsubscribe from calls that are:
  // - Not in active calls list, AND
  // - Older than 1 hour
}
```

**Impact:**
- Automatically cleans up subscriptions for ended calls
- Handles cases where `/api/calls/end` wasn't called
- Prevents memory leaks from missed cleanup

### Fix 3: Safety Limit on Subscriptions
**File:** `lib/transcript-consumer.ts`

Added maximum subscription limit:
```typescript
const MAX_SUBSCRIPTIONS = 50; // Limit to 50 active subscriptions

// If limit reached:
// 1. Try to clean up ended calls first
// 2. If still at limit, remove oldest subscriptions
```

**Impact:**
- Prevents unbounded memory growth
- Ensures server stability even with many concurrent calls
- Automatic cleanup when limit is reached

## 📊 Expected Results

After these fixes:
1. ✅ Subscriptions are cleaned up when calls end
2. ✅ Old subscriptions are automatically removed
3. ✅ Maximum 50 active subscriptions (prevents memory issues)
4. ✅ 502 errors should stop occurring
5. ✅ Server memory usage should stabilize

## 🧪 Testing

To verify the fixes work:

1. **Check subscription count:**
   ```bash
   curl https://frontend-8jdd.onrender.com/api/health | jq '.transcriptConsumer.subscriptionsCount'
   ```
   Should stay below 50 and decrease when calls end.

2. **Make a test call:**
   - Start a call from Exotel
   - Check subscriptions increase
   - End the call
   - Check subscriptions decrease (cleanup working)

3. **Monitor memory:**
   - Check Render dashboard → Metrics
   - Memory should stabilize (not grow unbounded)

## 🚀 Deployment

These fixes are ready to deploy. After deployment:
- Old subscriptions will be cleaned up automatically
- New calls will have subscriptions cleaned up when they end
- Memory usage should stabilize

## 📝 Additional Recommendations

1. **Monitor subscription count:**
   - Add alert if subscriptions > 40
   - Review if limit needs adjustment

2. **Consider subscription TTL:**
   - Add automatic expiration for subscriptions older than 2 hours
   - Even if call registry doesn't mark them as ended

3. **Upgrade Render plan:**
   - Free tier has memory limits
   - Paid plans have more resources
   - Consider if production load requires upgrade

