# 🔧 Redis Setup Guide for RTAA

## Current Status

❌ **Redis is not installed** - Services are trying to connect but failing with `ECONNREFUSED`

## Installation Options

### Option 1: Install Redis via Homebrew (macOS - Recommended)

```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Redis
brew install redis

# Start Redis
brew services start redis
# OR run in foreground: redis-server

# Verify
redis-cli ping
# Should return: PONG
```

### Option 2: Install Redis via Package Manager (Linux)

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verify
redis-cli ping
```

### Option 3: Use Docker (If Available)

```bash
# Run Redis in Docker
docker run -d -p 6379:6379 --name redis-rtaa redis:7-alpine

# Verify
docker exec redis-rtaa redis-cli ping
```

### Option 4: Download and Build from Source

```bash
# Download Redis
wget https://download.redis.io/redis-stable.tar.gz
tar xzf redis-stable.tar.gz
cd redis-stable

# Build
make

# Run
src/redis-server
```

---

## After Installing Redis

### 1. Start Redis

```bash
# macOS (Homebrew)
brew services start redis

# Linux (systemd)
sudo systemctl start redis-server

# Or run directly
redis-server
```

### 2. Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

### 3. Update .env.local (Already Done)

```bash
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://localhost:6379
```

### 4. Restart Services

```bash
./stop-all-services.sh
./start-all-services.sh
```

### 5. Test the Flow

```bash
npx tsx scripts/test-websocket-asr-flow.ts
```

---

## Quick Setup Script

Run the setup script:

```bash
./scripts/setup-redis.sh
```

This will:
- Check if Redis is installed
- Install Redis if needed (via Homebrew on macOS)
- Start Redis server
- Verify it's running

---

## Troubleshooting

### Redis Connection Refused

**Error:** `ECONNREFUSED ::1:6379` or `ECONNREFUSED 127.0.0.1:6379`

**Solution:**
1. Check if Redis is running: `redis-cli ping`
2. If not running, start it: `redis-server` or `brew services start redis`
3. Check Redis is listening on port 6379: `lsof -i :6379`

### Redis Not Found

**Error:** `redis-server: command not found`

**Solution:**
1. Install Redis (see options above)
2. Add Redis to PATH if installed manually
3. Restart terminal/shell

### Permission Denied

**Error:** Permission denied when starting Redis

**Solution:**
- Use `sudo` if needed: `sudo redis-server`
- Or run as service: `brew services start redis` (macOS)

---

## Verify Complete Setup

After installing and starting Redis:

```bash
# 1. Check Redis is running
redis-cli ping
# Should return: PONG

# 2. Check services can connect
./scripts/check-websocket-asr-status.sh

# 3. Test complete flow
npx tsx scripts/test-websocket-asr-flow.ts
```

**Expected Result:**
```
✅ Step 6: Check ASR Metrics After Processing
   📊 Metrics Comparison:
      Audio chunks processed: 0 → 30 (Δ30)  ← Should increase!
```

---

## Current Configuration

- **Pub/Sub Adapter:** `redis_streams` (configured in `.env.local`)
- **Redis URL:** `redis://localhost:6379`
- **Status:** ⚠️ Redis not installed/running

---

## Next Steps

1. **Install Redis** using one of the options above
2. **Start Redis** server
3. **Restart services** with `./stop-all-services.sh && ./start-all-services.sh`
4. **Test the flow** with `npx tsx scripts/test-websocket-asr-flow.ts`

Once Redis is running, the complete WebSocket → ASR flow will work end-to-end! 🎉

