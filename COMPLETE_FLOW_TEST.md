# 🧪 Complete Flow Testing Guide

## Overview

This guide covers testing the complete end-to-end flow:
1. **WebSocket Ingestion** → Audio frames from Exotel
2. **Pub/Sub** → Audio messages to ASR worker
3. **ASR Worker** → Audio → Transcripts
4. **Transcript Ingestion API** → Process transcripts
5. **Intent Detection** → Classify customer intent
6. **KB Article Surfacing** → Recommend relevant articles

---

## Test Scripts

### 1. Transcript Flow Test (Recommended - Works Now)

Tests the complete pipeline from transcript ingestion to KB articles:

```bash
npx tsx scripts/test-transcript-flow.ts
```

**What it tests:**
- ✅ Transcript ingestion API
- ✅ Intent detection (credit card, debit card, account balance)
- ✅ KB article surfacing
- ✅ Accuracy of intent classification

**Test Cases:**
1. Credit Card Block
2. Account Balance Inquiry
3. Debit Card Issue

### 2. Complete Flow Test (Requires WebSocket Auth Fix)

Tests the full pipeline including WebSocket:

```bash
npx tsx scripts/test-complete-flow.ts
```

**What it tests:**
- ⚠️ WebSocket ingestion (currently fails due to 401 auth)
- ✅ Pub/Sub (if WebSocket works)
- ✅ ASR Worker metrics
- ✅ Transcript ingestion
- ✅ Intent detection
- ✅ KB articles

**Current Status:** WebSocket authentication is returning 401. Once fixed, this will test the complete flow.

---

## Manual Testing Steps

### Step 1: Verify Services Are Running

```bash
# Check all services
curl http://localhost:8443/health  # Ingestion
curl http://localhost:3001/health  # ASR Worker
curl http://localhost:3000/api/config  # Next.js (may return 500, that's OK)
```

### Step 2: Test Transcript Ingestion

```bash
curl -X POST http://localhost:3000/api/calls/ingest-transcript \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-call-123",
    "tenantId": "test-tenant",
    "transcript": "customer: I need to block my credit card.\nagent: I can help with that.",
    "chunks": [
      {"seq": 1, "speaker": "customer", "text": "I need to block my credit card.", "timestamp": 1234567890},
      {"seq": 2, "speaker": "agent", "text": "I can help with that.", "timestamp": 1234567891}
    ]
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "intent": "credit_card_block",
  "articles": [
    {
      "id": "...",
      "title": "How to Block Your Credit Card",
      "snippet": "...",
      "confidence": 0.95
    }
  ]
}
```

### Step 3: Test Intent Detection Accuracy

Test with different scenarios:

**Credit Card:**
```json
{
  "transcript": "customer: My credit card was stolen. I need to block it immediately."
}
```
Expected intent: `credit_card_block` or `credit_card_fraud`

**Debit Card:**
```json
{
  "transcript": "customer: My debit card is not working at the ATM."
}
```
Expected intent: `debit_card` or `debit_card_block`

**Account Balance:**
```json
{
  "transcript": "customer: What is my current account balance?"
}
```
Expected intent: `account_balance` or `account_inquiry`

### Step 4: Verify KB Articles

After intent detection, verify:
1. Articles are returned
2. Articles are relevant to the detected intent
3. Confidence scores are displayed
4. Articles are sorted by relevance

---

## WebSocket Testing (When Auth is Fixed)

### Generate JWT Token

```bash
node scripts/generate-test-jwt.js
```

### Test WebSocket Connection

```bash
cd services/ingest
JWT_TOKEN="<token-from-above>"
export JWT_TOKEN
./scripts/simulate_exotel_client.sh
```

**Expected Flow:**
1. ✅ WebSocket connects
2. ✅ Start event acknowledged
3. ✅ Audio frames sent
4. ✅ ACK messages received
5. ✅ Audio published to pub/sub
6. ✅ ASR worker processes audio
7. ✅ Transcripts generated

---

## Monitoring the Flow

### Check ASR Worker Metrics

```bash
curl http://localhost:3001/metrics | grep asr_
```

Look for:
- `asr_audio_chunks_processed_total` - Should increase as audio is processed
- `asr_errors_total` - Should be 0 or low
- `asr_first_partial_latency_ms` - Latency metrics

### Check Pub/Sub (In-Memory)

If using in-memory adapter, messages are delivered immediately. Check service logs for:
```
[pubsub] Published message to topic: audio.test-tenant
[asr-worker] Received audio frame: interaction_id=...
```

### Check Intent Detection Logs

Look for logs in Next.js console:
```
[intent] Detected intent: credit_card_block, confidence: 0.95
```

---

## Troubleshooting

### Issue: Intent Detection Returns "unknown"

**Possible causes:**
1. LLM_API_KEY not set
2. Gemini API quota exceeded
3. Transcript too short or unclear

**Solution:**
- Check `.env.local` has `LLM_API_KEY`
- Verify Gemini API key is valid
- Test with longer, clearer transcripts

### Issue: No KB Articles Returned

**Possible causes:**
1. No articles match the intent
2. KB search failing
3. Supabase connection issue

**Solution:**
- Check Supabase connection
- Verify KB articles exist in database
- Check search query in logs

### Issue: Wrong Intent Detected

**Example:** Credit card conversation detected as "salary account"

**Solution:**
- Check intent detection prompt in `lib/intent.ts`
- Verify transcript is clear and specific
- Test with more explicit keywords

### Issue: WebSocket 401 Error

**Current Status:** This is a known issue. The JWT authentication is failing.

**Debug steps:**
1. Check service logs for authentication errors
2. Verify JWT_PUBLIC_KEY is loaded correctly
3. Check token format matches expected format

---

## Success Criteria

✅ **Complete Flow Working When:**
1. WebSocket accepts audio frames (after auth fix)
2. Audio is published to pub/sub
3. ASR worker processes audio and generates transcripts
4. Transcripts are ingested via API
5. Intent is detected accurately (credit card vs debit card vs account)
6. Relevant KB articles are surfaced
7. Articles are sorted by confidence/relevance

---

## Test Results

Run the transcript flow test to see current status:

```bash
npx tsx scripts/test-transcript-flow.ts
```

This will test:
- ✅ Transcript ingestion
- ✅ Intent detection accuracy
- ✅ KB article surfacing
- ✅ Multiple test scenarios

---

## Next Steps

1. **Fix WebSocket Authentication** - Resolve 401 error
2. **Test Full Flow** - Once WebSocket works, test complete pipeline
3. **Monitor Metrics** - Check ASR worker and intent detection metrics
4. **Validate Accuracy** - Ensure intent detection is accurate for different scenarios

