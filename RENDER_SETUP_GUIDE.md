# 🚀 Render Setup Guide - services/ingest

## How to Configure Render for npm build (Option 1 - Recommended)

### Step-by-Step Instructions

#### 1. Go to Your Render Dashboard
- Log in to [Render Dashboard](https://dashboard.render.com)
- Navigate to your `services/ingest` service (or create a new one)

#### 2. Access Service Settings
- Click on your service name
- Go to **Settings** tab (in the left sidebar)

#### 3. Change Environment Type
- Scroll to **Environment** section
- Change from **Docker** to **Node**
  - If you see "Docker" selected, click the dropdown
  - Select **"Node"** instead

#### 4. Configure Build Settings
Scroll to **Build & Deploy** section:

**Root Directory:**
```
services/ingest
```

**Build Command:**
```
npm run build
```

**Start Command:**
```
npm start
```

#### 5. Set Environment Variables
Go to **Environment** tab and add:

```
PORT=5000
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Yuy5TNziNEXIX2Vei1l
mKtqgfevXkUdMfVhDxEXEMNrwX4uU3cye4zpiW2XueBs0wiAUwaF/oGswA7L51Km
ebcDtVr9yMG2Dl/wMIhH55ZzOC1dweb+N5qY8u6H02FpStZou8KUCmQlf1tzvK4Y
sMehFTPXhGzLopA8oPbnQRkoRvL27Dn+QfLxYgnakex7F12XMI56cLcfhSSE+gQ7
z3mbYeIiBTwl9AufxslUy0aobBmKPqaAMq9vPPtkbGUwmyOVVOHuuK2Jq/wjr26z
tzyWjUNznSwHZmP0ISd4+SXJvrSHqJx/M3eTEaOokZH71TlbsHCyDbR8uXkD+uez
LQIDAQAB
-----END PUBLIC KEY-----"
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://default:A3jwWDxGfJSf2kmzrclCBUs2aNBs2EOD@redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304
SUPPORT_EXOTEL=true
```

**Note:** 
- `PORT` is optional (Render sets it automatically)
- `JWT_PUBLIC_KEY` - Keep the newlines in the value
- `REDIS_URL` - Your Redis Cloud connection string

#### 6. Save and Deploy
- Click **Save Changes** at the bottom
- Render will automatically trigger a new deployment
- Watch the build logs to verify the `prebuild` script runs successfully

---

## Alternative: Using Docker (Option 2)

If you prefer to use Docker:

### Docker Configuration

**Root Directory:**
```
.
```
(Repo root, not `services/ingest`)

**Dockerfile Path:**
```
services/ingest/Dockerfile
```

**Environment:** `Docker`

**Note:** This requires building from the repo root, which may not work if Render clones only the service directory.

---

## Verification

After deployment, check:

1. **Build Logs** - Should show:
   ```
   > @rtaa/ingest-service@0.1.0 prebuild
   > if [ ! -d ./lib/pubsub ]; then ...
   ```

2. **Build Success** - Should show:
   ```
   > @rtaa/ingest-service@0.1.0 build
   > tsc -p tsconfig.json
   ```
   (No errors about missing `lib/pubsub`)

3. **Service Health** - Visit:
   ```
   https://your-service.onrender.com/health
   ```
   Should return: `{"status":"ok","service":"ingest"}`

---

## Troubleshooting

### Build fails with "Cannot find module '../lib/pubsub'"

**Solution:** 
- Ensure **Root Directory** is set to `services/ingest`
- Ensure **Environment** is `Node` (not Docker)
- Check build logs to see if `prebuild` script ran

### Service won't start

**Check:**
- Environment variables are set correctly
- `PORT` is available (Render sets this automatically)
- Check service logs for errors

### prebuild script doesn't run

**Solution:**
- Verify `package.json` has the `prebuild` script
- Check that Root Directory is `services/ingest`
- Ensure you're using npm build (not Docker)

---

## Quick Reference

| Setting | Value |
|---------|-------|
| **Environment** | Node |
| **Root Directory** | `services/ingest` |
| **Build Command** | `npm run build` |
| **Start Command** | `npm start` |
| **Node Version** | 18 or 20 (Render default) |

---

**Need Help?** Check the build logs in Render dashboard for detailed error messages.

