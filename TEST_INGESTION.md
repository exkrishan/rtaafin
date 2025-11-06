# 🧪 Testing the Ingestion Service

## Quick Start

The ingestion service requires a valid JWT token for authentication. Here's how to test it:

### Step 1: Generate a Test JWT Token

```bash
# Generate a JWT token using the private key
node scripts/generate-test-jwt.js
```

This will output a JWT token that you can use for testing.

### Step 2: Run the Simulation Script

**Option A: Quick Test Script (Recommended)**
```bash
./QUICK_TEST_INGESTION.sh
```

**Option B: Manual Test**
```bash
# Set the JWT token and run the simulation
JWT_TOKEN="<token-from-step-1>" \
./services/ingest/scripts/simulate_exotel_client.sh
```

Or export it first:

```bash
export JWT_TOKEN="<token-from-step-1>"
./services/ingest/scripts/simulate_exotel_client.sh
```

**Option C: One-Line Test**
```bash
JWT_TOKEN=$(node scripts/generate-test-jwt.js 2>/dev/null | grep -v "^✅\|^📋\|^💡\|^$" | head -1 | xargs) && \
JWT_TOKEN="$JWT_TOKEN" ./services/ingest/scripts/simulate_exotel_client.sh
```

---

## What the Script Does

The `simulate_exotel_client.sh` script:

1. **Connects** to `ws://localhost:8443/v1/ingest` via WebSocket
2. **Authenticates** using the JWT token in the `Authorization` header
3. **Sends a start event** with interaction metadata:
   ```json
   {
     "event": "start",
     "interaction_id": "test-int-123",
     "tenant_id": "test-tenant",
     "sample_rate": 24000,
     "encoding": "pcm16"
   }
   ```
4. **Streams 50 synthetic PCM16 audio frames** (~10 seconds of audio)
5. **Receives ACK messages** every 10 frames
6. **Closes the connection** after all frames are sent

---

## Expected Output

When the script runs successfully, you should see:

```
Starting Exotel client simulation...
WebSocket URL: ws://localhost:8443/v1/ingest
Generating 50 synthetic PCM16 frames...
Connecting to ws://localhost:8443/v1/ingest...
✓ WebSocket connected
Sending start event: {"event":"start","interaction_id":"test-int-...","tenant_id":"test-tenant","sample_rate":24000,"encoding":"pcm16"}
✓ Start acknowledged
Streaming audio frames...
Sent 10/50 frames
✓ Received ACK: seq=10
Sent 20/50 frames
✓ Received ACK: seq=20
...
✓ All 50 frames sent
✓ Received 5 ACK messages
WebSocket closed: code=1000, reason=
Summary: Sent 50 frames, received 5 ACKs
Simulation complete!
```

---

## Testing with Custom Audio File

You can also test with a real PCM16 audio file:

```bash
# Generate JWT token
JWT_TOKEN=$(ts-node scripts/generate-test-jwt.ts | grep -A 1 "Generated JWT Token" | tail -1)

# Run with custom audio file
JWT_TOKEN="$JWT_TOKEN" \
./services/ingest/scripts/simulate_exotel_client.sh /path/to/audio.pcm
```

---

## Troubleshooting

### "JWT validation failed"

**Problem**: The JWT token is invalid or expired.

**Solution**: 
1. Make sure you're using a token generated with `scripts/generate-test-jwt.ts`
2. Check that `JWT_PUBLIC_KEY` in `.env.local` matches the public key from `scripts/keys/jwt-public-key.pem`

### "Connection refused"

**Problem**: The ingestion service is not running.

**Solution**:
```bash
# Start the ingestion service
cd services/ingest
npm run dev
```

### "Missing or invalid Authorization header"

**Problem**: The JWT token is not being sent correctly.

**Solution**: Make sure you're setting `JWT_TOKEN` environment variable:
```bash
export JWT_TOKEN="your-token-here"
./services/ingest/scripts/simulate_exotel_client.sh
```

### No ACK Messages

**Problem**: Frames are being sent but no ACKs are received.

**Possible causes**:
- Service is not processing frames correctly
- Pub/sub adapter is not working
- Check service logs for errors

---

## Verify the Flow

After running the simulation, verify that:

1. **Ingestion Service** received the frames:
   - Check service logs for "Published audio frame" messages
   - Check health endpoint: `curl http://localhost:8443/health`

2. **ASR Worker** processed the audio (if running):
   - Check metrics: `curl http://localhost:3001/metrics`
   - Look for `asr_audio_chunks_processed_total` counter

3. **Pub/Sub** messages were published:
   - If using Redis: Check Redis streams
   - If using in-memory: Messages are delivered immediately

---

## One-Line Test

Quick test command:

```bash
JWT_TOKEN=$(ts-node scripts/generate-test-jwt.ts 2>/dev/null | grep -v "^✅\|^📋\|^💡" | head -1) && \
echo "Using JWT token: ${JWT_TOKEN:0:50}..." && \
JWT_TOKEN="$JWT_TOKEN" ./services/ingest/scripts/simulate_exotel_client.sh
```

---

## Next Steps

After testing ingestion:

1. **Test ASR Worker**: Verify it receives audio from pub/sub
2. **Test Full Flow**: Audio → Ingestion → Pub/Sub → ASR → Transcripts
3. **Monitor Metrics**: Check `/metrics` endpoints for all services

---

## Additional Resources

- **Ingestion Service README**: `services/ingest/README.md`
- **Pub/Sub Documentation**: `lib/pubsub/README.md`
- **ASR Worker README**: `services/asr-worker/README.md`

