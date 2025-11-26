# Real-Time Transcription Optimization

## Problem Statement
The system was experiencing 1-2 minute delays in transcript generation in the UI. The root cause was excessive buffering at multiple levels in the ASRWorker service.

## Root Causes Identified

### 1. Initial Chunk Buffer (200ms)
- **Before**: Required 200ms of audio before sending the first chunk to ASR provider
- **Impact**: Added 200ms delay at the start of every call

### 2. Continuous Chunk Buffer (100ms)
- **Before**: Required 100ms of audio for each subsequent chunk
- **Impact**: Added 100ms delay for every transcript after the initial one

### 3. Timer Interval (500ms)
- **Before**: Checked every 500ms whether to send audio
- **Impact**: Added up to 500ms delay between audio arrival and processing

### 4. ElevenLabs-Specific Delays
- **Before**: Required 2000ms (2 seconds) for initial chunk
- **Before**: Required 500ms for continuous chunks
- **Before**: Max wait of 2000ms between sends
- **Impact**: Added significant delays for ElevenLabs provider

### 5. Timeout Thresholds
- **Before**: Various timeout thresholds ranging from 2000ms to 5000ms
- **Impact**: Prevented timely processing of audio chunks

## Changes Implemented

### 1. Reduced Initial Chunk Duration
```typescript
// Before
const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '200', 10);

// After
const INITIAL_CHUNK_DURATION_MS = parseInt(process.env.INITIAL_CHUNK_DURATION_MS || '20', 10);
```
**Impact**: Reduced initial delay from 200ms to 20ms (10x faster)

### 2. Reduced Continuous Chunk Duration
```typescript
// Before
const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '100', 10);

// After
const CONTINUOUS_CHUNK_DURATION_MS = parseInt(process.env.CONTINUOUS_CHUNK_DURATION_MS || '20', 10);
```
**Impact**: Reduced continuous delay from 100ms to 20ms (5x faster)

### 3. Reduced Timer Interval
```typescript
// Before
const PROCESSING_TIMER_INTERVAL_MS = 500; // Check every 500ms

// After
const PROCESSING_TIMER_INTERVAL_MS = 100; // Check every 100ms
```
**Impact**: Reduced timer latency from 500ms to 100ms (5x faster)

### 4. Unified Provider Thresholds
```typescript
// Before (ElevenLabs-specific)
const MIN_CHUNK_DURATION_MS = isElevenLabs ? 500 : 250;
const MAX_TIME_BETWEEN_SENDS_MS = isElevenLabs ? 2000 : 1000;
const TIMEOUT_FALLBACK_MS = isElevenLabs ? 5000 : 2000;

// After (unified for real-time)
const MIN_CHUNK_DURATION_MS = 20; // Both providers
const MAX_TIME_BETWEEN_SENDS_MS = 200; // Both providers
const TIMEOUT_FALLBACK_MS = 500; // Both providers
```
**Impact**: 
- Reduced minimum chunk from 500ms to 20ms for ElevenLabs (25x faster)
- Reduced max wait from 2000ms to 200ms (10x faster)
- Reduced timeout from 5000ms to 500ms (10x faster)

### 5. Reduced Initial Wait Time
```typescript
// Before
const MAX_INITIAL_WAIT_MS = 1000; // Send first chunk within 1 second max

// After
const MAX_INITIAL_WAIT_MS = 200; // Send first chunk within 200ms max
```
**Impact**: Reduced maximum initial wait from 1000ms to 200ms (5x faster)

### 6. Updated processBuffer Logic
- Removed ElevenLabs 2-second initial chunk requirement
- Unified all providers to use 20ms minimum chunks
- Updated all timeout thresholds to support real-time processing

## Expected Performance Improvements

### Before Optimization
- **Initial chunk delay**: 200-2000ms (depending on provider)
- **Continuous chunk delay**: 100-500ms per chunk
- **Timer latency**: 0-500ms
- **Max wait between sends**: 1000-2000ms
- **Total worst-case delay**: ~4000-5000ms (4-5 seconds)

### After Optimization
- **Initial chunk delay**: 20ms
- **Continuous chunk delay**: 20ms per chunk
- **Timer latency**: 0-100ms
- **Max wait between sends**: 200ms
- **Total worst-case delay**: ~340ms (0.34 seconds)

**Overall Improvement**: ~12-15x faster transcript generation

## Configuration Override

All timing parameters can be overridden via environment variables:

```bash
# Initial chunk duration (default: 20ms)
INITIAL_CHUNK_DURATION_MS=20

# Continuous chunk duration (default: 20ms)
CONTINUOUS_CHUNK_DURATION_MS=20

# Maximum chunk duration (default: 100ms)
MAX_CHUNK_DURATION_MS=100

# Minimum audio duration before processing (default: 20ms)
MIN_AUDIO_DURATION_MS=20

# Minimum chunk size for continuous streaming (default: 20ms)
ASR_CHUNK_MIN_MS=20
```

## Testing Recommendations

1. **Test with real calls**: Monitor transcript latency during actual calls
2. **Check ASR provider response times**: Ensure providers can handle 20ms chunks
3. **Monitor CPU usage**: Faster timer (100ms) may increase CPU usage slightly
4. **Verify transcript quality**: Ensure smaller chunks don't degrade transcription accuracy
5. **Test with different providers**: Verify both ElevenLabs and Deepgram work correctly

## Potential Trade-offs

### Pros
- ✅ Significantly reduced transcript latency (12-15x faster)
- ✅ Real-time transcription as audio arrives
- ✅ Better user experience with faster feedback
- ✅ Unified configuration across providers

### Cons
- ⚠️ Slightly increased CPU usage (100ms timer vs 500ms)
- ⚠️ More frequent ASR API calls (may increase costs)
- ⚠️ Smaller chunks may have slightly lower transcription accuracy
- ⚠️ May need to tune thresholds based on network latency

## Monitoring

Monitor these metrics after deployment:

1. **Transcript latency**: Time from audio arrival to transcript generation
2. **ASR API call frequency**: Number of calls per second to ASR provider
3. **Transcript quality**: Accuracy and completeness of transcriptions
4. **CPU usage**: ASRWorker service CPU utilization
5. **Empty transcript rate**: Percentage of empty transcripts (should remain low)

## Rollback Plan

If issues occur, revert by setting these environment variables:

```bash
# Restore original conservative settings
INITIAL_CHUNK_DURATION_MS=200
CONTINUOUS_CHUNK_DURATION_MS=100
MAX_CHUNK_DURATION_MS=250
MIN_AUDIO_DURATION_MS=200
ASR_CHUNK_MIN_MS=100
```

Or revert the code changes in `services/asr-worker/src/index.ts`.

## Next Steps

1. Deploy changes to staging environment
2. Test with real calls and monitor metrics
3. Tune thresholds if needed based on observed performance
4. Deploy to production with monitoring
5. Gather user feedback on transcript latency improvements

