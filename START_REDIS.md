# 🚀 Starting Redis

## Current Status

Docker is not available in the current shell environment. Here are your options to start Redis:

---

## Option 1: Use Docker (Recommended)

If Docker Desktop is installed on your Mac, start it and run:

```bash
# Start Redis container
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Verify it's running
docker ps | grep redis

# Test connection
docker exec redis redis-cli ping
# Should return: PONG
```

---

## Option 2: Install Redis via Homebrew

```bash
# Install Redis
brew install redis

# Start Redis as a service (runs in background)
brew services start redis

# OR start Redis manually (foreground)
redis-server

# Test connection
redis-cli ping
# Should return: PONG
```

---

## Option 3: Use Docker Compose

If you have `docker-compose` available:

```bash
# Start Redis using docker-compose
docker-compose -f docker-compose.pubsub.yml up -d redis

# Verify
docker-compose -f docker-compose.pubsub.yml ps
```

---

## Option 4: Check if Redis is Already Running

```bash
# Check if port 6379 is in use
lsof -ti:6379

# Test connection
redis-cli ping
# If it returns PONG, Redis is already running!
```

---

## ✅ Verification

Once Redis is started, verify it's working:

```bash
# Test connection
redis-cli ping
# Expected output: PONG

# Check Redis info
redis-cli info server | head -5
```

---

## 🎯 Quick Start (Choose One)

**If you have Docker Desktop:**
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**If you have Homebrew:**
```bash
brew install redis && brew services start redis
```

**If Redis is already installed:**
```bash
redis-server
```

---

## 📝 Next Steps

Once Redis is running:

1. ✅ Verify: `redis-cli ping` → Should return `PONG`
2. ✅ Start Next.js: `npm run dev`
3. ✅ Start Ingestion: `cd services/ingest && npm run dev`
4. ✅ Start ASR Worker: `cd services/asr-worker && npm run dev`

---

## 🆘 Troubleshooting

### Port 6379 Already in Use
```bash
# Find what's using the port
lsof -ti:6379

# Kill the process (if needed)
lsof -ti:6379 | xargs kill -9
```

### Docker Not Found
- Make sure Docker Desktop is installed and running
- Try opening a new terminal window
- Check: `which docker` or `docker --version`

### Redis Connection Refused
- Make sure Redis is actually running
- Check: `redis-cli ping`
- Verify port: `lsof -ti:6379`

