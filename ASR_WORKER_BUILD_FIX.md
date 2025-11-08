# 🔧 ASR Worker Build Fix

## ❌ Current Error

```
npm error The `npm ci` command can only install with an existing package-lock.json
```

## 🔍 Root Cause

The build command `cd ../.. && npm ci` might have path resolution issues in Render's environment.

## ✅ Solution

### Option 1: Use `npm install` (Recommended)

**Build Command:**
```
cd ../.. && npm install && cd services/asr-worker && npm run build
```

**Why:**
- `npm install` works even if package-lock.json has issues
- More forgiving in workspace environments
- Still uses lockfile if available

### Option 2: Use `npm ci` with explicit workspace root

**Build Command:**
```
npm ci --workspace-root && cd services/asr-worker && npm run build
```

**Why:**
- Explicitly targets workspace root
- More reliable path resolution

### Option 3: Two-step build (Most Reliable)

**Build Command:**
```
(cd ../.. && npm ci) && npm run build
```

**Why:**
- Separates install and build steps
- Clearer error messages
- More reliable in Render environment

---

## 🎯 Recommended Fix

**Update Render ASR Worker Service:**

1. Go to Render Dashboard → ASR Worker Service
2. Click "Manual Deploy"
3. Update **Build Command to:

```
cd ../.. && npm install && cd services/asr-worker && npm run build
```

4. Click **"Save Changes"**
5. Trigger a new deploy

---

## 📊 Expected After Fix

**Build logs should show:**
```
==> Running build command...
==> cd ../.. && npm install && cd services/asr-worker && npm run build
==> npm install (installing dependencies)
==> cd services/asr-worker && npm run build
==> Build successful ✅
```

---

## 🔄 Alternative: If npm install doesn't work

If `npm install` also fails, try:

**Build Command:**
```
npm install --workspace-root && npm run build
```

This uses npm workspace commands which are more reliable in monorepo setups.
