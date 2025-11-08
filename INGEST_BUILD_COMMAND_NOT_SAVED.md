# ⚠️ Ingest Service Build Command Not Updated

## 🔍 Problem

After updating the build command in Render dashboard, the logs still show:
```
Running build command 'cd ../.. && npm ci && cd services/ingest && npm run build'
```

This means the change **didn't take effect**.

---

## ✅ Solution Steps

### Step 1: Verify Build Command Was Saved

1. Go to **Render Dashboard** → **Ingest Service** (rtaa-ingest)
2. Click **"Settings"** tab
3. Scroll to **"Build Command"** section
4. **Verify** it shows:
   ```
   cd ../.. && npm install && cd services/ingest && npm run build
   ```
   (Should say `npm install`, NOT `npm ci`)

5. **If it still shows `npm ci`:**
   - Update it again to `npm install`
   - Click **"Save Changes"**
   - Wait for confirmation

### Step 2: Clear Cache and Redeploy

**Important:** After changing build command, you MUST clear cache:

1. Click **"Manual Deploy"** button (top right)
2. Select **"Clear build cache & deploy"** (NOT just "Deploy latest commit")
3. This ensures Render uses the new build command

### Step 3: Verify Latest Commit

The logs show it's deploying commit `574c034` (old commit).

**Make sure it deploys the latest commit:**
- Latest commit should be: `316ceda` (or newer)
- If it's still deploying old commit, force a new deploy

---

## 🎯 Complete Fix Process

### Option A: Update Build Command Again

1. **Settings** → **Build Command**
2. Change to:
   ```
   cd ../.. && npm install && cd services/ingest && npm run build
   ```
3. Click **"Save Changes"**
4. Wait 5 seconds for save to complete
5. Click **"Manual Deploy"**
6. Select **"Clear build cache & deploy"**
7. Watch logs - should now show `npm install`

### Option B: If Build Command Won't Save

Sometimes Render has caching issues. Try:

1. **Save** the build command
2. **Refresh** the page
3. **Check** if it saved (go back to Settings)
4. If not saved, try:
   - Update to a different command first (e.g., add a space)
   - Save
   - Then update to the correct command
   - Save again

---

## ✅ Expected After Fix

**Build logs should show:**
```
==> Running build command 'cd ../.. && npm install && cd services/ingest && npm run build'
==> npm install (installing dependencies) ✅
==> cd services/ingest && npm run build ✅
==> Build successful ✅
```

**NOT:**
```
==> Running build command 'cd ../.. && npm ci && cd services/ingest && npm run build' ❌
```

---

## 🔍 Troubleshooting

### If Build Command Still Shows `npm ci`:

1. **Check if you're editing the right service:**
   - Service name: `rtaa-ingest` or `ingest`
   - NOT the frontend service
   - NOT the ASR worker service

2. **Check if Settings tab is correct:**
   - Should be in **"Settings"** tab
   - NOT "Environment" tab
   - NOT "Deploys" tab

3. **Try logging out and back in:**
   - Sometimes Render caches settings
   - Log out → Log back in → Try again

### If Still Failing:

**Alternative Build Command:**
```
npm install --workspace-root && cd services/ingest && npm run build
```

This uses npm workspace commands which might work better.

---

## 📝 Summary

**Issue:** Build command change not taking effect

**Solution:**
1. Verify it's saved (check Settings again)
2. Use "Clear build cache & deploy" (not just deploy)
3. Make sure it's the latest commit

**Expected:** Build logs show `npm install` instead of `npm ci`

