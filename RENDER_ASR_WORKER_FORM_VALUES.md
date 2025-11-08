# 📋 Render ASR Worker Service - Form Values

## ✅ Complete Configuration

### Basic Settings

| Field | Value |
|-------|-------|
| **Source Code** | `exkrishan/rtaa-fin` (already selected) |
| **Service Type** | `Web Service` ✅ |
| **Name** | `rtaa-asr-worker` ✅ |
| **Project** | `My project` (or your project name) |
| **Language** | `Node` ✅ |
| **Branch** | `main` ✅ |
| **Region** | `Singapore (Southeast Asia)` (or your preferred region) |

### Build Configuration

| Field | Value |
|-------|-------|
| **Root Directory** | `services/asr-worker` ⚠️ **IMPORTANT** |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` ⚠️ **IMPORTANT** |
| **Start Command** | `npm run start` ✅ |

### Instance Type

| Field | Value |
|-------|-------|
| **Instance Type** | `Free` (for testing) or `Starter` ($7/month) for production |

### Environment Variables

**Add these environment variables:**

| Variable Name | Value |
|---------------|-------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` |
| `PUBSUB_ADAPTER` | `redis_streams` |
| `ASR_PROVIDER` | `deepgram` |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` |
| `PORT` | (Leave empty - Render will auto-assign, or set to `3001`) |

**Optional (with defaults):**
- `BUFFER_WINDOW_MS` = `300` (optional)
- `REDIS_CONSUMER_GROUP` = `asr-worker` (optional)
- `REDIS_CONSUMER_NAME` = `asr-worker-1` (optional)

### Health Check (Advanced)

| Field | Value |
|-------|-------|
| **Health Check Path** | `/health` |

---

## 🎯 Critical Fields to Update

### ⚠️ **Root Directory** (Currently Empty)
```
services/asr-worker
```

### ⚠️ **Build Command** (Currently: `npm install; npm run build`)
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Why?** 
- The build command needs to run from the repo root to install workspace dependencies
- `npm ci` installs all workspace packages (including `@rtaa/pubsub`)
- Then builds the ASR worker service

### ⚠️ **Environment Variables** (Currently only has `PORT`)
Add all 4 required variables:
1. `REDIS_URL`
2. `PUBSUB_ADAPTER`
3. `ASR_PROVIDER`
4. `DEEPGRAM_API_KEY`

---

## 📝 Step-by-Step Instructions

1. **Root Directory**: 
   - Change from empty to: `services/asr-worker`

2. **Build Command**: 
   - Change from `npm install; npm run build` to:
   - `cd ../.. && npm ci && cd services/asr-worker && npm run build`

3. **Start Command**: 
   - Keep as: `npm run start` ✅

4. **Environment Variables**:
   - Click "Add Environment Variable" for each:
     - `REDIS_URL` = `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`
     - `PUBSUB_ADAPTER` = `redis_streams`
     - `ASR_PROVIDER` = `deepgram`
     - `DEEPGRAM_API_KEY` = `d65326fff430ad13ad6ad78acfe305a8d8c8245e`
   - Remove or keep `PORT` (Render will auto-assign)

5. **Health Check** (in Advanced section):
   - Set to: `/health`

6. **Click "Deploy Web Service"**

---

## ✅ Final Checklist

Before clicking "Deploy Web Service", verify:

- [ ] **Root Directory**: `services/asr-worker`
- [ ] **Build Command**: `cd ../.. && npm ci && cd services/asr-worker && npm run build`
- [ ] **Start Command**: `npm run start`
- [ ] **Environment Variables**: All 4 required variables added
  - [ ] `REDIS_URL`
  - [ ] `PUBSUB_ADAPTER=redis_streams`
  - [ ] `ASR_PROVIDER=deepgram`
  - [ ] `DEEPGRAM_API_KEY`
- [ ] **Health Check Path**: `/health` (in Advanced section)

---

## 🚀 After Deployment

Once deployed, check logs for:

```
[ASRWorker] Initialized { provider: 'deepgram', ... }
[ASRWorker] Subscribing to audio topic: audio_stream
[ASRWorker] Server listening on port ...
[RedisStreamsAdapter] Connected to Redis: ...
```

If you see these, the ASR worker is running successfully! 🎉


## ✅ Complete Configuration

### Basic Settings

| Field | Value |
|-------|-------|
| **Source Code** | `exkrishan/rtaa-fin` (already selected) |
| **Service Type** | `Web Service` ✅ |
| **Name** | `rtaa-asr-worker` ✅ |
| **Project** | `My project` (or your project name) |
| **Language** | `Node` ✅ |
| **Branch** | `main` ✅ |
| **Region** | `Singapore (Southeast Asia)` (or your preferred region) |

### Build Configuration

| Field | Value |
|-------|-------|
| **Root Directory** | `services/asr-worker` ⚠️ **IMPORTANT** |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` ⚠️ **IMPORTANT** |
| **Start Command** | `npm run start` ✅ |

### Instance Type

| Field | Value |
|-------|-------|
| **Instance Type** | `Free` (for testing) or `Starter` ($7/month) for production |

### Environment Variables

**Add these environment variables:**

| Variable Name | Value |
|---------------|-------|
| `REDIS_URL` | `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304` |
| `PUBSUB_ADAPTER` | `redis_streams` |
| `ASR_PROVIDER` | `deepgram` |
| `DEEPGRAM_API_KEY` | `d65326fff430ad13ad6ad78acfe305a8d8c8245e` |
| `PORT` | (Leave empty - Render will auto-assign, or set to `3001`) |

**Optional (with defaults):**
- `BUFFER_WINDOW_MS` = `300` (optional)
- `REDIS_CONSUMER_GROUP` = `asr-worker` (optional)
- `REDIS_CONSUMER_NAME` = `asr-worker-1` (optional)

### Health Check (Advanced)

| Field | Value |
|-------|-------|
| **Health Check Path** | `/health` |

---

## 🎯 Critical Fields to Update

### ⚠️ **Root Directory** (Currently Empty)
```
services/asr-worker
```

### ⚠️ **Build Command** (Currently: `npm install; npm run build`)
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Why?** 
- The build command needs to run from the repo root to install workspace dependencies
- `npm ci` installs all workspace packages (including `@rtaa/pubsub`)
- Then builds the ASR worker service

### ⚠️ **Environment Variables** (Currently only has `PORT`)
Add all 4 required variables:
1. `REDIS_URL`
2. `PUBSUB_ADAPTER`
3. `ASR_PROVIDER`
4. `DEEPGRAM_API_KEY`

---

## 📝 Step-by-Step Instructions

1. **Root Directory**: 
   - Change from empty to: `services/asr-worker`

2. **Build Command**: 
   - Change from `npm install; npm run build` to:
   - `cd ../.. && npm ci && cd services/asr-worker && npm run build`

3. **Start Command**: 
   - Keep as: `npm run start` ✅

4. **Environment Variables**:
   - Click "Add Environment Variable" for each:
     - `REDIS_URL` = `redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304`
     - `PUBSUB_ADAPTER` = `redis_streams`
     - `ASR_PROVIDER` = `deepgram`
     - `DEEPGRAM_API_KEY` = `d65326fff430ad13ad6ad78acfe305a8d8c8245e`
   - Remove or keep `PORT` (Render will auto-assign)

5. **Health Check** (in Advanced section):
   - Set to: `/health`

6. **Click "Deploy Web Service"**

---

## ✅ Final Checklist

Before clicking "Deploy Web Service", verify:

- [ ] **Root Directory**: `services/asr-worker`
- [ ] **Build Command**: `cd ../.. && npm ci && cd services/asr-worker && npm run build`
- [ ] **Start Command**: `npm run start`
- [ ] **Environment Variables**: All 4 required variables added
  - [ ] `REDIS_URL`
  - [ ] `PUBSUB_ADAPTER=redis_streams`
  - [ ] `ASR_PROVIDER=deepgram`
  - [ ] `DEEPGRAM_API_KEY`
- [ ] **Health Check Path**: `/health` (in Advanced section)

---

## 🚀 After Deployment

Once deployed, check logs for:

```
[ASRWorker] Initialized { provider: 'deepgram', ... }
[ASRWorker] Subscribing to audio topic: audio_stream
[ASRWorker] Server listening on port ...
[RedisStreamsAdapter] Connected to Redis: ...
```

If you see these, the ASR worker is running successfully! 🎉

