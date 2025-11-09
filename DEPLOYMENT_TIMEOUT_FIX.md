# 🔧 Deployment Timeout Fix Guide

## Problem
Deployment timed out after ~15 minutes. Build succeeded, but deployment phase failed.

## Root Cause
Render is waiting for the health check endpoint to respond, but it's timing out. This usually means:
1. Health check path is not configured correctly
2. Service is taking too long to start
3. Health endpoint is not accessible

## Solution

### Step 1: Verify Health Check Configuration in Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your service (likely the Next.js frontend)
3. Go to **Settings** → **Health Check**
4. Verify these settings:

| Setting | Value |
|---------|-------|
| **Health Check Path** | `/api/health` |
| **Health Check Interval** | `30 seconds` (default) |

### Step 2: Check Service Logs

In Render Dashboard → **Logs**, look for:
- ✅ `Ready - started server on 0.0.0.0:PORT`
- ❌ Any errors during startup
- ❌ Health check failures

### Step 3: Verify Health Endpoint Works

The health endpoint should be simple and fast:
```typescript
// app/api/health/route.ts
export async function GET() {
  return new Response(JSON.stringify({ status: "ok", service: "frontend" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
```

### Step 4: Check Build & Start Commands

In Render Dashboard → **Settings** → **Build & Deploy**:

| Setting | Value |
|---------|-------|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm run start` |
| **Node Version** | `20.x` |

### Step 5: Check Environment Variables

Make sure these are set (if needed):
- `NODE_ENV=production` (optional, Render sets this)
- `PORT` (auto-set by Render, don't override)

### Step 6: Manual Health Check Test

After deployment starts, test the health endpoint:
```bash
curl https://<your-service-url>.onrender.com/api/health
```

Expected response:
```json
{"status":"ok","service":"frontend"}
```

## Common Issues & Fixes

### Issue 1: Health Check Path Not Set
**Symptom:** Deployment times out, no health check logs
**Fix:** Set Health Check Path to `/api/health` in Render settings

### Issue 2: Service Taking Too Long to Start
**Symptom:** Build succeeds, but service doesn't start
**Fix:** 
- Check logs for startup errors
- Verify all environment variables are set
- Check if database/Redis connections are blocking startup

### Issue 3: Health Endpoint Not Accessible
**Symptom:** Health check fails with 404
**Fix:** 
- Verify the route file exists: `app/api/health/route.ts`
- Check Next.js build output for route compilation
- Ensure route is not blocked by middleware

### Issue 4: Port Binding Issues
**Symptom:** Service starts but health check fails
**Fix:** 
- Verify `package.json` start command uses `process.env.PORT`
- Check if service is binding to correct port
- Look for port binding errors in logs

## Quick Fix Checklist

- [ ] Health Check Path is set to `/api/health` in Render
- [ ] Health endpoint file exists: `app/api/health/route.ts`
- [ ] Build command: `npm ci && npm run build`
- [ ] Start command: `npm run start`
- [ ] Node version: `20.x`
- [ ] No blocking operations in startup (database, Redis, etc.)
- [ ] Environment variables are set correctly
- [ ] Service logs show successful startup

## Next Steps

1. **Update Render Settings:**
   - Go to Render Dashboard
   - Settings → Health Check
   - Set path to `/api/health`
   - Save and redeploy

2. **Monitor Logs:**
   - Watch deployment logs
   - Look for health check attempts
   - Check for startup errors

3. **Test Health Endpoint:**
   - Once deployed, test: `curl https://<url>/api/health`
   - Should return: `{"status":"ok","service":"frontend"}`

4. **If Still Timing Out:**
   - Check service logs for errors
   - Verify all dependencies are available
   - Check if service is actually starting
   - Consider increasing health check timeout in Render (if available)

## Expected Deployment Flow

```
1. Build Phase (✅ Success)
   └─ npm ci && npm run build
   
2. Upload Phase (✅ Success)
   └─ Upload build artifacts
   
3. Deploy Phase (❌ Timeout)
   └─ Start service
   └─ Wait for health check
   └─ Health check should respond within 30s
   └─ If no response after 15min → Timeout
```

## Debug Commands

### Check if Health Endpoint is Built
```bash
# After build, check if route exists
ls -la .next/server/app/api/health/
```

### Test Health Endpoint Locally
```bash
# Start service locally
npm run start

# Test health endpoint
curl http://localhost:3000/api/health
```

### Check Render Logs
```bash
# In Render Dashboard → Logs
# Look for:
# - "Ready - started server"
# - "GET /api/health"
# - Health check responses
```

## If Nothing Works

1. **Check Render Status Page:** https://status.render.com
2. **Try Manual Deploy:** Cancel auto-deploy, trigger manual deploy
3. **Check Service Limits:** Verify you're not hitting resource limits
4. **Contact Render Support:** If issue persists

