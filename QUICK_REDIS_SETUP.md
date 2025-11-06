# 🚀 Quick Redis Setup Guide

## Your Situation

- ✅ macOS
- ❌ No Homebrew
- ⚠️ Podman (has issues)
- ✅ Make available
- ❌ Can't install Docker Desktop

## Best Options for You

### Option A: Build from Source (Recommended) ⭐

**Pros:** No package manager needed, full control  
**Cons:** Requires build tools (you have make, need to check gcc)

**Quick Install:**
```bash
# Run the automated script
./scripts/install-redis-from-source.sh
```

**Or Manual:**
```bash
cd ~/Downloads
curl -O https://download.redis.io/releases/redis-7.2.3.tar.gz
tar xzf redis-7.2.3.tar.gz
cd redis-7.2.3
make
./src/redis-server
```

---

### Option B: Redis Cloud (Easiest - No Install) ⭐⭐⭐

**Pros:** No installation, free tier, managed  
**Cons:** Requires internet, free tier has limits

**Steps:**
1. Sign up: https://redis.com/try-free/
2. Create free database
3. Copy connection URL
4. Update `.env.local`:
   ```bash
   REDIS_URL=redis://default:password@redis-xxxxx.cloud.redislabs.com:xxxxx
   ```
5. Done! No local installation needed.

---

### Option C: Fix Podman (If you want container approach)

**Troubleshoot Podman:**
```bash
# Check Podman status
podman machine list

# Try starting with more resources
podman machine set --cpus 2 --memory 2048
podman machine start

# If still fails, try removing and recreating
podman machine rm
podman machine init
podman machine start
```

---

## My Recommendation

**For Quick Setup:** Use **Redis Cloud** (Option B)
- No installation needed
- Works immediately
- Free tier is sufficient for development

**For Local Development:** Use **Build from Source** (Option A)
- Full control
- No external dependencies
- Works offline

---

## Quick Start (Redis Cloud)

1. **Sign up:** https://redis.com/try-free/
2. **Create database** (takes 2 minutes)
3. **Copy connection URL** from dashboard
4. **Update `.env.local`:**
   ```bash
   PUBSUB_ADAPTER=redis_streams
   REDIS_URL=redis://default:your-password@redis-xxxxx.cloud.redislabs.com:xxxxx
   ```
5. **Restart services:**
   ```bash
   ./stop-all-services.sh
   ./start-all-services.sh
   ```
6. **Test:**
   ```bash
   npx tsx scripts/test-websocket-asr-flow.ts
   ```

---

## Quick Start (Build from Source)

1. **Check prerequisites:**
   ```bash
   # Check if you have gcc/clang
   gcc --version || clang --version
   
   # If not, install Xcode Command Line Tools:
   xcode-select --install
   ```

2. **Run installation script:**
   ```bash
   ./scripts/install-redis-from-source.sh
   ```

3. **Start Redis:**
   ```bash
   redis-server
   # Or if not installed globally:
   cd ~/Downloads/redis-7.2.3
   ./src/redis-server
   ```

4. **Update `.env.local`:**
   ```bash
   PUBSUB_ADAPTER=redis_streams
   REDIS_URL=redis://localhost:6379
   ```

5. **Restart services:**
   ```bash
   ./stop-all-services.sh
   ./start-all-services.sh
   ```

---

## Which Should You Choose?

| Option | Time | Difficulty | Best For |
|--------|------|------------|----------|
| Redis Cloud | 2 min | ⭐ Easy | Quick start, testing |
| Build from Source | 10 min | ⭐⭐ Medium | Local development, offline |
| Fix Podman | 15 min | ⭐⭐⭐ Hard | Container preference |

**My recommendation:** Start with **Redis Cloud** for immediate testing, then build from source if you need local development.

---

## Need Help?

Tell me which option you want to try, and I'll guide you through it step-by-step!

