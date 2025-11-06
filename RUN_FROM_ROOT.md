# ⚠️ Important: Run Commands from Project Root

## Common Mistakes

### ❌ Wrong: Running from subdirectories

```bash
cd services/ingest
npx tsx scripts/test-transcript-flow.ts  # ❌ Script not found here
```

### ✅ Correct: Run from project root

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
npx tsx scripts/test-transcript-flow.ts  # ✅ Works!
```

---

## Quick Reference

### Always Start from Project Root

```bash
# Navigate to project root first
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin

# Then run commands
./start-all-services.sh
npx tsx scripts/test-transcript-flow.ts
```

### Test Script Location

- ✅ **Correct**: `scripts/test-transcript-flow.ts` (in project root)
- ❌ **Wrong**: `services/ingest/scripts/test-transcript-flow.ts` (doesn't exist)

### Node.js Version

- ✅ **Required**: Node.js 20+
- ❌ **Current**: Node.js 18.20.8

**Fix:**
```bash
nvm use 20
# Or install Node.js 20
```

---

## Correct Workflow

### 1. Navigate to Project Root

```bash
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
```

### 2. Use Node.js 20

```bash
nvm use 20
# Verify
node -v  # Should show v20.x.x
```

### 3. Start Services

```bash
./start-all-services.sh
```

### 4. Run Tests

```bash
# From project root
npx tsx scripts/test-transcript-flow.ts
```

---

## Service-Specific Commands

### Ingestion Service

```bash
# Start from project root
cd services/ingest
npm run dev

# Test WebSocket (from project root)
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin
node scripts/generate-test-jwt.js
cd services/ingest
JWT_TOKEN="<token>" ./scripts/simulate_exotel_client.sh
```

### ASR Worker

```bash
# Start from project root
cd services/asr-worker
npm run dev
```

---

## Quick Fix for Current Issue

```bash
# 1. Go to project root
cd /Users/kirti.krishnan/Desktop/Projects/rtaafin

# 2. Use Node.js 20
nvm use 20

# 3. Start services
./start-all-services.sh

# 4. Run test (from root)
npx tsx scripts/test-transcript-flow.ts
```

---

## File Locations

| File | Location |
|------|----------|
| `test-transcript-flow.ts` | `scripts/` (project root) |
| `start-all-services.sh` | Project root |
| `stop-all-services.sh` | Project root |
| `generate-test-jwt.js` | `scripts/` (project root) |
| `simulate_exotel_client.sh` | `services/ingest/scripts/` |

---

## Remember

✅ **Always start from project root**  
✅ **Use Node.js 20+**  
✅ **Run `./start-all-services.sh` to start everything**

