# 🎯 Enable Audio Dumping on Render Service

## Quick Setup

Since you already have the ingest service deployed on Render, you just need to:

1. **Add environment variables** in Render Dashboard
2. **Redeploy** (or wait for auto-deploy)
3. **Configure Exotel** to use your Render URL

---

## Step 1: Add Environment Variables in Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Find your **Ingest Service** (probably named `rtaa-ingest` or `ingest`)
3. Click on the service
4. Go to **Environment** tab
5. Click **"Add Environment Variable"**

Add these variables:

| Key | Value | Description |
|-----|-------|-------------|
| `AUDIO_DUMP_ENABLED` | `true` | Enable audio dumping |
| `AUDIO_DUMP_DIR` | `/tmp/audio-dumps` | Directory to save files (Render's temp directory) |
| `AUDIO_DUMP_FORMAT` | `wav` | Save as WAV files |
| `SUPPORT_EXOTEL` | `true` | Enable Exotel support (if not already set) |

**Note:** Render's filesystem is **ephemeral** (files are lost on restart). For persistent storage, you'd need to use a volume or external storage.

---

## Step 2: Get Your Render Service URL

Your Render service URL should be something like:
```
https://rtaa-ingest.onrender.com
```

Or check in Render Dashboard → Your Service → **Settings** → **Service URL**

---

## Step 3: Configure Exotel

In Exotel Dashboard, set the WebSocket URL to:

```
wss://YOUR-SERVICE-NAME.onrender.com/v1/ingest
```

**Example:**
```
wss://rtaa-ingest.onrender.com/v1/ingest
```

**Important:**
- Use `wss://` (secure WebSocket)
- Add `/v1/ingest` at the end
- Replace `YOUR-SERVICE-NAME` with your actual Render service name

---

## Step 4: Access Audio Dumps

Since Render's filesystem is ephemeral, you have a few options:

### Option A: Check Render Logs

Audio dump logs will appear in Render logs:
```
[audio-dumper] 💾 Dumped audio chunk { ... }
```

### Option B: SSH into Render (if available)

Some Render plans allow SSH access to view files.

### Option C: Stream Files Elsewhere

Modify the code to upload files to S3, Google Drive, or another storage service.

### Option D: Use Render Volumes (Paid Plans)

If you have a paid Render plan, you can mount a persistent volume.

---

## Step 5: Verify It's Working

### Check Render Logs

1. Go to Render Dashboard → Your Service → **Logs**
2. Look for:
   - `[audio-dumper] Audio dumping enabled`
   - `[exotel] New Exotel WebSocket connection`
   - `[audio-dumper] 💾 Dumped audio chunk`

### Test Connection

```bash
curl https://YOUR-SERVICE-NAME.onrender.com/health
```

Should return:
```json
{
  "status": "ok",
  "service": "ingest"
}
```

---

## Complete Environment Variables for Render

Here's the complete list of environment variables you should have:

```bash
# Required
REDIS_URL=redis://default:...@redis-12304...
PUBSUB_ADAPTER=redis_streams
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...

# Exotel Support
SUPPORT_EXOTEL=true

# Audio Dumping
AUDIO_DUMP_ENABLED=true
AUDIO_DUMP_DIR=/tmp/audio-dumps
AUDIO_DUMP_FORMAT=wav

# Optional
BUFFER_DURATION_MS=3000
ACK_INTERVAL=10
```

---

## Troubleshooting

### No Audio Dumps

1. **Check environment variables are set** in Render Dashboard
2. **Check logs** for `[audio-dumper] Audio dumping enabled`
3. **Verify Exotel is connecting** - look for `[exotel] New Exotel WebSocket connection`
4. **Check service was redeployed** after adding environment variables

### Files Not Accessible

- Render's `/tmp` directory is ephemeral
- Files are lost on service restart
- Consider using external storage (S3, etc.) for persistent access

### Exotel Can't Connect

1. **Verify URL format:** `wss://YOUR-SERVICE.onrender.com/v1/ingest`
2. **Check service is running:** `curl https://YOUR-SERVICE.onrender.com/health`
3. **Check Render logs** for connection errors

---

## Next Steps

1. ✅ Add environment variables in Render
2. ✅ Wait for service to redeploy (or manually redeploy)
3. ✅ Configure Exotel with Render URL
4. ✅ Make a test call
5. ✅ Check Render logs for audio dump messages

---

## Summary

- **Render Service URL:** `https://YOUR-SERVICE.onrender.com`
- **Exotel WebSocket URL:** `wss://YOUR-SERVICE.onrender.com/v1/ingest`
- **Audio Dumps Location:** `/tmp/audio-dumps/` (ephemeral)
- **Check Logs:** Render Dashboard → Logs

