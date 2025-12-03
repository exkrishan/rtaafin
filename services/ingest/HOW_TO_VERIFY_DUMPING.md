# ✅ How to Verify Audio Dumping is Working

## Quick Checklist

1. ✅ Check service logs for dump messages
2. ✅ Check Google Drive for uploaded files
3. ✅ Verify environment variables are set
4. ✅ Make a test call from Exotel

---

## Method 1: Check Render Logs (Easiest)

### Step 1: Go to Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your service: `ingestservice` (or `rtaa-ingest`)
3. Click on it → Go to **Logs** tab

### Step 2: Look for These Messages

#### On Service Startup:
```
[audio-dumper] Audio dumping enabled { dump_dir: '/tmp/audio-dumps', format: 'wav' }
[google-drive] Google Drive uploads enabled { parent_folder: 'Audio Dumps', auth_method: 'JSON string' }
[google-drive] Google Drive client will initialize on first upload
```

#### When Exotel Connects:
```
[exotel] New Exotel WebSocket connection
[exotel] Start event received via JSON
```

#### When Audio Chunks are Dumped:
```
[audio-dumper] 💾 Dumped audio chunk {
  interaction_id: 'CA123...',
  seq: 1,
  file_path: '/tmp/audio-dumps/CA123.../chunk-000001.wav',
  size_bytes: 320,
  sample_rate: 8000,
  format: 'wav',
  duration_ms: 20
}
```

#### When Files are Uploaded to Google Drive:
```
[google-drive] ✅ Uploaded to Google Drive {
  interaction_id: 'CA123...',
  file_name: 'chunk-000001.wav',
  file_id: '...',
  web_link: 'https://drive.google.com/...'
}
```

---

## Method 2: Check Google Drive

### Step 1: Go to Google Drive

1. Go to [Google Drive](https://drive.google.com)
2. Look for folder: **Audio Dumps**

### Step 2: Check for Call Folders

Inside "Audio Dumps", you should see:
```
Audio Dumps/
├── Call CA1234567890/  (your Exotel call SID)
│   ├── chunk-000001.wav
│   ├── chunk-000002.wav
│   ├── chunk-000003.wav
│   └── ...
```

### Step 3: Verify Files

- **Files appear in real-time** as the call is happening
- **Each file** is a small audio chunk (~20ms of audio)
- **Files are playable** - you can click to play them in Google Drive

---

## Method 3: Check Environment Variables

### In Render Dashboard

1. Go to Render Dashboard → Your Service → **Environment**
2. Verify these are set:

**Required:**
- `AUDIO_DUMP_ENABLED=true` ✅
- `GOOGLE_DRIVE_ENABLED=true` ✅
- `GOOGLE_APPLICATION_CREDENTIALS_JSON={...}` ✅

**Optional:**
- `AUDIO_DUMP_DIR=/tmp/audio-dumps`
- `AUDIO_DUMP_FORMAT=wav`
- `GOOGLE_DRIVE_PARENT_FOLDER_NAME=Audio Dumps`

---

## Method 4: Real-Time Monitoring

### While Call is Active

Watch Render logs in real-time. You should see:

1. **Connection:**
   ```
   [exotel] New Exotel WebSocket connection
   ```

2. **Start Event:**
   ```
   [exotel] Start event received via JSON
   ```

3. **Audio Chunks (every few seconds):**
   ```
   [audio-dumper] 💾 Dumped audio chunk { seq: 1, ... }
   [google-drive] ✅ Uploaded to Google Drive { file_name: 'chunk-000001.wav', ... }
   [audio-dumper] 💾 Dumped audio chunk { seq: 2, ... }
   [google-drive] ✅ Uploaded to Google Drive { file_name: 'chunk-000002.wav', ... }
   ```

---

## Troubleshooting

### No Dump Messages in Logs

**Possible causes:**
1. `AUDIO_DUMP_ENABLED` not set to `true`
2. Exotel not connecting
3. No audio being sent from Exotel

**Check:**
- Environment variables in Render
- Look for `[exotel]` connection messages
- Verify call is active and you're speaking

### No Files in Google Drive

**Possible causes:**
1. `GOOGLE_DRIVE_ENABLED` not set to `true`
2. `GOOGLE_APPLICATION_CREDENTIALS_JSON` not set or invalid
3. Google Drive API not enabled
4. Service account doesn't have Drive access

**Check:**
- Environment variables in Render
- Look for `[google-drive]` messages in logs
- Check for error messages about Google Drive

### Files in Logs but Not in Drive

**Possible causes:**
1. Google Drive upload is failing silently
2. Network issues
3. Quota exceeded

**Check logs for:**
```
[google-drive] ❌ Failed to upload to Google Drive
```

---

## Expected Behavior

### During a Call

1. **Every ~20ms** (50 times per second):
   - Audio chunk is dumped to file
   - File is uploaded to Google Drive
   - Log messages appear

2. **Log frequency:**
   - First 3 chunks: Always logged
   - Every 100th chunk: Logged
   - Others: Silent (to reduce noise)

3. **File count:**
   - 1 minute call ≈ 3,000 chunks
   - 5 minute call ≈ 15,000 chunks

---

## Quick Test

1. **Make a 10-second test call** from Exotel
2. **Speak during the call**
3. **Check Render logs** - should see ~500 dump messages
4. **Check Google Drive** - should see ~500 files in the call folder

---

## Summary

✅ **Check Render Logs** - Look for `[audio-dumper]` and `[google-drive]` messages  
✅ **Check Google Drive** - Look for "Audio Dumps" folder with call folders  
✅ **Verify Environment Variables** - Make sure all are set correctly  
✅ **Make Test Call** - Speak during call and watch logs in real-time  

If you see dump messages in logs AND files in Google Drive → **It's working!** 🎉

