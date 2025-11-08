# 🚀 Render Deployment Guide - Ingestion Service

**Status:** ✅ Ready for Deployment  
**Last Updated:** 2025-11-07

---

## 📋 Pre-Deployment Checklist

- [x] ✅ Code committed and pushed to GitHub
- [x] ✅ Local testing successful (health endpoint working)
- [x] ✅ Build process validated
- [x] ✅ Environment variables documented
- [x] ✅ Error handling implemented
- [x] ✅ Health check endpoint working

---

## 🔧 Render Service Configuration

### Service Type
**Web Service** (not Static Site)

### Basic Settings

| Setting | Value |
|---------|-------|
| **Name** | `rtaa-ingest` (or `ingest`) |
| **Environment** | `Node` |
| **Region** | `Singapore (Southeast Asia)` or your preferred region |
| **Branch** | `main` |
| **Root Directory** | `services/ingest` ⚠️ **CRITICAL** |
| **Auto-Deploy** | `Yes` |

### Build & Start Commands

| Setting | Value |
|---------|-------|
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` ⚠️ **CRITICAL** |
| **Start Command** | `npm run start` |
| **Node Version** | `20.x` (auto-detected from `.nvmrc`) |

### Health Check

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/health` |
| **Health Check Interval** | `30 seconds` (default) |

---

## 🔐 Environment Variables

Add these in Render Dashboard → Environment:

| Key | Value | Required |
|-----|-------|----------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `JWT_PUBLIC_KEY` | Full PEM key (see `.env.local` or `RENDER_ENV_VALUES.md`) | ✅ Yes |
| `SUPPORT_EXOTEL` | `false` | ❌ Optional |
| `BUFFER_DURATION_MS` | `3000` | ❌ Optional (default: 3000) |
| `ACK_INTERVAL` | `10` | ❌ Optional (default: 10) |

**Note:** Do NOT add `PORT` - Render sets it automatically.

---

## 📝 Step-by-Step Deployment

### 1. Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `exkrishan/rtaafin`
4. Select branch: `main`

### 2. Configure Service

**Basic Information:**
- **Name:** `rtaa-ingest`
- **Region:** `Singapore (Southeast Asia)`
- **Branch:** `main`
- **Root Directory:** `services/ingest` ⚠️ **CRITICAL**

**Build & Deploy:**
- **Environment:** `Node`
- **Build Command:** `cd ../.. && npm ci && cd services/ingest && npm run build`
- **Start Command:** `npm run start`

**Health Check:**
- **Health Check Path:** `/health`

### 3. Add Environment Variables

Go to **Environment** tab and add:

```
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----
```

### 4. Deploy

1. Click **"Create Web Service"**
2. Monitor the build logs
3. Wait for deployment to complete

---

## ✅ Post-Deployment Verification

### 1. Check Build Logs

Look for:
```
✅ Compiled lib/pubsub
✅ Fixed import paths
✅ Build successful: dist/server.js exists
```

### 2. Check Deployment Logs

Look for:
```
[server] ✅ Ingestion server listening on port <PORT>
[server] WebSocket endpoint: ws://localhost:<PORT>/v1/ingest
[server] Health check: http://localhost:<PORT>/health
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', ... }
[RedisStreamsAdapter] Connected to Redis: ...
```

### 3. Test Health Endpoint

```bash
curl https://<your-service-url>.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "ingest"
}
```

### 4. Test WebSocket Endpoint

```bash
wscat -c wss://<your-service-url>.onrender.com/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"
```

---

## 🐛 Troubleshooting

### Build Fails: "Cannot find module '@rtaa/pubsub'"

**Solution:** Ensure Root Directory is `services/ingest` and Build Command includes `cd ../.. && npm ci`

### Build Fails: "dist/server.js not found"

**Solution:** Check build logs for TypeScript errors. Ensure `lib/pubsub` is compiled first.

### Deployment Fails: "Cannot find module '../../lib/pubsub/dist'"

**Solution:** The `fix:paths` script should handle this. Check build logs for path fixing.

### Service Crashes: "REDIS_URL is required"

**Solution:** Add `REDIS_URL` environment variable in Render dashboard.

### Service Crashes: "RedisStreamsAdapter is not a constructor"

**Solution:** Ensure `lib/pubsub` is compiled. The build command should handle this.

### Health Check Fails

**Solution:** 
- Verify health check path is `/health` (not `/api/health`)
- Check service logs for errors
- Ensure service is binding to `process.env.PORT`

---

## 📊 Monitoring

### Logs

Monitor logs in Render Dashboard → Logs tab for:
- Startup messages
- Connection errors
- Pub/Sub errors
- Health check requests

### Metrics

- **Health Check:** Should return 200 OK
- **Response Time:** Should be < 100ms for health endpoint
- **Memory Usage:** Monitor for memory leaks
- **CPU Usage:** Should be low for idle service

---

## 🔄 Updates

After code changes:
1. Push to `main` branch
2. Render will auto-deploy (if enabled)
3. Monitor build and deployment logs
4. Verify health endpoint after deployment

---

## 📚 Related Documentation

- `INGEST_SERVICE_STARTUP_FIX_PLAN.md` - Detailed fix plan
- `CTO_DEPLOYMENT_FIX.md` - CTO-level implementation details
- `TEST_LOCAL_COMMAND.md` - Local testing guide
- `RENDER_ENV_VALUES.md` - Environment variable values

---

**Ready to deploy!** 🚀


**Status:** ✅ Ready for Deployment  
**Last Updated:** 2025-11-07

---

## 📋 Pre-Deployment Checklist

- [x] ✅ Code committed and pushed to GitHub
- [x] ✅ Local testing successful (health endpoint working)
- [x] ✅ Build process validated
- [x] ✅ Environment variables documented
- [x] ✅ Error handling implemented
- [x] ✅ Health check endpoint working

---

## 🔧 Render Service Configuration

### Service Type
**Web Service** (not Static Site)

### Basic Settings

| Setting | Value |
|---------|-------|
| **Name** | `rtaa-ingest` (or `ingest`) |
| **Environment** | `Node` |
| **Region** | `Singapore (Southeast Asia)` or your preferred region |
| **Branch** | `main` |
| **Root Directory** | `services/ingest` ⚠️ **CRITICAL** |
| **Auto-Deploy** | `Yes` |

### Build & Start Commands

| Setting | Value |
|---------|-------|
| **Build Command** | `cd ../.. && npm ci && cd services/ingest && npm run build` ⚠️ **CRITICAL** |
| **Start Command** | `npm run start` |
| **Node Version** | `20.x` (auto-detected from `.nvmrc`) |

### Health Check

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/health` |
| **Health Check Interval** | `30 seconds` (default) |

---

## 🔐 Environment Variables

Add these in Render Dashboard → Environment:

| Key | Value | Required |
|-----|-------|----------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` | ✅ Yes |
| `PUBSUB_ADAPTER` | `redis_streams` | ✅ Yes |
| `JWT_PUBLIC_KEY` | Full PEM key (see `.env.local` or `RENDER_ENV_VALUES.md`) | ✅ Yes |
| `SUPPORT_EXOTEL` | `false` | ❌ Optional |
| `BUFFER_DURATION_MS` | `3000` | ❌ Optional (default: 3000) |
| `ACK_INTERVAL` | `10` | ❌ Optional (default: 10) |

**Note:** Do NOT add `PORT` - Render sets it automatically.

---

## 📝 Step-by-Step Deployment

### 1. Create New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository: `exkrishan/rtaafin`
4. Select branch: `main`

### 2. Configure Service

**Basic Information:**
- **Name:** `rtaa-ingest`
- **Region:** `Singapore (Southeast Asia)`
- **Branch:** `main`
- **Root Directory:** `services/ingest` ⚠️ **CRITICAL**

**Build & Deploy:**
- **Environment:** `Node`
- **Build Command:** `cd ../.. && npm ci && cd services/ingest && npm run build`
- **Start Command:** `npm run start`

**Health Check:**
- **Health Check Path:** `/health`

### 3. Add Environment Variables

Go to **Environment** tab and add:

```
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
PUBSUB_ADAPTER=redis_streams
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----
```

### 4. Deploy

1. Click **"Create Web Service"**
2. Monitor the build logs
3. Wait for deployment to complete

---

## ✅ Post-Deployment Verification

### 1. Check Build Logs

Look for:
```
✅ Compiled lib/pubsub
✅ Fixed import paths
✅ Build successful: dist/server.js exists
```

### 2. Check Deployment Logs

Look for:
```
[server] ✅ Ingestion server listening on port <PORT>
[server] WebSocket endpoint: ws://localhost:<PORT>/v1/ingest
[server] Health check: http://localhost:<PORT>/health
[pubsub] ✅ Pub/Sub adapter initialized: { adapter: 'redis_streams', ... }
[RedisStreamsAdapter] Connected to Redis: ...
```

### 3. Test Health Endpoint

```bash
curl https://<your-service-url>.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "ingest"
}
```

### 4. Test WebSocket Endpoint

```bash
wscat -c wss://<your-service-url>.onrender.com/v1/ingest \
  -H "Authorization: Bearer <jwt-token>"
```

---

## 🐛 Troubleshooting

### Build Fails: "Cannot find module '@rtaa/pubsub'"

**Solution:** Ensure Root Directory is `services/ingest` and Build Command includes `cd ../.. && npm ci`

### Build Fails: "dist/server.js not found"

**Solution:** Check build logs for TypeScript errors. Ensure `lib/pubsub` is compiled first.

### Deployment Fails: "Cannot find module '../../lib/pubsub/dist'"

**Solution:** The `fix:paths` script should handle this. Check build logs for path fixing.

### Service Crashes: "REDIS_URL is required"

**Solution:** Add `REDIS_URL` environment variable in Render dashboard.

### Service Crashes: "RedisStreamsAdapter is not a constructor"

**Solution:** Ensure `lib/pubsub` is compiled. The build command should handle this.

### Health Check Fails

**Solution:** 
- Verify health check path is `/health` (not `/api/health`)
- Check service logs for errors
- Ensure service is binding to `process.env.PORT`

---

## 📊 Monitoring

### Logs

Monitor logs in Render Dashboard → Logs tab for:
- Startup messages
- Connection errors
- Pub/Sub errors
- Health check requests

### Metrics

- **Health Check:** Should return 200 OK
- **Response Time:** Should be < 100ms for health endpoint
- **Memory Usage:** Monitor for memory leaks
- **CPU Usage:** Should be low for idle service

---

## 🔄 Updates

After code changes:
1. Push to `main` branch
2. Render will auto-deploy (if enabled)
3. Monitor build and deployment logs
4. Verify health endpoint after deployment

---

## 📚 Related Documentation

- `INGEST_SERVICE_STARTUP_FIX_PLAN.md` - Detailed fix plan
- `CTO_DEPLOYMENT_FIX.md` - CTO-level implementation details
- `TEST_LOCAL_COMMAND.md` - Local testing guide
- `RENDER_ENV_VALUES.md` - Environment variable values

---

**Ready to deploy!** 🚀

