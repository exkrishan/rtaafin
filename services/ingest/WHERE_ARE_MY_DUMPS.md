# 📍 Where Are My Audio Dumps?

## Quick Answer

**Default Location**: `./audio-dumps/` (relative to where the ingest service is running)

## Finding Your Dumps

### Method 1: Check Logs

When audio dumping is enabled, you'll see logs like:

```
[audio-dumper] 💾 Dumped audio chunk {
  interaction_id: 'call_abc123',
  seq: 1,
  file_path: './audio-dumps/call_abc123/chunk-000001.wav',
  ...
}
```

The `file_path` in the log shows exactly where the file was saved.

### Method 2: Check Environment Variable

```bash
echo $AUDIO_DUMP_DIR
```

If not set, default is `./audio-dumps/`

### Method 3: Common Locations

#### Local Development (npm run dev)
```
/Users/kirti.krishnan/Desktop/Projects/rtaafin/services/ingest/audio-dumps/
```

#### Docker
```
/app/audio-dumps/  (inside container)
./audio-dumps/     (if volume mounted to host)
```

#### Render/Cloud
```
/tmp/audio-dumps/  (ephemeral - lost on restart)
```

## File Structure

```
audio-dumps/
├── {interaction_id_1}/
│   ├── chunk-000001.wav
│   ├── chunk-000002.wav
│   ├── chunk-000003.wav
│   └── ...
├── {interaction_id_2}/
│   ├── chunk-000001.wav
│   └── ...
└── ...
```

## Quick Commands

### List all dumps
```bash
# From project root
find . -name "chunk-*.wav" -type f

# From ingest service directory
ls -R audio-dumps/
```

### Count chunks for a call
```bash
ls audio-dumps/{interaction_id}/chunk-*.wav | wc -l
```

### Play a specific chunk
```bash
# macOS
afplay audio-dumps/{interaction_id}/chunk-000001.wav

# Linux
aplay audio-dumps/{interaction_id}/chunk-000001.wav

# Using ffplay
ffplay audio-dumps/{interaction_id}/chunk-000001.wav
```

## Troubleshooting

### No files found?

1. **Check if dumping is enabled:**
   ```bash
   echo $AUDIO_DUMP_ENABLED
   # Should output: true
   ```

2. **Check service logs:**
   Look for `[audio-dumper] Audio dumping enabled` message

3. **Check directory exists:**
   ```bash
   ls -la audio-dumps/
   ```

4. **Check permissions:**
   ```bash
   ls -ld audio-dumps/
   # Should show write permissions
   ```

### Files in wrong location?

1. **Check AUDIO_DUMP_DIR:**
   ```bash
   echo $AUDIO_DUMP_DIR
   ```

2. **Check service working directory:**
   The path is relative to where the service is running

3. **Use absolute path:**
   ```bash
   export AUDIO_DUMP_DIR=/absolute/path/to/dumps
   ```

