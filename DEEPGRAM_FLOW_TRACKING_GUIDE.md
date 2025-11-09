# 🔍 Deepgram Flow Tracking Guide

## Overview

Comprehensive console logging has been added to track the **complete Deepgram API flow**:
1. Audio being sent to Deepgram
2. Deepgram receiving and processing audio
3. Deepgram emitting transcripts
4. Transcripts being delivered to ASR Worker

## Console Output Format

### Step 1: Sending Audio to Deepgram

```
================================================================================
[DeepgramProvider] 🎤 STEP 1: SENDING AUDIO TO DEEPGRAM
[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DeepgramProvider] Interaction ID: {id}
[DeepgramProvider] Sequence: {seq}
[DeepgramProvider] Timestamp: {iso_timestamp}
[DeepgramProvider] Audio Details: {
  chunkSizeMs: "20ms",
  dataLength: "320 bytes",
  samples: 160,
  sampleRate: "8000 Hz",
  encoding: "linear16 (PCM16)",
  channels: 1
}
[DeepgramProvider] Connection State: {
  isReady: true,
  connectionReadyState: "OPEN",
  socketReadyState: 1,
  hasConnection: true,
  hasSocket: true,
  timeSinceLastSend: "200ms"
}
[DeepgramProvider] Metrics: {
  totalAudioChunksSent: 5,
  totalTranscriptsReceived: 3,
  totalEmptyTranscripts: 1,
  averageChunkSizeMs: "80ms"
}
[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[DeepgramProvider] ✅ STEP 1 COMPLETE: Audio sent successfully {
  interactionId: "{id}",
  seq: 5,
  sendDurationMs: 2,
  status: "SUCCESS",
  note: "Audio data sent to Deepgram WebSocket. Waiting for transcript response..."
}

[DeepgramProvider] 📊 Pending transcript requests: 2 {
  interactionId: "{id}",
  pendingSeqs: "3, 5"
}
```

### Step 2: Deepgram Transcript Received

```
================================================================================
[DeepgramProvider] 📨 STEP 2: DEEPGRAM TRANSCRIPT RECEIVED
[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DeepgramProvider] Interaction ID: {id}
[DeepgramProvider] Timestamp: {iso_timestamp}
[DeepgramProvider] Transcript Event Structure: {
  hasChannel: true,
  hasAlternatives: true,
  alternativesCount: 1,
  isFinal: false,
  speechFinal: false,
  rawDataKeys: ["channel", "is_final", "speech_final"]
}
[DeepgramProvider] Timing: {
  timeSinceLastSend: "250ms",
  lastSendSeq: "3"
}
[DeepgramProvider] Full Event Data (first 1000 chars): {
  dataPreview: "{...}"
}
[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[DeepgramProvider] ✅ STEP 2 SUCCESS: Transcript extracted and processed {
  interactionId: "{id}",
  type: "partial",
  textLength: 15,
  textPreview: "Hello, how can I",
  confidence: "0.95",
  isFinal: false,
  status: "SUCCESS - Transcript has text"
}

[DeepgramProvider] ⏱️ Processing Time: 250ms (from send to transcript) {
  interactionId: "{id}",
  seq: 3,
  audioSize: 1280,
  chunkSizeMs: 80
}

[DeepgramProvider] ✅ STEP 3: Transcript delivered to ASR Worker {
  interactionId: "{id}",
  pendingResolversRemaining: 1
}
```

### Step 2: Empty Transcript (Silence)

```
[DeepgramProvider] ℹ️ STEP 2: Empty partial transcript (silence - normal) {
  interactionId: "{id}",
  emptyTranscriptRate: "20%",
  status: "NORMAL - Silence detected"
}

[DeepgramProvider] ⏱️ Processing Time: 200ms (from send to empty transcript) {
  interactionId: "{id}",
  seq: 4
}
```

### Step 2: Empty Transcript (Warning)

```
[DeepgramProvider] ⚠️ STEP 2 WARNING: Empty transcript received {
  interactionId: "{id}",
  isFinal: false,
  hasChannel: true,
  hasAlternatives: true,
  alternativesCount: 1,
  emptyTranscriptRate: "60%",
  totalTranscripts: 10,
  totalEmpty: 6,
  status: "WARNING - No text in transcript",
  possibleCauses: [
    "Audio is silence (no speech detected)",
    "Audio format is incorrect (Deepgram can't decode)",
    "Audio chunks are too small/infrequent",
    "Sample rate mismatch"
  ],
  rawData: "{...}"
}
```

### Step 2: Timeout (No Transcript Received)

```
================================================================================
[DeepgramProvider] ⚠️ STEP 2 TIMEOUT: No transcript received from Deepgram
[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DeepgramProvider] Interaction ID: {id}
[DeepgramProvider] Sequence: 5
[DeepgramProvider] Timeout Duration: 5000ms
[DeepgramProvider] Time Since Send: 5000ms
[DeepgramProvider] Connection State: {
  isReady: true,
  hasConnection: true,
  hasSocket: true,
  socketReadyState: 1
}
[DeepgramProvider] Metrics: {
  totalAudioChunksSent: 5,
  totalTranscriptsReceived: 3,
  totalEmptyTranscripts: 1,
  pendingResolvers: 0,
  pendingSends: 2
}
[DeepgramProvider] Possible Causes: [
  "Deepgram did not receive the audio",
  "Deepgram is processing but taking longer than 5 seconds",
  "Connection closed before transcript could be sent",
  "Audio format issue preventing Deepgram from processing",
  "Network issue preventing transcript delivery"
]
[DeepgramProvider] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## What to Look For

### ✅ Success Indicators

1. **STEP 1 COMPLETE** appears after each send
2. **STEP 2: DEEPGRAM TRANSCRIPT RECEIVED** appears within 1-2 seconds
3. **STEP 2 SUCCESS** with actual text (not empty)
4. **STEP 3: Transcript delivered** confirms delivery to ASR Worker
5. **Processing Time** is reasonable (100-500ms typically)

### ⚠️ Warning Indicators

1. **STEP 2 WARNING: Empty transcript** with high empty rate (>50%)
2. **STEP 2 TIMEOUT** - No transcript received after 5 seconds
3. **Processing Time** > 2000ms (very slow)
4. **Pending transcript requests** keeps growing (not being resolved)

### ❌ Failure Indicators

1. **STEP 1** appears but **STEP 2** never appears → Deepgram not receiving/processing
2. **STEP 2 TIMEOUT** repeatedly → Connection or format issue
3. **Connection State** shows `isReady: false` or `socketReadyState: 3` (CLOSED)
4. **Error during connection.send()** → Send is failing

## How to Use This Logging

### 1. Monitor Real-Time Flow

Watch the console for the complete flow:
```
STEP 1 → STEP 2 → STEP 3
```

### 2. Check Timing

- **Processing Time** should be 100-500ms typically
- If > 2000ms, Deepgram is slow or connection has issues
- If timeout (5000ms), Deepgram is not responding

### 3. Track Pending Requests

- **Pending transcript requests** should stay low (0-2)
- If it keeps growing, transcripts aren't arriving
- If it stays at 0, all requests are being resolved

### 4. Analyze Empty Transcripts

- **Empty rate < 20%** = Normal (silence is expected)
- **Empty rate > 50%** = Problem (format or processing issue)
- **Empty rate 100%** = Critical (Deepgram not processing audio)

### 5. Debug Timeouts

When you see **STEP 2 TIMEOUT**:
1. Check **Connection State** - is connection still open?
2. Check **Time Since Send** - when was audio sent?
3. Check **Possible Causes** - which one applies?
4. Check **Metrics** - how many sends vs transcripts?

## Quick Diagnostic Commands

### Check if Audio is Being Sent
```bash
grep "STEP 1 COMPLETE" logs | wc -l
```

### Check if Transcripts are Being Received
```bash
grep "STEP 2: DEEPGRAM TRANSCRIPT RECEIVED" logs | wc -l
```

### Check for Timeouts
```bash
grep "STEP 2 TIMEOUT" logs | wc -l
```

### Check Processing Times
```bash
grep "Processing Time" logs
```

### Check Empty Transcript Rate
```bash
grep "emptyTranscriptRate" logs
```

## Expected Flow

### Normal Flow (Success)
```
STEP 1: SENDING AUDIO → STEP 1 COMPLETE
  ↓ (100-500ms)
STEP 2: DEEPGRAM TRANSCRIPT RECEIVED → STEP 2 SUCCESS
  ↓ (immediate)
STEP 3: Transcript delivered to ASR Worker
```

### Problem Flow (Timeout)
```
STEP 1: SENDING AUDIO → STEP 1 COMPLETE
  ↓ (5000ms - no response)
STEP 2 TIMEOUT: No transcript received
```

### Problem Flow (Empty)
```
STEP 1: SENDING AUDIO → STEP 1 COMPLETE
  ↓ (100-500ms)
STEP 2: DEEPGRAM TRANSCRIPT RECEIVED → STEP 2 WARNING (empty)
```

## Next Steps

1. **Deploy** the enhanced logging
2. **Monitor** console output during a test call
3. **Identify** which step is failing:
   - No STEP 1 COMPLETE → Send is failing
   - STEP 1 but no STEP 2 → Deepgram not receiving/processing
   - STEP 2 TIMEOUT → Connection or format issue
   - STEP 2 WARNING (empty) → Format or silence issue
4. **Fix** the identified issue

