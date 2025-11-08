# 🔌 Exotel WebSocket URL Configuration

**Service Deployed:** ✅ `https://rtaa-ingest.onrender.com`  
**WebSocket Endpoint:** `wss://rtaa-ingest.onrender.com/v1/ingest`

---

## 📋 WebSocket URL for Exotel

### Primary WebSocket URL
```
wss://rtaa-ingest.onrender.com/v1/ingest
```

**Protocol:** `wss://` (WebSocket Secure)  
**Host:** `rtaa-ingest.onrender.com`  
**Path:** `/v1/ingest`

---

## 🔐 Authentication Options

The ingestion service supports **two authentication methods** for Exotel:

### Option 1: IP Whitelisting (Recommended for Exotel)

If Exotel provides static IP addresses, you can whitelist them in Render:

1. **Get Exotel's IP addresses** (contact Exotel support)
2. **Configure in Render:**
   - Go to Render Dashboard → Your Service → Settings
   - Add IP whitelist rules (if available)
   - Or use Render's firewall/security groups

3. **Disable JWT authentication for Exotel:**
   - Set environment variable: `SUPPORT_EXOTEL=true`
   - The service will detect Exotel protocol and skip JWT validation

### Option 2: Basic Auth (Exotel's Preferred Method)

Exotel supports Basic Authentication. Configure in Exotel dashboard:

- **Username:** (configure in Exotel)
- **Password:** (configure in Exotel)
- **URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`

The service will detect Basic Auth headers and authenticate accordingly.

### Option 3: JWT Token (For Custom Clients)

For non-Exotel clients, use JWT authentication:

```
Authorization: Bearer <jwt-token>
```

**Note:** JWT authentication requires a valid token signed with the `JWT_PUBLIC_KEY` configured in Render.

---

## 📨 Exotel Message Format

Exotel sends messages in JSON format:

### Start Event
```json
{
  "event": "start",
  "interaction_id": "int-123",
  "tenant_id": "tenant-abc",
  "sample_rate": 24000,
  "encoding": "pcm16"
}
```

### Audio Frames (Base64 Encoded)
```json
{
  "event": "audio",
  "data": "<base64-encoded-pcm16-audio>",
  "seq": 42
}
```

### End Event
```json
{
  "event": "end"
}
```

---

## 🔧 Render Environment Variables

Ensure these are set in Render Dashboard:

| Variable | Value | Required |
|----------|-------|----------|
| `REDIS_URL` | `redis://...` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `SUPPORT_EXOTEL` | `true` | ✅ Recommended |
| `JWT_PUBLIC_KEY` | `-----BEGIN PUBLIC KEY-----...` | ⚠️ Only if using JWT |
| `PORT` | (auto-set by Render) | ❌ No |

---

## ✅ Testing the WebSocket Endpoint

### Test with `wscat` (Local Testing)
```bash
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"
```

### Test Health Endpoint
```bash
curl https://rtaa-ingest.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ingest",
  "pubsub": true,
  "timestamp": "2025-11-07T..."
}
```

---

## 📝 Exotel Dashboard Configuration

When configuring Exotel's ExoStreamKit:

1. **WebSocket URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`
2. **Authentication:**
   - **Method:** Basic Auth (recommended) or IP Whitelisting
   - **Username/Password:** (configure in Exotel dashboard)
3. **Audio Format:**
   - **Encoding:** PCM16
   - **Sample Rate:** 24000 Hz (or as configured)
   - **Chunk Size:** ~200ms
4. **Message Format:** JSON (as shown above)

---

## 🐛 Troubleshooting

### Connection Refused (401 Unauthorized)

**Cause:** Authentication failed  
**Solution:**
- Verify `SUPPORT_EXOTEL=true` is set in Render
- Check Exotel's IP addresses are whitelisted
- Verify Basic Auth credentials in Exotel dashboard

### Connection Timeout

**Cause:** Service not running or health check failing  
**Solution:**
- Check Render logs: `https://dashboard.render.com`
- Verify health endpoint: `curl https://rtaa-ingest.onrender.com/health`
- Check service status in Render dashboard

### Audio Not Being Processed

**Cause:** Pub/Sub adapter not connected  
**Solution:**
- Verify `REDIS_URL` is correct in Render
- Check `PUBSUB_ADAPTER=redis_streams`
- Review Render logs for Redis connection errors

---

## 🔗 Related Documentation

- `EXOSTREAMKIT_INTEGRATION.md` - Detailed Exotel integration guide
- `EXOSTREAMKIT_QUICK_REFERENCE.md` - Quick reference for Exotel protocol
- `RENDER_DEPLOYMENT_READY.md` - Render deployment guide

---

**WebSocket URL for Exotel:** `wss://rtaa-ingest.onrender.com/v1/ingest` ✅


**Service Deployed:** ✅ `https://rtaa-ingest.onrender.com`  
**WebSocket Endpoint:** `wss://rtaa-ingest.onrender.com/v1/ingest`

---

## 📋 WebSocket URL for Exotel

### Primary WebSocket URL
```
wss://rtaa-ingest.onrender.com/v1/ingest
```

**Protocol:** `wss://` (WebSocket Secure)  
**Host:** `rtaa-ingest.onrender.com`  
**Path:** `/v1/ingest`

---

## 🔐 Authentication Options

The ingestion service supports **two authentication methods** for Exotel:

### Option 1: IP Whitelisting (Recommended for Exotel)

If Exotel provides static IP addresses, you can whitelist them in Render:

1. **Get Exotel's IP addresses** (contact Exotel support)
2. **Configure in Render:**
   - Go to Render Dashboard → Your Service → Settings
   - Add IP whitelist rules (if available)
   - Or use Render's firewall/security groups

3. **Disable JWT authentication for Exotel:**
   - Set environment variable: `SUPPORT_EXOTEL=true`
   - The service will detect Exotel protocol and skip JWT validation

### Option 2: Basic Auth (Exotel's Preferred Method)

Exotel supports Basic Authentication. Configure in Exotel dashboard:

- **Username:** (configure in Exotel)
- **Password:** (configure in Exotel)
- **URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`

The service will detect Basic Auth headers and authenticate accordingly.

### Option 3: JWT Token (For Custom Clients)

For non-Exotel clients, use JWT authentication:

```
Authorization: Bearer <jwt-token>
```

**Note:** JWT authentication requires a valid token signed with the `JWT_PUBLIC_KEY` configured in Render.

---

## 📨 Exotel Message Format

Exotel sends messages in JSON format:

### Start Event
```json
{
  "event": "start",
  "interaction_id": "int-123",
  "tenant_id": "tenant-abc",
  "sample_rate": 24000,
  "encoding": "pcm16"
}
```

### Audio Frames (Base64 Encoded)
```json
{
  "event": "audio",
  "data": "<base64-encoded-pcm16-audio>",
  "seq": 42
}
```

### End Event
```json
{
  "event": "end"
}
```

---

## 🔧 Render Environment Variables

Ensure these are set in Render Dashboard:

| Variable | Value | Required |
|----------|-------|----------|
| `REDIS_URL` | `redis://...` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `SUPPORT_EXOTEL` | `true` | ✅ Recommended |
| `JWT_PUBLIC_KEY` | `-----BEGIN PUBLIC KEY-----...` | ⚠️ Only if using JWT |
| `PORT` | (auto-set by Render) | ❌ No |

---

## ✅ Testing the WebSocket Endpoint

### Test with `wscat` (Local Testing)
```bash
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"
```

### Test Health Endpoint
```bash
curl https://rtaa-ingest.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ingest",
  "pubsub": true,
  "timestamp": "2025-11-07T..."
}
```

---

## 📝 Exotel Dashboard Configuration

When configuring Exotel's ExoStreamKit:

1. **WebSocket URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`
2. **Authentication:**
   - **Method:** Basic Auth (recommended) or IP Whitelisting
   - **Username/Password:** (configure in Exotel dashboard)
3. **Audio Format:**
   - **Encoding:** PCM16
   - **Sample Rate:** 24000 Hz (or as configured)
   - **Chunk Size:** ~200ms
4. **Message Format:** JSON (as shown above)

---

## 🐛 Troubleshooting

### Connection Refused (401 Unauthorized)

**Cause:** Authentication failed  
**Solution:**
- Verify `SUPPORT_EXOTEL=true` is set in Render
- Check Exotel's IP addresses are whitelisted
- Verify Basic Auth credentials in Exotel dashboard

### Connection Timeout

**Cause:** Service not running or health check failing  
**Solution:**
- Check Render logs: `https://dashboard.render.com`
- Verify health endpoint: `curl https://rtaa-ingest.onrender.com/health`
- Check service status in Render dashboard

### Audio Not Being Processed

**Cause:** Pub/Sub adapter not connected  
**Solution:**
- Verify `REDIS_URL` is correct in Render
- Check `PUBSUB_ADAPTER=redis_streams`
- Review Render logs for Redis connection errors

---

## 🔗 Related Documentation

- `EXOSTREAMKIT_INTEGRATION.md` - Detailed Exotel integration guide
- `EXOSTREAMKIT_QUICK_REFERENCE.md` - Quick reference for Exotel protocol
- `RENDER_DEPLOYMENT_READY.md` - Render deployment guide

---

**WebSocket URL for Exotel:** `wss://rtaa-ingest.onrender.com/v1/ingest` ✅

