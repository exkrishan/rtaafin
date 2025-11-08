# ✅ Render ASR Worker - Fixed Configuration

## ❌ Error Fixed

**Error:** `Service Root Directory "/opt/render/project/src/services/asr-worker" is missing.`

**Status:** ✅ Directory exists and is tracked by git. Issue is Render's path configuration.

---

## ✅ Correct Configuration

### Root Directory
```
services/asr-worker
```

### Build Command
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Why this works:**
- Render sets working directory to `services/asr-worker` (from Root Directory)
- `cd ../..` goes to repo root (`/opt/render/project/src/`)
- `npm ci` installs all workspace dependencies (including `@rtaa/pubsub`)
- `cd services/asr-worker` goes back to service directory
- `npm run build` builds the service

### Start Command
```
npm run start
```

**Why this works:**
- Render sets working directory to `services/asr-worker` (from Root Directory)
- `npm run start` runs from that directory
- Executes `node dist/index.js` as defined in `package.json`

---

## 📋 Complete Form Values

| Field | Value |
|-------|-------|
| **Name** | `rtaa-asr-worker` ✅ |
| **Service Type** | `Web Service` ✅ |
| **Language** | `Node` ✅ |
| **Branch** | `main` ✅ |
| **Region** | `Singapore (Southeast Asia)` (or your region) |
| **Root Directory** | `services/asr-worker` ⚠️ **FIXED** |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` ⚠️ **FIXED** |
| **Start Command** | `npm run start` ✅ |
| **Health Check Path** | `/health` |

---

## 🔐 Environment Variables

Add these 4 required variables:

| Variable | Value |
|----------|-------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` |
| `PUBSUB_ADAPTER` | `redis_streams` |
| `ASR_PROVIDER` | `deepgram` |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` |

**Optional:**
- `PORT` (Render auto-assigns, but you can set to `3001` if needed)
- `BUFFER_WINDOW_MS` = `300`
- `REDIS_CONSUMER_GROUP` = `asr-worker`
- `REDIS_CONSUMER_NAME` = `asr-worker-1`

---

## 🎯 Quick Action

1. **Update Root Directory:** `services/asr-worker`
2. **Update Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
3. **Keep Start Command:** `npm run start`
4. **Add Environment Variables:** All 4 required ones
5. **Set Health Check:** `/health` (in Advanced section)
6. **Click "Deploy Web Service"**

---

## ✅ Expected Build Logs

After fixing, you should see:

```
==> Cloning from https://github.com/exkrishan/rtaafin
==> Checking out commit ...
==> Using Node.js version 20
==> Running build command 'cd ../.. && npm ci && cd services/asr-worker && npm run build'
==> npm ci (installing workspace dependencies)
==> npm run build (building ASR worker)
✅ Build successful: dist/index.js exists
==> Your service is live 🎉
```

---

## 🐛 If Still Failing

If you still get the error, try:

### Alternative 1: Leave Root Directory Empty

**Root Directory:** (Leave empty/blank)

**Build Command:**
```
cd services/asr-worker && npm ci && npm run build
```

**Start Command:**
```
cd services/asr-worker && npm run start
```

### Alternative 2: Use Absolute Paths

**Root Directory:** `services/asr-worker`

**Build Command:**
```
npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```
cd services/asr-worker && npm run start
```

---

**This configuration matches the working ingestion service setup!** ✅


## ❌ Error Fixed

**Error:** `Service Root Directory "/opt/render/project/src/services/asr-worker" is missing.`

**Status:** ✅ Directory exists and is tracked by git. Issue is Render's path configuration.

---

## ✅ Correct Configuration

### Root Directory
```
services/asr-worker
```

### Build Command
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Why this works:**
- Render sets working directory to `services/asr-worker` (from Root Directory)
- `cd ../..` goes to repo root (`/opt/render/project/src/`)
- `npm ci` installs all workspace dependencies (including `@rtaa/pubsub`)
- `cd services/asr-worker` goes back to service directory
- `npm run build` builds the service

### Start Command
```
npm run start
```

**Why this works:**
- Render sets working directory to `services/asr-worker` (from Root Directory)
- `npm run start` runs from that directory
- Executes `node dist/index.js` as defined in `package.json`

---

## 📋 Complete Form Values

| Field | Value |
|-------|-------|
| **Name** | `rtaa-asr-worker` ✅ |
| **Service Type** | `Web Service` ✅ |
| **Language** | `Node` ✅ |
| **Branch** | `main` ✅ |
| **Region** | `Singapore (Southeast Asia)` (or your region) |
| **Root Directory** | `services/asr-worker` ⚠️ **FIXED** |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` ⚠️ **FIXED** |
| **Start Command** | `npm run start` ✅ |
| **Health Check Path** | `/health` |

---

## 🔐 Environment Variables

Add these 4 required variables:

| Variable | Value |
|----------|-------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` |
| `PUBSUB_ADAPTER` | `redis_streams` |
| `ASR_PROVIDER` | `deepgram` |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` |

**Optional:**
- `PORT` (Render auto-assigns, but you can set to `3001` if needed)
- `BUFFER_WINDOW_MS` = `300`
- `REDIS_CONSUMER_GROUP` = `asr-worker`
- `REDIS_CONSUMER_NAME` = `asr-worker-1`

---

## 🎯 Quick Action

1. **Update Root Directory:** `services/asr-worker`
2. **Update Build Command:** `cd ../.. && npm ci && cd services/asr-worker && npm run build`
3. **Keep Start Command:** `npm run start`
4. **Add Environment Variables:** All 4 required ones
5. **Set Health Check:** `/health` (in Advanced section)
6. **Click "Deploy Web Service"**

---

## ✅ Expected Build Logs

After fixing, you should see:

```
==> Cloning from https://github.com/exkrishan/rtaafin
==> Checking out commit ...
==> Using Node.js version 20
==> Running build command 'cd ../.. && npm ci && cd services/asr-worker && npm run build'
==> npm ci (installing workspace dependencies)
==> npm run build (building ASR worker)
✅ Build successful: dist/index.js exists
==> Your service is live 🎉
```

---

## 🐛 If Still Failing

If you still get the error, try:

### Alternative 1: Leave Root Directory Empty

**Root Directory:** (Leave empty/blank)

**Build Command:**
```
cd services/asr-worker && npm ci && npm run build
```

**Start Command:**
```
cd services/asr-worker && npm run start
```

### Alternative 2: Use Absolute Paths

**Root Directory:** `services/asr-worker`

**Build Command:**
```
npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```
cd services/asr-worker && npm run start
```

---

**This configuration matches the working ingestion service setup!** ✅

