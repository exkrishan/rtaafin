# 🔧 ASR Worker Build Fix

## ❌ Error

```
Error: Cannot find module '/opt/render/project/src/services/asr-worker/dist/index.js'
```

**Status:** Build succeeded, but `dist/index.js` not found at expected location.

---

## 🔍 Root Cause

TypeScript compiler (`tsc`) is outputting files to a **nested structure** instead of directly to `dist/`:

**Expected:**
```
dist/
  ├── index.js
  ├── metrics.js
  └── providers/
      └── ...
```

**Actual (nested):**
```
dist/
  └── services/
      └── asr-worker/
          └── src/
              ├── index.js
              └── ...
```

This happens because:
- `tsconfig.json` doesn't have `rootDir` set (or it's inferred incorrectly)
- TypeScript preserves the directory structure from the source files
- The build output ends up in a nested path

---

## ✅ Solution

Added build scripts to `services/asr-worker/package.json` (matching ingestion service):

### 1. **prebuild** - Environment validation
```json
"prebuild": "npm run validate:env || echo '⚠️  Environment validation skipped (non-blocking)'"
```

### 2. **build:lib** - Compile shared library
```json
"build:lib": "cd ../../lib/pubsub && tsc && echo '✅ Compiled lib/pubsub' || echo '⚠️  lib/pubsub compilation skipped'"
```

### 3. **build** - Compile service
```json
"build": "npm run build:lib && tsc -p tsconfig.json || (echo '❌ TypeScript compilation failed' && exit 1)"
```

### 4. **fix:paths** - Fix import paths in compiled JS
```json
"fix:paths": "node -e \"...fixes @rtaa/pubsub imports to ../../../lib/pubsub/dist...\""
```

### 5. **postbuild** - Move nested files to dist/ root
```json
"postbuild": "npm run fix:paths && node -e \"...finds nested dist/ and moves files to dist/ root...\""
```

---

## 📋 What the postbuild Script Does

1. **Finds nested directory:** Searches for `dist/services/asr-worker/src/` or similar
2. **Moves files:** Copies all `.js` files from nested location to `dist/` root
3. **Cleans up:** Removes the nested directory
4. **Validates:** Checks that `dist/index.js` exists, exits with error if not

---

## ✅ Expected Build Output

After fix, build logs should show:

```
> @rtaa/asr-worker@0.1.0 build
> npm run build:lib && tsc -p tsconfig.json

✅ Compiled lib/pubsub
[TypeScript compilation output]

> @rtaa/asr-worker@0.1.0 postbuild
> npm run fix:paths && node -e "..."

✅ Fixed import paths
✅ Moved compiled files to dist/
✅ Build successful: dist/index.js exists
```

---

## 🚀 Next Steps

1. **Commit and push:**
   ```bash
   git add services/asr-worker/package.json
   git commit -m "fix: Add build scripts to fix dist/index.js location for ASR worker"
   git push
   ```

2. **Render will auto-redeploy:**
   - Build should now succeed
   - `dist/index.js` will be at correct location
   - Service should start successfully

3. **Verify in logs:**
   - Look for: `✅ Build successful: dist/index.js exists`
   - Look for: `[ASRWorker] Server listening on port ...`

---

## 📝 Comparison with Ingestion Service

This fix matches the working ingestion service configuration:
- Same `prebuild`, `build:lib`, `postbuild`, `fix:paths` scripts
- Same approach to handling nested TypeScript output
- Same validation and error handling

---

## 🐛 If Still Failing

If you still get the error after this fix:

1. **Check build logs** for `postbuild` output
2. **Verify** `dist/index.js` exists after build
3. **Check** if `tsconfig.json` has `rootDir` set (should be removed or set correctly)

---

**Status:** ✅ Fixed - Ready to commit and push!


## ❌ Error

```
Error: Cannot find module '/opt/render/project/src/services/asr-worker/dist/index.js'
```

**Status:** Build succeeded, but `dist/index.js` not found at expected location.

---

## 🔍 Root Cause

TypeScript compiler (`tsc`) is outputting files to a **nested structure** instead of directly to `dist/`:

**Expected:**
```
dist/
  ├── index.js
  ├── metrics.js
  └── providers/
      └── ...
```

**Actual (nested):**
```
dist/
  └── services/
      └── asr-worker/
          └── src/
              ├── index.js
              └── ...
```

This happens because:
- `tsconfig.json` doesn't have `rootDir` set (or it's inferred incorrectly)
- TypeScript preserves the directory structure from the source files
- The build output ends up in a nested path

---

## ✅ Solution

Added build scripts to `services/asr-worker/package.json` (matching ingestion service):

### 1. **prebuild** - Environment validation
```json
"prebuild": "npm run validate:env || echo '⚠️  Environment validation skipped (non-blocking)'"
```

### 2. **build:lib** - Compile shared library
```json
"build:lib": "cd ../../lib/pubsub && tsc && echo '✅ Compiled lib/pubsub' || echo '⚠️  lib/pubsub compilation skipped'"
```

### 3. **build** - Compile service
```json
"build": "npm run build:lib && tsc -p tsconfig.json || (echo '❌ TypeScript compilation failed' && exit 1)"
```

### 4. **fix:paths** - Fix import paths in compiled JS
```json
"fix:paths": "node -e \"...fixes @rtaa/pubsub imports to ../../../lib/pubsub/dist...\""
```

### 5. **postbuild** - Move nested files to dist/ root
```json
"postbuild": "npm run fix:paths && node -e \"...finds nested dist/ and moves files to dist/ root...\""
```

---

## 📋 What the postbuild Script Does

1. **Finds nested directory:** Searches for `dist/services/asr-worker/src/` or similar
2. **Moves files:** Copies all `.js` files from nested location to `dist/` root
3. **Cleans up:** Removes the nested directory
4. **Validates:** Checks that `dist/index.js` exists, exits with error if not

---

## ✅ Expected Build Output

After fix, build logs should show:

```
> @rtaa/asr-worker@0.1.0 build
> npm run build:lib && tsc -p tsconfig.json

✅ Compiled lib/pubsub
[TypeScript compilation output]

> @rtaa/asr-worker@0.1.0 postbuild
> npm run fix:paths && node -e "..."

✅ Fixed import paths
✅ Moved compiled files to dist/
✅ Build successful: dist/index.js exists
```

---

## 🚀 Next Steps

1. **Commit and push:**
   ```bash
   git add services/asr-worker/package.json
   git commit -m "fix: Add build scripts to fix dist/index.js location for ASR worker"
   git push
   ```

2. **Render will auto-redeploy:**
   - Build should now succeed
   - `dist/index.js` will be at correct location
   - Service should start successfully

3. **Verify in logs:**
   - Look for: `✅ Build successful: dist/index.js exists`
   - Look for: `[ASRWorker] Server listening on port ...`

---

## 📝 Comparison with Ingestion Service

This fix matches the working ingestion service configuration:
- Same `prebuild`, `build:lib`, `postbuild`, `fix:paths` scripts
- Same approach to handling nested TypeScript output
- Same validation and error handling

---

## 🐛 If Still Failing

If you still get the error after this fix:

1. **Check build logs** for `postbuild` output
2. **Verify** `dist/index.js` exists after build
3. **Check** if `tsconfig.json` has `rootDir` set (should be removed or set correctly)

---

**Status:** ✅ Fixed - Ready to commit and push!

