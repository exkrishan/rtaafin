# 📺 How to View Exotel Transcripts in Dashboard

## 🎯 The Issue

The dashboard page (`/dashboard`) currently has a **hardcoded** `callId='call-123'`, but Exotel calls have different IDs (like `call-1762532332133` or the Exotel `call_sid`).

The `TranscriptPanel` automatically subscribes to transcripts via SSE using the `callId`, so it will only show transcripts that match that ID.

---

## ✅ Solution Options

### **Option 1: Use Test Transcripts Page** (Easiest - No Code Changes)

1. **Go to:** `https://your-frontend-url.onrender.com/test-transcripts`
2. **Enter your Exotel call ID** (e.g., `call-1762532332133` or the Exotel `call_sid`)
3. **Click "Subscribe to Transcripts"**
4. **Transcripts will appear automatically!**

This page allows you to manually enter any call ID and subscribe to it.

---

### **Option 2: Update Dashboard with Actual Call ID** (For Production)

**Find your Exotel Call ID:**

1. **Check Ingest Service logs** (Render dashboard):
   ```
   [exotel] Start event received via JSON
   {
     stream_sid: "...",
     call_sid: "CA1234567890abcdef",  ← This is your call ID
     ...
   }
   ```

2. **Or check ASR Worker logs:**
   ```
   [ASRWorker] 📥 Received audio chunk: {
     interaction_id: 'call-1762532332133',  ← This is your call ID
     ...
   }
   ```

3. **Update the dashboard:**
   
   **File:** `app/dashboard/page.tsx`
   
   Change line 53:
   ```typescript
   // BEFORE:
   const [callId] = useState('call-123');
   
   // AFTER (use your actual Exotel call ID):
   const [callId] = useState('call-1762532332133'); // Or your Exotel call_sid
   ```

4. **Deploy and refresh the dashboard page**

---

### **Option 3: Make Dashboard Dynamic** (Best for Production)

Update the dashboard to accept the call ID from URL parameters or a query string:

**File:** `app/dashboard/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
// ... other imports

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [callId, setCallId] = useState(
    searchParams?.get('callId') || 'call-123' // Default fallback
  );
  const [tenantId] = useState('default');
  // ... rest of component
```

Then access the dashboard with:
```
https://your-frontend-url.onrender.com/dashboard?callId=call-1762532332133
```

---

## 🔍 How to Find Your Exotel Call ID

### Method 1: Check Ingest Service Logs

1. Go to Render Dashboard → Ingest Service → Logs
2. Look for:
   ```
   [exotel] Start event received via JSON
   {
     stream_sid: "ST123...",
     call_sid: "CA123...",  ← This is your call ID
   }
   ```

### Method 2: Check ASR Worker Logs

1. Go to Render Dashboard → ASR Worker → Logs
2. Look for:
   ```
   [ASRWorker] 📥 Received audio chunk: {
     interaction_id: 'call-1762532332133',  ← This is your call ID
   }
   ```

### Method 3: Check Transcript Consumer Logs

1. Go to Render Dashboard → Frontend Service → Logs
2. Look for:
   ```
   [TranscriptConsumer] ✅ Forwarded transcript successfully
   {
     interaction_id: 'call-1762532332133',  ← This is your call ID
     callId: 'call-1762532332133',
   }
   ```

---

## ✅ Verification Checklist

After updating the call ID, verify:

1. **Dashboard loads** without errors
2. **SSE connection established:**
   - Open browser DevTools → Console
   - Look for: `[TranscriptPanel] SSE connection opened`
3. **Transcripts appear:**
   - Make an Exotel call
   - Transcripts should appear in real-time in the dashboard
4. **Check browser console** for any errors

---

## 🚨 Troubleshooting

### No Transcripts Appearing?

1. **Check if Transcript Consumer is running:**
   ```bash
   curl https://your-frontend-url.onrender.com/api/transcripts/status
   ```
   Should return: `{"running": true, "subscriptions": [...]}`

2. **Check if ASR Worker is publishing:**
   - Look for `[ASRWorker] Published partial transcript` in ASR Worker logs

3. **Check if Transcript Consumer is forwarding:**
   - Look for `[TranscriptConsumer] ✅ Forwarded transcript successfully` in Frontend logs

4. **Check SSE connection:**
   - Browser DevTools → Network → Look for `/api/events/stream?callId=...`
   - Should show "EventStream" type

5. **Verify call ID matches:**
   - The `callId` in dashboard must match the `interaction_id` from ASR Worker
   - Check both are using the same format

---

## 📝 Quick Test

1. **Make an Exotel call**
2. **Note the call ID from logs** (e.g., `call-1762532332133`)
3. **Go to:** `/test-transcripts`
4. **Enter the call ID** and click "Subscribe"
5. **Transcripts should appear!**

If transcripts appear in `/test-transcripts` but not in `/dashboard`, the issue is the hardcoded `callId` in the dashboard.

---

**Status:** ✅ Ready to use - just need to match the call ID!

