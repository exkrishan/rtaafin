# 📋 Ingest Service Changes - feat/exotel-deepgram-bridge Branch

## Overview
This document details all changes made to the **Ingest Service** on the `feat/exotel-deepgram-bridge` branch. These changes are primarily related to the **Exotel→Deepgram Bridge** implementation, which enables real-time speech-to-text transcription from Exotel telephony calls.

**Note:** While the branch name includes "deepgram-bridge", these changes are **provider-agnostic** and work with any ASR provider (Deepgram, ElevenLabs, Google Speech, etc.) configured in the ASR worker.

---

## 🎯 Key Changes Summary

### 1. **Exotel Protocol Support** (New Feature)
- Added support for Exotel's WebSocket protocol
- Handles Exotel events: `connected`, `start`, `media`, `stop`
- Decodes base64-encoded PCM16 audio from Exotel

### 2. **Exotel→ASR Bridge** (New Feature)
- Feature flag: `EXO_BRIDGE_ENABLED`
- Bounded buffer fallback for pub/sub resilience
- Idle timeout management
- Sample rate validation and correction

### 3. **Configuration Enhancements**
- New environment variables for Exotel bridge
- Enhanced configuration validation
- Health endpoint updates

---

## 📁 Files Changed

### Modified Files:
1. `services/ingest/src/server.ts` - Main server with Exotel bridge integration
2. `services/ingest/src/exotel-handler.ts` - Exotel protocol handler
3. `services/ingest/src/config-validator.ts` - Configuration validation
4. `services/ingest/README.md` - Documentation updates

### New Files:
1. `services/ingest/scripts/simulate-exotel-stream.ts` - Exotel stream simulator for testing

---

## 🔧 Detailed Changes

### 1. `services/ingest/src/server.ts`

#### Changes:
- **Exotel Bridge Configuration** (Lines 42-44, 49-51, 94-96)
  - Added `exoBridgeEnabled`, `exoMaxBufferMs`, `exoIdleCloseS` to config
  - Reads from environment variables: `EXO_BRIDGE_ENABLED`, `EXO_MAX_BUFFER_MS`, `EXO_IDLE_CLOSE_S`

- **Exotel Handler Integration** (Line 19, ~200-250)
  - Imports and initializes `ExotelHandler`
  - Routes Exotel protocol messages to handler
  - Health endpoint includes bridge status

- **Sample Rate Validation** (Lines ~200-220)
  - Forces 8000 Hz sample rate for Exotel telephony audio
  - Fixes Deepgram connection timeout (1011) errors
  - Logs warnings when sample rate is corrected

#### Key Code Snippets:
```typescript
// Exotel Bridge feature flag
const exoBridgeEnabled = process.env.EXO_BRIDGE_ENABLED === 'true';
const exoMaxBufferMs = parseInt(process.env.EXO_MAX_BUFFER_MS || '500', 10);
const exoIdleCloseS = parseInt(process.env.EXO_IDLE_CLOSE_S || '10', 10);
```

---

### 2. `services/ingest/src/exotel-handler.ts`

#### Major Changes:

**A. Exotel Protocol Handler** (New Class)
- Handles Exotel WebSocket protocol events
- Manages connection state per stream
- Decodes base64 PCM16 audio

**B. Bounded Buffer Fallback** (Lines 26-30, ~200-280)
- Implements bounded buffer for pub/sub failures
- Prevents memory overflow
- Configurable max buffer duration (`EXO_MAX_BUFFER_MS`)

**C. Sample Rate Correction** (Lines 116-127)
- **CRITICAL FIX:** Forces 8000 Hz for Exotel telephony
- Validates and corrects invalid sample rates (e.g., 1800 Hz)
- Prevents ASR provider connection errors

**D. Metrics Tracking** (Lines 38-44)
- `framesIn` - Total frames received
- `bytesIn` - Total bytes received
- `bufferDrops` - Frames dropped due to buffer overflow
- `publishFailures` - Pub/sub publish failures

**E. Feature Flag Check** (Lines 48, 62-65)
- Only processes Exotel messages if `EXO_BRIDGE_ENABLED=true`
- Gracefully skips processing if disabled

#### Key Code Snippets:
```typescript
// Sample rate correction
let sampleRate = parseInt(start.media_format.sample_rate, 10) || 8000;
if (sampleRate !== 8000) {
  console.warn(`[exotel] ⚠️ Invalid sample rate ${sampleRate} from Exotel, forcing to 8000 Hz`);
  sampleRate = 8000;
}
```

---

### 3. `services/ingest/src/config-validator.ts`

#### Changes:
- **Exotel Bridge Validation** (Lines 93-107)
  - Validates `EXO_BRIDGE_ENABLED` feature flag
  - Validates `EXO_MAX_BUFFER_MS` (100-10000ms)
  - Validates `EXO_IDLE_CLOSE_S` (1-300s)
  - Provides clear error messages

#### Validation Rules:
```typescript
// EXO_MAX_BUFFER_MS: 100-10000ms
if (exoMaxBufferMsNum < 100 || exoMaxBufferMsNum > 10000) {
  errors.push(`Invalid EXO_MAX_BUFFER_MS: ${exoMaxBufferMs}. Must be between 100 and 10000.`);
}

// EXO_IDLE_CLOSE_S: 1-300s
if (exoIdleCloseSNum < 1 || exoIdleCloseSNum > 300) {
  errors.push(`Invalid EXO_IDLE_CLOSE_S: ${exoIdleCloseS}. Must be between 1 and 300.`);
}
```

---

### 4. `services/ingest/scripts/simulate-exotel-stream.ts`

#### New File:
- **Purpose:** Simulate Exotel Stream Applet WebSocket client for testing
- **Features:**
  - Generates test audio (sine wave) or reads from file
  - Sends Exotel protocol events (`connected`, `start`, `media`, `stop`)
  - Configurable duration, sample rate, call/stream SIDs
  - Base64-encodes PCM16 audio

#### Usage:
```bash
# Test with generated audio
ts-node scripts/simulate-exotel-stream.ts --duration 10 --sample-rate 8000

# Test with audio file
ts-node scripts/simulate-exotel-stream.ts --file path/to/audio.pcm
```

---

### 5. `services/ingest/README.md`

#### Changes:
- Added new environment variables section:
  - `EXO_BRIDGE_ENABLED` - Enable Exotel→Deepgram bridge
  - `EXO_MAX_BUFFER_MS` - Max buffer duration for fallback
  - `EXO_IDLE_CLOSE_S` - Idle timeout before closing connection

---

## 🔐 New Environment Variables

### Required (for Exotel Bridge):
| Variable | Default | Description |
|----------|---------|-------------|
| `EXO_BRIDGE_ENABLED` | `false` | Enable Exotel→ASR bridge feature |

### Optional (with defaults):
| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `EXO_MAX_BUFFER_MS` | `500` | 100-10000 | Max buffer duration for fallback (ms) |
| `EXO_IDLE_CLOSE_S` | `10` | 1-300 | Idle timeout before closing connection (seconds) |

---

## 🚀 Deployment Configuration

### For Fresh Deployment on Render:

#### 1. **Root Directory**
```
services/ingest
```

#### 2. **Build Command**
```
cd ../.. && npm ci && cd services/ingest && npm run build
```

#### 3. **Start Command**
```
npm run start
```

#### 4. **Required Environment Variables**

**Core Service:**
- `PORT` - Server port (auto-set by Render)
- `REDIS_URL` - Redis connection string
- `PUBSUB_ADAPTER` - `redis_streams`
- `JWT_PUBLIC_KEY` - JWT public key for authentication

**Exotel Bridge (Optional):**
- `EXO_BRIDGE_ENABLED` - Set to `true` to enable bridge
- `EXO_MAX_BUFFER_MS` - `500` (optional, has default)
- `EXO_IDLE_CLOSE_S` - `10` (optional, has default)

**SSL (Optional):**
- `SSL_KEY_PATH` - Path to SSL private key (Render handles HTTPS)
- `SSL_CERT_PATH` - Path to SSL certificate (Render handles HTTPS)

---

## 🔍 Key Features

### 1. **Exotel Protocol Support**
- Handles Exotel's JSON-based WebSocket protocol
- Supports all Exotel events: `connected`, `start`, `media`, `stop`, `dtmf`, `mark`
- Decodes base64-encoded PCM16 audio

### 2. **Bounded Buffer Fallback**
- Prevents memory overflow during pub/sub failures
- Configurable max buffer duration
- Drops oldest frames when buffer is full

### 3. **Sample Rate Correction**
- **Critical Fix:** Forces 8000 Hz for Exotel telephony
- Prevents ASR provider connection errors
- Logs warnings when correction is applied

### 4. **Idle Timeout**
- Closes connections after idle period
- Prevents resource leaks
- Configurable timeout (1-300 seconds)

### 5. **Metrics Tracking**
- Tracks frames received, bytes received
- Monitors buffer drops and publish failures
- Available via health endpoint

---

## 🐛 Bug Fixes

### 1. **Sample Rate Correction** (Commit: 18a33b3)
- **Problem:** Exotel sometimes sends incorrect sample rate (e.g., 1800 Hz)
- **Impact:** Causes Deepgram connection timeout (1011) errors
- **Fix:** Force 8000 Hz for Exotel telephony audio
- **Applied to:** `exotel-handler.ts` and `server.ts`

---

## 📊 Health Endpoint Updates

The `/health` endpoint now includes:
- `exoBridgeEnabled` - Bridge feature flag status
- `activeConnections` - Number of active Exotel connections
- `metrics` - Bridge metrics (frames, bytes, drops, failures)

---

## 🧪 Testing

### Test Scripts:
1. **`simulate-exotel-stream.ts`** - Simulates Exotel client
   ```bash
   cd services/ingest
   ts-node scripts/simulate-exotel-stream.ts --duration 10
   ```

### Manual Testing:
1. Connect to WebSocket: `wss://<host>/v1/ingest`
2. Send Exotel protocol events
3. Verify audio frames are published to Redis
4. Check health endpoint for metrics

---

## 🔄 Compatibility

### Backward Compatibility:
- ✅ **Fully backward compatible** - Bridge is disabled by default
- ✅ Existing WebSocket clients continue to work
- ✅ No breaking changes to existing API

### Provider Compatibility:
- ✅ Works with **any ASR provider** (Deepgram, ElevenLabs, Google Speech, etc.)
- ✅ Provider selection is handled by ASR worker, not ingest service
- ✅ Bridge is provider-agnostic

---

## 📝 Commit History

### Commit 1: `931e15f` - "feat: Implement Exotel → Deepgram Live STT Bridge"
- Initial bridge implementation
- Added Exotel protocol handler
- Added bounded buffer fallback
- Added metrics tracking
- Added configuration validation

### Commit 2: `18a33b3` - "fix: Force 8000 Hz sample rate for Exotel telephony audio"
- Fixed sample rate validation
- Added sample rate correction logic
- Fixed Deepgram connection timeout errors

---

## 🎯 Summary for Fresh Deployment

### What Changed:
1. ✅ Added Exotel protocol support
2. ✅ Added Exotel→ASR bridge (feature flag controlled)
3. ✅ Added sample rate correction (8000 Hz for telephony)
4. ✅ Added bounded buffer fallback
5. ✅ Added configuration validation
6. ✅ Added test simulator script

### What Didn't Change:
- ❌ No changes to existing WebSocket API
- ❌ No changes to authentication (JWT still works)
- ❌ No changes to pub/sub adapter interface
- ❌ No breaking changes

### Deployment Notes:
- Bridge is **disabled by default** (`EXO_BRIDGE_ENABLED=false`)
- Set `EXO_BRIDGE_ENABLED=true` to enable Exotel bridge
- All new features are **opt-in** via environment variables
- No additional dependencies required

---

## 🔗 Related Documentation

- [Exotel Bridge Implementation Summary](../docs/exotel-bridge-implementation-summary.md)
- [Exotel Bridge Acceptance Testing](../docs/exotel-bridge-acceptance-testing.md)
- [Exotel Bridge Security Rollout](../docs/exotel-bridge-security-rollout.md)
- [Ingest Service README](./services/ingest/README.md)

---

**Last Updated:** 2025-11-13  
**Branch:** `feat/exotel-deepgram-bridge`  
**Status:** ✅ Ready for deployment

