# Memory Leak Fixes - OOM Crash Prevention

## 🔴 Critical Issue

Service was crashing every 5-7 minutes with:
```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
```

## ✅ Fixes Implemented

### Fix 1: Increased Node.js Heap Size (CRITICAL)
**File:** `package.json`

**Before:**
```json
"start": "NODE_OPTIONS='--max-old-space-size=120' next start"
```

**After:**
```json
"start": "NODE_OPTIONS='--max-old-space-size=400' next start"
```

**Impact:**
- Increased heap from 120MB to 400MB (3.3x increase)
- Gives Next.js + services enough memory to operate
- Prevents rapid OOM crashes
- **This is the most critical fix**

### Fix 2: Added Hard Limit to SSE Clients
**File:** `lib/realtime.ts`

**Added:**
- `MAX_SSE_CLIENTS = 100` constant
- Automatic cleanup when limit reached (removes 10 oldest clients)
- Prevents unbounded growth of SSE connections

**Impact:**
- Limits concurrent SSE connections to 100
- Automatically removes oldest connections when limit reached
- Prevents memory leak from accumulating SSE clients

### Fix 3: Fixed Dead Letter Queue Memory Leak
**File:** `lib/transcript-consumer.ts`

**Changed:**
- Permanently failed items (retryCount >= 5) are now **removed** instead of kept
- Added clear logging when items are permanently removed
- Prevents dead-letter queue from growing unbounded

**Impact:**
- Failed transcripts are removed after 5 retry attempts
- Prevents dead-letter queue from consuming memory indefinitely
- Reduces memory pressure from failed operations

## 📊 Expected Results

After these fixes:
1. ✅ **No more OOM crashes** - 400MB heap provides sufficient memory
2. ✅ **SSE clients limited** - Maximum 100 concurrent connections
3. ✅ **Dead-letter queue bounded** - Failed items removed after max retries
4. ✅ **Memory usage stabilized** - All unbounded structures now have limits

## 🧪 Monitoring

After deployment, monitor:
1. **Memory usage** in Render dashboard (should stay < 400MB)
2. **SSE client count** via health endpoint
3. **Dead-letter queue size** via health endpoint
4. **Crash frequency** (should drop to zero)

## 🚀 Deployment

These fixes are ready to deploy. After deployment:
- Service should stop crashing every 5-7 minutes
- Memory usage should stabilize
- All unbounded data structures now have limits

