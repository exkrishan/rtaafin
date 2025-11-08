# 🔧 Render ASR Worker - Root Directory Fix

## ❌ Error

```
Service Root Directory "/opt/render/project/src/services/asr-worker" is missing.
```

## 🔍 Problem

Render is looking for the directory at `/opt/render/project/src/services/asr-worker`, but it doesn't exist.

**Possible causes:**
1. Root Directory field is set incorrectly
2. Render is adding a `src` prefix automatically
3. The directory structure doesn't match what Render expects

## ✅ Solution

### Option 1: Set Root Directory to Empty (Recommended)

**Try setting Root Directory to empty/blank** and let Render use the repo root.

Then update the Build Command to:
```
cd services/asr-worker && npm ci && npm run build
```

And Start Command:
```
cd services/asr-worker && npm run start
```

### Option 2: Use Correct Relative Path

If Root Directory field is required, try:

**Root Directory:** `services/asr-worker`

**Build Command:** 
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```
cd services/asr-worker && npm run start
```

### Option 3: Check Repository Structure

Verify the directory exists in your repo:

```bash
# In your local repo
ls -la services/asr-worker/
```

If it exists, the issue might be:
- Render's path resolution
- Git not tracking the directory (check `.gitignore`)
- Case sensitivity issues

## 🔍 Debugging Steps

1. **Check if directory exists in repo:**
   ```bash
   git ls-files services/asr-worker/
   ```

2. **Verify it's not in .gitignore:**
   ```bash
   cat .gitignore | grep -i asr
   ```

3. **Check Render's clone path:**
   - Render clones to `/opt/render/project/src/`
   - So `services/asr-worker` should be at `/opt/render/project/src/services/asr-worker`
   - But the error suggests it's not finding it there

## ✅ Recommended Configuration

### If Root Directory Field is Optional:

| Field | Value |
|-------|-------|
| **Root Directory** | (Leave empty/blank) |
| **Build Command** | `cd services/asr-worker && npm ci && npm run build` |
| **Start Command** | `cd services/asr-worker && npm run start` |

### If Root Directory Field is Required:

| Field | Value |
|-------|-------|
| **Root Directory** | `services/asr-worker` |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` |
| **Start Command** | `npm run start` |

## 🎯 Quick Fix

**Try this first:**

1. **Root Directory:** Leave it **empty/blank** (or delete the value)
2. **Build Command:** `cd services/asr-worker && npm ci && npm run build`
3. **Start Command:** `cd services/asr-worker && npm run start`

This tells Render to:
- Start from repo root
- Change into `services/asr-worker` directory
- Run build/start commands from there

## 📋 Alternative: Use Full Path in Commands

If Root Directory must be set, try:

**Root Directory:** `services/asr-worker`

**Build Command:**
```bash
npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```bash
cd services/asr-worker && npm run start
```

---

## 🐛 If Still Failing

Check:
1. Is `services/asr-worker` committed to git?
2. Does it have a `package.json`?
3. Is the path case-sensitive? (try `Services/ASR-Worker` if on Linux)

---

**Next:** After fixing, redeploy and check if the directory is found!


## ❌ Error

```
Service Root Directory "/opt/render/project/src/services/asr-worker" is missing.
```

## 🔍 Problem

Render is looking for the directory at `/opt/render/project/src/services/asr-worker`, but it doesn't exist.

**Possible causes:**
1. Root Directory field is set incorrectly
2. Render is adding a `src` prefix automatically
3. The directory structure doesn't match what Render expects

## ✅ Solution

### Option 1: Set Root Directory to Empty (Recommended)

**Try setting Root Directory to empty/blank** and let Render use the repo root.

Then update the Build Command to:
```
cd services/asr-worker && npm ci && npm run build
```

And Start Command:
```
cd services/asr-worker && npm run start
```

### Option 2: Use Correct Relative Path

If Root Directory field is required, try:

**Root Directory:** `services/asr-worker`

**Build Command:** 
```
cd ../.. && npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```
cd services/asr-worker && npm run start
```

### Option 3: Check Repository Structure

Verify the directory exists in your repo:

```bash
# In your local repo
ls -la services/asr-worker/
```

If it exists, the issue might be:
- Render's path resolution
- Git not tracking the directory (check `.gitignore`)
- Case sensitivity issues

## 🔍 Debugging Steps

1. **Check if directory exists in repo:**
   ```bash
   git ls-files services/asr-worker/
   ```

2. **Verify it's not in .gitignore:**
   ```bash
   cat .gitignore | grep -i asr
   ```

3. **Check Render's clone path:**
   - Render clones to `/opt/render/project/src/`
   - So `services/asr-worker` should be at `/opt/render/project/src/services/asr-worker`
   - But the error suggests it's not finding it there

## ✅ Recommended Configuration

### If Root Directory Field is Optional:

| Field | Value |
|-------|-------|
| **Root Directory** | (Leave empty/blank) |
| **Build Command** | `cd services/asr-worker && npm ci && npm run build` |
| **Start Command** | `cd services/asr-worker && npm run start` |

### If Root Directory Field is Required:

| Field | Value |
|-------|-------|
| **Root Directory** | `services/asr-worker` |
| **Build Command** | `cd ../.. && npm ci && cd services/asr-worker && npm run build` |
| **Start Command** | `npm run start` |

## 🎯 Quick Fix

**Try this first:**

1. **Root Directory:** Leave it **empty/blank** (or delete the value)
2. **Build Command:** `cd services/asr-worker && npm ci && npm run build`
3. **Start Command:** `cd services/asr-worker && npm run start`

This tells Render to:
- Start from repo root
- Change into `services/asr-worker` directory
- Run build/start commands from there

## 📋 Alternative: Use Full Path in Commands

If Root Directory must be set, try:

**Root Directory:** `services/asr-worker`

**Build Command:**
```bash
npm ci && cd services/asr-worker && npm run build
```

**Start Command:**
```bash
cd services/asr-worker && npm run start
```

---

## 🐛 If Still Failing

Check:
1. Is `services/asr-worker` committed to git?
2. Does it have a `package.json`?
3. Is the path case-sensitive? (try `Services/ASR-Worker` if on Linux)

---

**Next:** After fixing, redeploy and check if the directory is found!

