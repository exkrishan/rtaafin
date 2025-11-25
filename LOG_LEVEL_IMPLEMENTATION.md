# Log Level Implementation Summary

## ✅ Implementation Complete

Log level control and rate limiting have been implemented for both ASR Worker and Ingest services to prevent excessive logging when idle, which was causing Render free tier crashes.

## 📋 Changes Made

### 1. Logger Utilities Created

- **`services/asr-worker/src/logger.ts`** - Logger utility for ASR Worker
- **`services/ingest/src/logger.ts`** - Logger utility for Ingest Service

Both utilities support:
- Log levels: `debug`, `info`, `warn`, `error`
- Rate limiting: Verbose logs limited to 1 per 10 seconds when idle
- Error logs always shown (regardless of level)

### 2. ASR Worker Updates

**File:** `services/asr-worker/src/index.ts`

- ✅ Only logs Redis messages when they contain actual audio data
- ✅ Empty Redis messages logged at debug level only
- ✅ Timer logs when idle are rate-limited (1 per 10 seconds)
- ✅ Timer "not sending" logs moved to debug level with rate limiting
- ✅ Timer "triggering send" logs kept at info level (actual work)
- ✅ Audio processing logs kept at info level (actual work)

### 3. Ingest Service Updates

**File:** `services/ingest/src/server.ts`

- ✅ HTTP request logs moved to debug level with rate limiting
- ✅ WebSocket upgrade attempt logs moved to debug level with rate limiting
- ✅ WebSocket authentication logs moved to debug level
- ✅ Health check requests no longer logged
- ✅ Error logs always shown

**File:** `services/ingest/src/exotel-handler.ts`

- ✅ Start event logs kept at info level (actual ingestion begins)
- ✅ Frame publishing logs reduced from every 10th to every 100th frame
- ✅ Error logs always shown

## 🔧 Environment Variable Configuration

### Required Setup in Render

Add `LOG_LEVEL` environment variable to both services:

#### ASR Worker Service
1. Go to Render Dashboard → ASR Worker Service
2. Environment tab → Add Environment Variable
3. Key: `LOG_LEVEL`
4. Value: `info` (recommended for production)

#### Ingest Service
1. Go to Render Dashboard → Ingest Service
2. Environment tab → Add Environment Variable
3. Key: `LOG_LEVEL`
4. Value: `info` (recommended for production)

## 📊 Log Level Options

| Level | Shows | Use Case |
|-------|-------|----------|
| `error` | Only errors | Minimal logging |
| `warn` | Warnings + errors | Production (if still too verbose) |
| `info` | Info + warnings + errors | **Recommended for production** |
| `debug` | All logs | Troubleshooting only |

## 📈 Expected Log Reduction

### Before Implementation
- **Idle state:** ~100+ logs/minute
- **During ingestion:** ~200+ logs/minute
- **Result:** Render free tier crashes

### After Implementation (LOG_LEVEL=info)
- **Idle state:** ~1-2 logs/minute (99% reduction)
- **During ingestion:** All relevant logs still appear
- **Result:** No crashes, full debugging capability when needed

## 🎯 What Gets Logged When

### Always Logged (regardless of level)
- ✅ Errors
- ✅ Warnings
- ✅ Service startup messages
- ✅ Critical failures

### Logged at INFO Level (default)
- ✅ Actual audio processing
- ✅ Start events (ingestion beginning)
- ✅ Timer triggers when sending audio
- ✅ Successful transcript publishing

### Logged at DEBUG Level (only when LOG_LEVEL=debug)
- ✅ Empty Redis messages
- ✅ Timer ticks when idle
- ✅ HTTP request attempts
- ✅ WebSocket upgrade attempts
- ✅ Authentication attempts
- ✅ Verbose diagnostics

## 🔍 Troubleshooting

### Enable Full Logging Temporarily

If you need to debug an issue:

1. Go to Render Dashboard → Service → Environment
2. Change `LOG_LEVEL` from `info` to `debug`
3. Save (triggers redeploy)
4. Monitor logs
5. Change back to `info` when done

### Check Current Log Level

The logger exposes the current level (for debugging):
```typescript
import { logger } from './logger';
console.log('Current log level:', logger.getLevel());
```

## ✅ Verification

After deployment, verify:

1. **Idle state logs are minimal:**
   - Should see ~1-2 logs per minute
   - Mostly health check responses or service status

2. **Ingestion logs appear normally:**
   - Start events logged
   - Audio processing logged
   - Transcripts logged

3. **Errors always visible:**
   - Any errors should appear regardless of LOG_LEVEL

## 📝 Notes

- Rate limiting resets every 10 seconds
- Each rate-limited log type has its own counter
- Debug level disables rate limiting (full logging)
- Error logs bypass all rate limiting

## 🚀 Next Steps

1. ✅ Deploy both services with `LOG_LEVEL=info`
2. ✅ Monitor logs to verify reduction
3. ✅ Test ingestion to ensure logs still appear
4. ✅ Adjust level if needed (warn for even less, debug for troubleshooting)

