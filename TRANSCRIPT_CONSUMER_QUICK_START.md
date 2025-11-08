# 🚀 Transcript Consumer - Quick Start Guide

## ✅ Implementation Complete!

The transcript consumer is now fully implemented and ready to use. It automatically bridges ASR Worker transcripts to your frontend.

---

## 🎯 What It Does

1. **Auto-Discovers** transcript streams from Redis (`transcript.*`)
2. **Subscribes** to transcript topics automatically
3. **Forwards** transcripts to `/api/calls/ingest-transcript`
4. **Triggers** intent detection automatically
5. **Broadcasts** to SSE clients (frontend)

---

## 🚀 How to Use

### Automatic (Recommended)

The consumer **starts automatically** when your Next.js app starts (via `instrumentation.ts`).

Just start your Next.js app:
```bash
npm run dev
# or
npm start
```

The consumer will:
- Connect to Redis
- Start auto-discovery (every 5 seconds)
- Subscribe to any `transcript.*` streams it finds
- Process transcripts automatically

### Manual Start (If Needed)

If auto-start doesn't work, manually start it:

```bash
curl -X POST http://localhost:3000/api/transcripts/start
```

### Subscribe to Specific Interaction

If you know the `interaction_id` ahead of time:

```bash
curl -X POST http://localhost:3000/api/transcripts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "call-123"}'
```

---

## 📊 Monitor Status

Check consumer status:

```bash
curl http://localhost:3000/api/transcripts/status
```

Response:
```json
{
  "ok": true,
  "isRunning": true,
  "subscriptionCount": 2,
  "subscriptions": [
    {
      "interactionId": "call-123",
      "transcriptCount": 45,
      "createdAt": "2025-11-07T10:00:00.000Z"
    }
  ]
}
```

---

## 🧪 Testing

### Test Script

Run the test script to verify everything works:

```bash
npx tsx scripts/test-transcript-consumer.ts
```

This will:
1. Publish a test transcript to Redis
2. Wait for consumer to process it
3. Check consumer status
4. Verify the flow

### Manual Test

1. **Start Next.js app:**
   ```bash
   npm run dev
   ```

2. **Check consumer started:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```
   Should show `"isRunning": true`

3. **Make a call from Exotel:**
   - Call should flow: Exotel → Ingestion → ASR Worker
   - ASR Worker publishes transcripts to Redis
   - Consumer should auto-discover and subscribe

4. **Verify in logs:**
   - Look for `[TranscriptConsumer] Auto-discovered transcript stream`
   - Look for `[TranscriptConsumer] Received transcript message`
   - Look for `[TranscriptConsumer] ✅ Forwarded transcript successfully`

5. **Check frontend:**
   - Transcripts should appear in UI
   - Intent should be detected
   - KB articles should be surfaced

---

## 🔍 Troubleshooting

### Consumer Not Starting

1. **Check Next.js config:**
   ```javascript
   // next.config.js
   experimental: {
     instrumentationHook: true,
   }
   ```

2. **Check logs:**
   - Look for `[instrumentation] Starting transcript consumer...`
   - Look for `[TranscriptConsumer] Initialized`

3. **Manual start:**
   ```bash
   curl -X POST http://localhost:3000/api/transcripts/start
   ```

### Not Receiving Transcripts

1. **Check Redis connection:**
   - Verify `REDIS_URL` is set correctly
   - Check Redis is accessible

2. **Check ASR Worker:**
   - Verify ASR Worker is publishing to `transcript.*` topics
   - Check ASR Worker logs

3. **Check consumer status:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```
   - Should show active subscriptions
   - Should show `transcriptCount > 0` if processing

4. **Check logs:**
   - Look for `[TranscriptConsumer] Received transcript message`
   - Look for errors in forwarding

### Transcripts Not Appearing in UI

1. **Check API endpoint:**
   - Verify `/api/calls/ingest-transcript` is working
   - Check for errors in logs

2. **Check SSE:**
   - Verify frontend is connected to `/api/events/stream`
   - Check browser console for SSE events

3. **Check intent detection:**
   - Verify intent detection is working
   - Check for LLM API errors

---

## 📝 Configuration

### Environment Variables

Required:
- `REDIS_URL` - Redis connection URL
- `PUBSUB_ADAPTER` - Set to `redis_streams` (default)

Optional:
- `REDIS_CONSUMER_GROUP` - Consumer group (default: `agent-assist`)
- `REDIS_CONSUMER_NAME` - Consumer name (default: `consumer-{pid}`)
- `NEXT_PUBLIC_BASE_URL` - Base URL for internal API calls

### Next.js Config

Already configured in `next.config.js`:
```javascript
experimental: {
  instrumentationHook: true,
}
```

---

## ✅ Verification Checklist

- [ ] Consumer starts automatically (check logs)
- [ ] Consumer connects to Redis (check logs)
- [ ] Auto-discovery is running (check logs every 5 seconds)
- [ ] Transcripts are being received (check status API)
- [ ] Transcripts are forwarded to API (check Next.js logs)
- [ ] Intent detection is triggered (check logs)
- [ ] KB articles are surfaced (check frontend)
- [ ] Transcripts appear in UI (check frontend)

---

## 🎉 Success!

Once all checks pass, your complete end-to-end flow is working:

```
Exotel → Ingestion → Redis → ASR Worker → Redis → Transcript Consumer → Intent → KB Articles → Frontend
```

**System is 100% complete!** 🚀


## ✅ Implementation Complete!

The transcript consumer is now fully implemented and ready to use. It automatically bridges ASR Worker transcripts to your frontend.

---

## 🎯 What It Does

1. **Auto-Discovers** transcript streams from Redis (`transcript.*`)
2. **Subscribes** to transcript topics automatically
3. **Forwards** transcripts to `/api/calls/ingest-transcript`
4. **Triggers** intent detection automatically
5. **Broadcasts** to SSE clients (frontend)

---

## 🚀 How to Use

### Automatic (Recommended)

The consumer **starts automatically** when your Next.js app starts (via `instrumentation.ts`).

Just start your Next.js app:
```bash
npm run dev
# or
npm start
```

The consumer will:
- Connect to Redis
- Start auto-discovery (every 5 seconds)
- Subscribe to any `transcript.*` streams it finds
- Process transcripts automatically

### Manual Start (If Needed)

If auto-start doesn't work, manually start it:

```bash
curl -X POST http://localhost:3000/api/transcripts/start
```

### Subscribe to Specific Interaction

If you know the `interaction_id` ahead of time:

```bash
curl -X POST http://localhost:3000/api/transcripts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"interactionId": "call-123"}'
```

---

## 📊 Monitor Status

Check consumer status:

```bash
curl http://localhost:3000/api/transcripts/status
```

Response:
```json
{
  "ok": true,
  "isRunning": true,
  "subscriptionCount": 2,
  "subscriptions": [
    {
      "interactionId": "call-123",
      "transcriptCount": 45,
      "createdAt": "2025-11-07T10:00:00.000Z"
    }
  ]
}
```

---

## 🧪 Testing

### Test Script

Run the test script to verify everything works:

```bash
npx tsx scripts/test-transcript-consumer.ts
```

This will:
1. Publish a test transcript to Redis
2. Wait for consumer to process it
3. Check consumer status
4. Verify the flow

### Manual Test

1. **Start Next.js app:**
   ```bash
   npm run dev
   ```

2. **Check consumer started:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```
   Should show `"isRunning": true`

3. **Make a call from Exotel:**
   - Call should flow: Exotel → Ingestion → ASR Worker
   - ASR Worker publishes transcripts to Redis
   - Consumer should auto-discover and subscribe

4. **Verify in logs:**
   - Look for `[TranscriptConsumer] Auto-discovered transcript stream`
   - Look for `[TranscriptConsumer] Received transcript message`
   - Look for `[TranscriptConsumer] ✅ Forwarded transcript successfully`

5. **Check frontend:**
   - Transcripts should appear in UI
   - Intent should be detected
   - KB articles should be surfaced

---

## 🔍 Troubleshooting

### Consumer Not Starting

1. **Check Next.js config:**
   ```javascript
   // next.config.js
   experimental: {
     instrumentationHook: true,
   }
   ```

2. **Check logs:**
   - Look for `[instrumentation] Starting transcript consumer...`
   - Look for `[TranscriptConsumer] Initialized`

3. **Manual start:**
   ```bash
   curl -X POST http://localhost:3000/api/transcripts/start
   ```

### Not Receiving Transcripts

1. **Check Redis connection:**
   - Verify `REDIS_URL` is set correctly
   - Check Redis is accessible

2. **Check ASR Worker:**
   - Verify ASR Worker is publishing to `transcript.*` topics
   - Check ASR Worker logs

3. **Check consumer status:**
   ```bash
   curl http://localhost:3000/api/transcripts/status
   ```
   - Should show active subscriptions
   - Should show `transcriptCount > 0` if processing

4. **Check logs:**
   - Look for `[TranscriptConsumer] Received transcript message`
   - Look for errors in forwarding

### Transcripts Not Appearing in UI

1. **Check API endpoint:**
   - Verify `/api/calls/ingest-transcript` is working
   - Check for errors in logs

2. **Check SSE:**
   - Verify frontend is connected to `/api/events/stream`
   - Check browser console for SSE events

3. **Check intent detection:**
   - Verify intent detection is working
   - Check for LLM API errors

---

## 📝 Configuration

### Environment Variables

Required:
- `REDIS_URL` - Redis connection URL
- `PUBSUB_ADAPTER` - Set to `redis_streams` (default)

Optional:
- `REDIS_CONSUMER_GROUP` - Consumer group (default: `agent-assist`)
- `REDIS_CONSUMER_NAME` - Consumer name (default: `consumer-{pid}`)
- `NEXT_PUBLIC_BASE_URL` - Base URL for internal API calls

### Next.js Config

Already configured in `next.config.js`:
```javascript
experimental: {
  instrumentationHook: true,
}
```

---

## ✅ Verification Checklist

- [ ] Consumer starts automatically (check logs)
- [ ] Consumer connects to Redis (check logs)
- [ ] Auto-discovery is running (check logs every 5 seconds)
- [ ] Transcripts are being received (check status API)
- [ ] Transcripts are forwarded to API (check Next.js logs)
- [ ] Intent detection is triggered (check logs)
- [ ] KB articles are surfaced (check frontend)
- [ ] Transcripts appear in UI (check frontend)

---

## 🎉 Success!

Once all checks pass, your complete end-to-end flow is working:

```
Exotel → Ingestion → Redis → ASR Worker → Redis → Transcript Consumer → Intent → KB Articles → Frontend
```

**System is 100% complete!** 🚀

