# Stale Transcript Fix - Old Data Continuously Polling

## 🐛 **The Problem You Reported**

Looking at your Network tab and API response, you were seeing:

```json
{
  "ok": true,
  "callId": "58635918b386aa49d4119aa59c2919br",
  "transcripts": [
    {
      "timestamp": "2025-11-27T17:06:23.199Z",  // Nov 27 (YESTERDAY!)
      ...
    },
    ...14 transcripts total from Nov 27
  ],
  "count": 14
}
```

**Key Issues:**
- ❌ Transcripts from **Nov 27** being served on **Nov 28**
- ❌ **24+ hours old** data being continuously polled
- ❌ Network tab showing **repeated `/latest?callId=...` calls** with same old data
- ❌ No freshness validation before returning cached data

---

## 🔍 **Root Cause**

The in-memory cache stored transcripts with a 1-hour TTL, but:

1. **No freshness check** in `/api/transcripts/latest`
   - Would return ANY cached data, even 24+ hours old
   - No timestamp validation

2. **No freshness check** in `getLatestCallIdFromCache()`
   - Auto-discovery could pick up calls from yesterday
   - Only checked if data existed, not if it was recent

3. **Cleanup ran every 5 minutes** but UI polled faster
   - Cleanup happened, but too slowly
   - UI kept polling the old callId

### The Flow That Caused the Issue:

```
Nov 27, 5:06 PM  │ Call happens, transcripts cached
                 │ callId: 58635918b386aa49d4119aa59c2919br
                 │
Nov 27, 6:06 PM  │ Cache cleanup (1 hour TTL)
                 │ ❌ But call was "active" so timestamp updated
                 │
Nov 28, 5:15 PM  │ You open /live page
                 │ Auto-discovery calls /api/calls/latest
                 │ getLatestCallIdFromCache() returns old callId
                 │ ✅ Data exists, no age check!
                 │
Nov 28, 5:15 PM  │ UI polls /api/transcripts/latest?callId=...
                 │ Cache returns 14 old transcripts
                 │ ✅ No freshness validation!
                 │
Result           │ UI continuously shows/polls 24-hour-old data ❌
```

---

## ✅ **The Fix**

### 1. **Added Freshness Check to `/api/transcripts/latest`**

```typescript
// app/api/transcripts/latest/route.ts

// FRESHNESS CHECK: Don't return stale cached transcripts (older than 1 hour)
if (cachedTranscripts.length > 0) {
  const latestTimestamp = cachedTranscripts[cachedTranscripts.length - 1].ts;
  const latestTime = new Date(latestTimestamp).getTime();
  const now = Date.now();
  const ageMinutes = (now - latestTime) / (1000 * 60);
  const MAX_AGE_MINUTES = 60; // 1 hour
  
  if (ageMinutes > MAX_AGE_MINUTES) {
    console.warn('[transcripts/latest] ⚠️ Cached transcripts are stale', {
      callId,
      ageMinutes: Math.round(ageMinutes),
      note: 'Transcripts older than 1 hour are considered stale',
    });
    
    return NextResponse.json({
      ok: true,
      callId,
      transcripts: [],  // Return empty
      count: 0,
      stale: true,      // Flag as stale
      ageMinutes: Math.round(ageMinutes),
    });
  }
}
```

**What this does:**
- ✅ Checks age of latest transcript
- ✅ Rejects if older than 60 minutes
- ✅ Returns empty array instead of stale data
- ✅ Includes `stale: true` flag for debugging
- ✅ Logs age in minutes

---

### 2. **Added Freshness Check to `getLatestCallIdFromCache()`**

```typescript
// lib/ingest-transcript-core.ts

export function getLatestCallIdFromCache() {
  const now = Date.now();
  const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
  
  for (const [callId, timestamp] of cacheTimestamps.entries()) {
    const age = now - timestamp;
    
    // Skip stale calls (older than 1 hour)
    if (age > MAX_AGE_MS) {
      console.log('[getLatestCallIdFromCache] ⚠️ Skipping stale call', {
        callId,
        ageMinutes: Math.round(age / (1000 * 60)),
        note: 'Call is older than 1 hour',
      });
      continue; // Skip to next call
    }
    
    // ... find latest non-stale call
  }
}
```

**What this does:**
- ✅ Filters out calls older than 1 hour
- ✅ Auto-discovery only sees fresh calls
- ✅ Logs skipped stale calls
- ✅ Returns null if all calls are stale

---

## 📊 **Before vs. After**

| Scenario | Before Fix | After Fix |
|----------|------------|-----------|
| **Transcript age: 24 hours** | ❌ Served from cache | ✅ Rejected (stale: true) |
| **Auto-discovery** | ❌ Found 24-hour-old call | ✅ Skips stale calls |
| **Polling behavior** | ❌ Continuous old data | ✅ Empty array returned |
| **UI display** | ❌ Shows old transcripts | ✅ Shows "Waiting for transcript" |
| **Network tab** | ❌ Repeated old data | ✅ Empty responses (stale) |

---

## 🧪 **How to Test After Deploy**

### Scenario 1: Fresh Transcripts (< 1 hour)

```bash
# Send transcript
curl -X POST https://frontend-8jdd.onrender.com/api/transcripts/receive \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-fresh-123",
    "seq": 1,
    "text": "Hello, I need help",
    "speaker": "customer"
  }'
```

**Expected:**
- ✅ UI shows transcript within 2 seconds
- ✅ `/api/transcripts/latest` returns data
- ✅ No `stale: true` flag

---

### Scenario 2: Stale Transcripts (> 1 hour)

**What happens:**
1. Transcript cached at 4:00 PM
2. You open UI at 5:15 PM (75 minutes later)

**Expected:**
- ✅ `/api/calls/latest` returns `null` (no active calls)
- ✅ `/api/transcripts/latest?callId=old-id` returns:
  ```json
  {
    "ok": true,
    "callId": "old-id",
    "transcripts": [],
    "count": 0,
    "stale": true,
    "ageMinutes": 75
  }
  ```
- ✅ UI shows "Waiting for transcript..."
- ✅ No continuous polling of old data

---

### Scenario 3: Check Browser Console

After deploying, open browser console and look for:

**For stale transcripts:**
```
[transcripts/latest] ⚠️ Cached transcripts are stale, returning empty
{
  callId: "58635918b386aa49d4119aa59c2919br",
  ageMinutes: 1440,  // 24 hours
  note: "Transcripts older than 1 hour are considered stale"
}
```

**For auto-discovery:**
```
[getLatestCallIdFromCache] ⚠️ Skipping stale call
{
  callId: "58635918b386aa49d4119aa59c2919br",
  ageMinutes: 1440,
  note: "Call is older than 1 hour"
}

[getLatestCallIdFromCache] No active calls found (all stale or empty)
```

---

## 🚀 **Deployment Instructions**

### Latest Commit: `99bfd1b`

Includes ALL previous fixes PLUS:
- ✅ Route conflict fix
- ✅ Clear UI state fix
- ✅ Race condition fix
- ✅ **Stale transcript fix** ← **NEW!**

### Deploy Steps:

1. **Go to Render Dashboard:**
   - https://dashboard.render.com

2. **Select Service:**
   - Click `frontend-8jdd` (or your service name)

3. **Manual Deploy:**
   - Click "Manual Deploy" button
   - Select "Clear build cache & deploy"
   - Verify shows commit **`99bfd1b`**
   - Click "Deploy"

4. **Wait for Build:**
   - Takes ~5-10 minutes
   - Watch for "Live" status

5. **Verify Fix:**
   - Open https://frontend-8jdd.onrender.com/live
   - Check Network tab - should NOT see continuous old data
   - Should see "Waiting for transcript..." if no active calls
   - Console should show freshness warnings for stale data

---

## 📝 **What Changed**

### Files Modified:

1. **`app/api/transcripts/latest/route.ts`**
   - Added freshness validation (60-minute max age)
   - Returns empty with `stale: true` if too old
   - Logs age for debugging

2. **`lib/ingest-transcript-core.ts`**
   - Updated `getLatestCallIdFromCache()` to filter stale calls
   - Added logging for skipped stale calls
   - Only returns calls active in last hour

---

## 🎯 **Expected Behavior After Deploy**

### Opening `/live` Page:

**If no active calls (or only stale calls):**
```
1. Auto-discovery polls every 2 seconds
2. /api/calls/latest returns null (all stale)
3. UI shows "Waiting for transcript..."
4. No continuous polling of old callIds
5. Network tab shows clean responses (no old data)
```

**If fresh call exists:**
```
1. Auto-discovery finds call (< 1 hour old)
2. UI picks up callId
3. Transcripts stream in
4. KB suggestions appear
5. All data is fresh (< 1 hour)
```

**If you try to poll a stale call manually:**
```
1. /api/transcripts/latest?callId=old-id
2. Response: { stale: true, transcripts: [], ageMinutes: 75 }
3. UI clears and shows "Waiting for transcript..."
4. Auto-discovery finds next fresh call (if any)
```

---

## 🔍 **Why This Fix is Important**

| Issue | Impact Before | Impact After |
|-------|--------------|--------------|
| **Stale data served** | ❌ Confusing old transcripts | ✅ Clean UI state |
| **Continuous polling** | ❌ Wasted resources | ✅ Efficient polling |
| **Agent confusion** | ❌ "Is this the current call?" | ✅ Always current data |
| **Auto-discovery** | ❌ Picks up old calls | ✅ Only finds active calls |
| **Cache management** | ❌ Served anything in cache | ✅ Age-validated serving |

---

## ✅ **Summary**

**Problem:** Transcripts from Nov 27 being continuously served on Nov 28

**Root Cause:** No freshness validation before returning cached data

**Solution:**
1. Added 60-minute freshness check to `/api/transcripts/latest`
2. Added 60-minute filter to `getLatestCallIdFromCache()`
3. Stale data now rejected with `stale: true` flag

**Impact:**
- ✅ Only serve transcripts from last hour
- ✅ Stale calls excluded from auto-discovery
- ✅ No continuous polling of old data
- ✅ Clean UI experience

**Status:** ✅ Fixed, committed (`99bfd1b`), and pushed

---

**Deploy commit `99bfd1b` and stale transcripts will be blocked!** 🚀

