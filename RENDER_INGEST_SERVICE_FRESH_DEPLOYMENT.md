# 🚀 Ingest Service - Fresh Deployment on Render

## Branch Information
**Branch:** `feat/exotel-deepgram-bridge`  
**Repository:** `exkrishan/rtaafin`  
**Service Type:** Web Service (Node.js)

---

## 📋 Step-by-Step Deployment

### Step 1: Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect repository: `exkrishan/rtaafin`
4. Select branch: **`feat/exotel-deepgram-bridge`**

---

## ⚙️ Service Configuration

### Basic Settings

| Field | Value |
|-------|-------|
| **Name** | `rtaa-ingest` (or `ingest` if available) |
| **Service Type** | `Web Service` ✅ |
| **Environment** | `Node` ✅ |
| **Region** | `Singapore (Southeast Asia)` (or your preferred region) |
| **Branch** | `feat/exotel-deepgram-bridge` ⚠️ **IMPORTANT** |
| **Auto-Deploy** | `Yes` (recommended) |

### Build Configuration

| Field | Value |
|-------|-------|
| **Root Directory** | `services/ingest` ⚠️ **CRITICAL** |
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` ⚠️ **CRITICAL** |
| **Start Command** | `npm run start` ✅ |
| **Node Version** | `20.x` (auto-detected) |

### Health Check (Advanced Settings)

| Field | Value |
|-------|-------|
| **Health Check Path** | `/health` |
| **Health Check Interval** | `30 seconds` (default) |

---

## 🔐 Environment Variables

### Required Variables (Must Add)

Add these in Render Dashboard → Your Service → **Environment** tab:

#### 1. REDIS_URL
**Key:** `REDIS_URL`  
**Value:**
```
redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
```
**Required:** ✅ Yes

---

#### 2. PUBSUB_ADAPTER
**Key:** `PUBSUB_ADAPTER`  
**Value:**
```
redis_streams
```
**Required:** ✅ Yes

---

#### 3. JWT_PUBLIC_KEY
**Key:** `JWT_PUBLIC_KEY`  
**Value:**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----
```
**Required:** ✅ Yes  
**Important:** 
- Copy the ENTIRE value including `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----`
- Keep newlines intact (Render supports multi-line env vars)

---

### Optional Variables (With Defaults)

#### 4. SUPPORT_EXOTEL
**Key:** `SUPPORT_EXOTEL`  
**Value:**
```
false
```
**Required:** ❌ No (default: `false`)  
**Note:** Set to `true` if you need Exotel protocol support

---

#### 5. EXO_BRIDGE_ENABLED
**Key:** `EXO_BRIDGE_ENABLED`  
**Value:**
```
false
```
**Required:** ❌ No (default: `false`)  
**Note:** Set to `true` to enable Exotel→ASR bridge feature

---

#### 6. EXO_MAX_BUFFER_MS
**Key:** `EXO_MAX_BUFFER_MS`  
**Value:**
```
500
```
**Required:** ❌ No (default: `500`)  
**Range:** 100-10000 (milliseconds)  
**Note:** Only used if `EXO_BRIDGE_ENABLED=true`

---

#### 7. EXO_IDLE_CLOSE_S
**Key:** `EXO_IDLE_CLOSE_S`  
**Value:**
```
10
```
**Required:** ❌ No (default: `10`)  
**Range:** 1-300 (seconds)  
**Note:** Only used if `EXO_BRIDGE_ENABLED=true`

---

#### 8. BUFFER_DURATION_MS
**Key:** `BUFFER_DURATION_MS`  
**Value:**
```
3000
```
**Required:** ❌ No (default: `3000`)  
**Range:** 100-30000 (milliseconds)

---

#### 9. ACK_INTERVAL
**Key:** `ACK_INTERVAL`  
**Value:**
```
10
```
**Required:** ❌ No (default: `10`)  
**Range:** 1-1000

---

### Do NOT Add These

- ❌ **PORT** - Render sets this automatically
- ❌ **SSL_KEY_PATH** - Render handles HTTPS termination
- ❌ **SSL_CERT_PATH** - Render handles HTTPS termination

---

## 📝 Complete Environment Variables Checklist

### Minimum Required (Service will start):
- [ ] `REDIS_URL` = `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`
- [ ] `PUBSUB_ADAPTER` = `redis_streams`
- [ ] `JWT_PUBLIC_KEY` = (full PEM key with BEGIN/END markers)

### Recommended (Production):
- [ ] `SUPPORT_EXOTEL` = `false` (or `true` if needed)
- [ ] `BUFFER_DURATION_MS` = `3000`
- [ ] `ACK_INTERVAL` = `10`

### Optional (Exotel Bridge):
- [ ] `EXO_BRIDGE_ENABLED` = `false` (set to `true` to enable)
- [ ] `EXO_MAX_BUFFER_MS` = `500` (if bridge enabled)
- [ ] `EXO_IDLE_CLOSE_S` = `10` (if bridge enabled)

---

## 🎯 Quick Deployment Steps

### 1. Create Service
1. Render Dashboard → **"New +"** → **"Web Service"**
2. Connect: `exkrishan/rtaafin`
3. Branch: `feat/exotel-deepgram-bridge`

### 2. Configure Settings
- **Name:** `rtaa-ingest`
- **Root Directory:** `services/ingest`
- **Build Command:** `cd ../.. && npm ci && cd services/ingest && npm run build`
- **Start Command:** `npm run start`
- **Health Check Path:** `/health`

### 3. Add Environment Variables
Go to **Environment** tab and add:
1. `REDIS_URL` (required)
2. `PUBSUB_ADAPTER` (required)
3. `JWT_PUBLIC_KEY` (required)

### 4. Deploy
1. Click **"Save Changes"**
2. Render will automatically start deployment
3. Monitor build logs

---

## ✅ Verification

### After Deployment, Check:

#### 1. Build Logs
Look for:
```
==> Running build command 'cd ../.. && npm ci && cd services/ingest && npm run build'
==> npm ci (installing dependencies) ✅
==> cd services/ingest && npm run build ✅
==> Build successful ✅
```

#### 2. Health Endpoint
```bash
curl https://your-service-name.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "ingest",
  "pubsubAdapter": "redis_streams",
  "exoBridgeEnabled": false
}
```

#### 3. Service Logs
Look for:
```
[server] ✅ Configuration validation passed
[server] Using pub/sub adapter: redis_streams
[server] Ingestion server listening on port <PORT>
```

---

## 🔍 Troubleshooting

### Build Fails with "npm ci" Error
**Error:** `npm ci can only install packages when your package.json and package-lock.json are in sync`

**Solution:**
1. Ensure you're on the `feat/exotel-deepgram-bridge` branch
2. The root `package-lock.json` should be up to date (already fixed in commit `57a0a85`)
3. If still failing, change build command to:
   ```
   cd ../.. && npm install && cd services/ingest && npm run build
   ```

### Service Won't Start
**Check:**
1. All required environment variables are set
2. `REDIS_URL` is correct and accessible
3. `JWT_PUBLIC_KEY` includes BEGIN/END markers
4. Check logs for specific error messages

### Health Check Fails
**Check:**
1. Service is running (check logs)
2. Health endpoint is `/health` (not `/api/health`)
3. Service has finished starting (wait 30-60 seconds after deploy)

---

## 📊 Service Endpoints

### WebSocket Endpoint
```
wss://your-service-name.onrender.com/v1/ingest
```

### Health Check
```
https://your-service-name.onrender.com/health
```

---

## 🔐 Security Notes

⚠️ **Important:**
- Never commit `.env.local` to git
- `JWT_PUBLIC_KEY` is sensitive - keep it secure
- `REDIS_URL` contains credentials - keep it secure
- Always use Render's environment variable UI
- Don't hardcode secrets in code

---

## 📚 Related Documentation

- [Ingest Service Changes Summary](./INGEST_SERVICE_CHANGES_ELEVENLABS_BRANCH.md)
- [Exotel Bridge Implementation](../docs/exotel-bridge-implementation-summary.md)
- [Ingest Service README](./services/ingest/README.md)

---

## 🎯 Summary

### What You Need:
1. ✅ Render account
2. ✅ GitHub repository access
3. ✅ Redis URL (provided above)
4. ✅ JWT Public Key (provided above)

### What Gets Deployed:
- ✅ WebSocket ingestion server
- ✅ Exotel protocol support (optional, via feature flag)
- ✅ Exotel→ASR bridge (optional, via feature flag)
- ✅ Health check endpoint
- ✅ Pub/Sub integration with Redis

### Deployment Time:
- ⏱️ Build: ~3-5 minutes
- ⏱️ Start: ~10-30 seconds
- ⏱️ Total: ~5-6 minutes

---

**Last Updated:** 2025-11-13  
**Branch:** `feat/exotel-deepgram-bridge`  
**Status:** ✅ Ready for deployment

