# 📞 Exotel Stream Applet Setup for Audio Dumping

This guide shows how to configure Exotel Stream Applet to send audio to your ingest service, with all audio chunks automatically dumped to local files.

## Prerequisites

1. **Exotel Account** with Stream Applet access
2. **Ingest Service** running and accessible from Exotel
3. **WebSocket endpoint** accessible (local or deployed)

## Step 1: Start Ingest Service with Audio Dumping

### Local Development

```bash
cd services/ingest

# Enable audio dumping
export AUDIO_DUMP_ENABLED=true
export AUDIO_DUMP_DIR=./audio-dumps
export AUDIO_DUMP_FORMAT=wav

# Required environment variables
export REDIS_URL=redis://localhost:6379
export PUBSUB_ADAPTER=redis_streams
export SUPPORT_EXOTEL=true
export PORT=8443

# Start the service
npm run dev
```

**Expected output:**
```
[audio-dumper] Audio dumping enabled { dump_dir: './audio-dumps', format: 'wav' }
[server] WebSocket server listening on ws://0.0.0.0:8443/v1/ingest
```

### For Exotel to Access (if local)

If Exotel needs to access your local service, use a tunnel:

```bash
# Option 1: ngrok
ngrok http 8443

# Option 2: Cloudflare Tunnel
cloudflared tunnel --url http://localhost:8443

# Option 3: localtunnel
npx localtunnel --port 8443
```

**Note the public URL** - you'll need this for Exotel configuration.

## Step 2: Configure Exotel Stream Applet

### In Exotel Dashboard

1. **Go to Stream Applets** section
2. **Create/Edit Stream Applet**
3. **Set WebSocket URL:**
   - Local: `wss://your-ngrok-url.ngrok.io/v1/ingest` (or your tunnel URL)
   - Deployed: `wss://your-ingest-service.onrender.com/v1/ingest`

### Stream Applet Configuration

```json
{
  "websocket_url": "wss://your-service-url/v1/ingest",
  "protocol": "exotel",
  "sample_rate": 8000,
  "encoding": "pcm16"
}
```

**Or in Exotel Dashboard UI:**
- **WebSocket URL**: `wss://your-service-url/v1/ingest`
- **Protocol**: Exotel (JSON with base64 audio)
- **Sample Rate**: 8000 Hz (or 16000 Hz for better quality)
- **Encoding**: PCM16

### Authentication (if required)

If your service requires authentication:

1. **Basic Auth** (if configured):
   - Username: (as configured)
   - Password: (as configured)

2. **IP Whitelisting** (if configured):
   - Add Exotel's IP ranges to whitelist

3. **No Auth** (current setup):
   - Exotel connections are accepted if `SUPPORT_EXOTEL=true`

## Step 3: Make a Test Call

1. **Configure Exotel** to use your Stream Applet
2. **Make a test call** from Exotel
3. **Speak into the call** - audio will be streamed to your service

## Step 4: Check Audio Dumps

### Where to Find Dumps

**Default Location**: `services/ingest/audio-dumps/`

```bash
# List all dumps
ls -R audio-dumps/

# Find specific call
ls audio-dumps/{call_sid}/

# Count chunks
ls audio-dumps/{call_sid}/chunk-*.wav | wc -l
```

### File Structure

```
audio-dumps/
└── {call_sid}/          # Exotel call SID
    ├── chunk-000001.wav
    ├── chunk-000002.wav
    ├── chunk-000003.wav
    └── ...
```

The `call_sid` or `stream_sid` from Exotel will be used as the directory name.

## Step 5: Monitor Logs

Watch the ingest service logs to see:

```
[exotel] New Exotel WebSocket connection
[exotel] Start event received via JSON
[audio-dumper] 💾 Dumped audio chunk {
  interaction_id: 'CA1234567890abcdef',
  seq: 1,
  file_path: './audio-dumps/CA1234567890abcdef/chunk-000001.wav',
  size_bytes: 320,
  sample_rate: 8000,
  format: 'wav',
  duration_ms: 20
}
[audio-dumper] 💾 Dumped audio chunk { ... seq: 2 ... }
...
```

## Verification Checklist

- [ ] Ingest service is running with `AUDIO_DUMP_ENABLED=true`
- [ ] Service logs show: `[audio-dumper] Audio dumping enabled`
- [ ] Exotel Stream Applet is configured with correct WebSocket URL
- [ ] Test call is made from Exotel
- [ ] Logs show: `[exotel] New Exotel WebSocket connection`
- [ ] Logs show: `[audio-dumper] 💾 Dumped audio chunk`
- [ ] Files exist in `audio-dumps/{call_sid}/` directory
- [ ] Can play WAV files: `afplay audio-dumps/{call_sid}/chunk-000001.wav`

## Troubleshooting

### No Connection from Exotel

1. **Check WebSocket URL is correct:**
   - Must be `wss://` (secure) or `ws://` (insecure)
   - Must include `/v1/ingest` path
   - Must be accessible from internet (use tunnel if local)

2. **Check service is running:**
   ```bash
   curl http://localhost:8443/health
   ```

3. **Check firewall/network:**
   - Ensure port 8443 is accessible
   - Check if tunnel is working: `curl https://your-tunnel-url.ngrok.io/health`

### No Audio Dumps Created

1. **Verify dumping is enabled:**
   ```bash
   echo $AUDIO_DUMP_ENABLED
   # Should output: true
   ```

2. **Check logs for errors:**
   - Look for `[audio-dumper]` messages
   - Check for permission errors

3. **Verify audio is being received:**
   - Look for `[exotel] Published audio frame` messages
   - Check if `[exotel] Media received` appears in logs

### Files Are Empty

- This is normal for silence chunks
- Check if actual speech audio is being sent
- Verify sample rate matches expected format

### Wrong Directory Name

- Directory name uses `call_sid` or `stream_sid` from Exotel
- Check Exotel logs for actual SID values
- Files are organized by interaction ID

## Sample Exotel Stream Applet Configuration

### JSON Configuration

```json
{
  "name": "Audio Dump Test",
  "websocket_url": "wss://your-service-url/v1/ingest",
  "protocol": "exotel",
  "media_format": {
    "encoding": "pcm16",
    "sample_rate": "8000"
  },
  "events": ["start", "media", "stop"]
}
```

### Exotel Dashboard UI

1. **Stream Applet Name**: Audio Dump Test
2. **WebSocket URL**: `wss://your-service-url/v1/ingest`
3. **Protocol**: Exotel
4. **Sample Rate**: 8000 Hz
5. **Encoding**: PCM16
6. **Events**: Enable all (start, media, stop)

## Next Steps

Once audio dumping is working:

1. **Analyze audio quality** - Play chunks to verify audio
2. **Check transcription** - Verify ASR worker is processing
3. **Monitor disk space** - Audio files can grow large
4. **Clean up old dumps** - Remove old files periodically

## Production Considerations

- **Disk Space**: Monitor `AUDIO_DUMP_DIR` disk usage
- **Performance**: Dumping is async and non-blocking
- **Security**: Don't enable dumping in production unless needed
- **Retention**: Implement cleanup for old dump files

