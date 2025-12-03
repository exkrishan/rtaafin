# 🧪 Testing Audio Dump Feature

## Quick Test (No Real Exotel Call Needed!)

You can test the audio dumping feature using the simulation script - no real Exotel call required.

## Step-by-Step Test

### Step 1: Start Ingest Service with Audio Dumping Enabled

```bash
cd services/ingest

# Enable audio dumping
export AUDIO_DUMP_ENABLED=true
export AUDIO_DUMP_DIR=./audio-dumps
export AUDIO_DUMP_FORMAT=wav

# Make sure Redis is running (if using redis_streams)
# docker run -d -p 6379:6379 redis:7-alpine

# Start the service
npm run dev
```

You should see:
```
[audio-dumper] Audio dumping enabled { dump_dir: './audio-dumps', format: 'wav' }
```

### Step 2: Run Simulation Script (in a new terminal)

```bash
cd services/ingest

# Run simulation (sends 10 seconds of synthetic audio)
npx ts-node scripts/simulate-exotel-stream.ts --duration 10 --sample-rate 8000
```

Or with a real audio file:
```bash
# If you have a PCM16 audio file
npx ts-node scripts/simulate-exotel-stream.ts --duration 10 --sample-rate 8000 --file /path/to/audio.pcm
```

### Step 3: Check for Dumped Files

```bash
# List all dumped chunks
ls -R audio-dumps/

# Or find specific call
ls audio-dumps/*/chunk-*.wav

# Count chunks
ls audio-dumps/*/chunk-*.wav | wc -l
```

### Step 4: Play a Chunk

```bash
# macOS
afplay audio-dumps/{call_sid}/chunk-000001.wav

# Linux
aplay audio-dumps/{call_sid}/chunk-000001.wav

# Using ffplay
ffplay audio-dumps/{call_sid}/chunk-000001.wav
```

## Expected Output

### Ingest Service Logs

You should see logs like:
```
[audio-dumper] Audio dumping enabled { dump_dir: './audio-dumps', format: 'wav' }
[exotel] New Exotel WebSocket connection
[exotel] Start event received via JSON
[audio-dumper] 💾 Dumped audio chunk {
  interaction_id: 'call_abc123',
  seq: 1,
  file_path: './audio-dumps/call_abc123/chunk-000001.wav',
  size_bytes: 320,
  sample_rate: 8000,
  format: 'wav',
  duration_ms: 20
}
[audio-dumper] 💾 Dumped audio chunk { ... seq: 2 ... }
...
```

### File Structure

```
audio-dumps/
└── call_abc123/  (or stream_sid)
    ├── chunk-000001.wav
    ├── chunk-000002.wav
    ├── chunk-000003.wav
    └── ...
```

## Troubleshooting

### No files created?

1. **Check if dumping is enabled:**
   ```bash
   echo $AUDIO_DUMP_ENABLED
   # Should output: true
   ```

2. **Check service logs:**
   Look for `[audio-dumper] Audio dumping enabled` message

3. **Check directory:**
   ```bash
   ls -la audio-dumps/
   ```

4. **Check permissions:**
   ```bash
   ls -ld audio-dumps/
   ```

### Files in wrong location?

- Check `AUDIO_DUMP_DIR` environment variable
- Default is `./audio-dumps/` relative to where service is running
- Check logs for `file_path` in dump messages

### Simulation script not working?

1. **Check ingest service is running:**
   ```bash
   curl http://localhost:8443/health
   ```

2. **Check WebSocket URL:**
   Default is `ws://localhost:8443/v1/ingest`

3. **Try with explicit URL:**
   ```bash
   WS_URL=ws://localhost:8443/v1/ingest npx ts-node scripts/simulate-exotel-stream.ts
   ```

## Testing with Real Exotel Call

If you want to test with a real Exotel call:

1. **Configure Exotel** to send audio to your ingest service
2. **Enable audio dumping** (same as Step 1 above)
3. **Make a test call** from Exotel
4. **Check `audio-dumps/`** directory for chunks

The dumped files will have the actual `call_sid` or `stream_sid` from Exotel as the directory name.

