# 🐳 Installing Docker Desktop for Mac

## Step-by-Step Installation Guide

### Step 1: Download Docker Desktop

**For Apple Silicon (M1/M2/M3) Macs:**
- Download: https://desktop.docker.com/mac/main/arm64/Docker.dmg

**For Intel Macs:**
- Download: https://desktop.docker.com/mac/main/amd64/Docker.dmg

**Or visit the official page:**
- https://www.docker.com/products/docker-desktop/

### Step 2: Install Docker Desktop

1. **Open the downloaded `.dmg` file**
2. **Drag Docker.app to Applications folder**
3. **Open Docker Desktop from Applications**
   - You may need to allow it in System Settings → Privacy & Security
4. **Wait for Docker to start** (whale icon in menu bar)
   - First launch may take a few minutes

### Step 3: Verify Installation

Open a new terminal and run:

```bash
# Check Docker version
docker --version

# Check Docker is running
docker ps

# If you see an empty list (or no errors), Docker is working!
```

### Step 4: Start Redis

Once Docker is installed and running:

```bash
# Start Redis container
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Verify it's running
docker ps | grep redis

# Test Redis connection
docker exec redis redis-cli ping
# Should return: PONG
```

---

## 🚀 Quick Install Script

After downloading Docker Desktop, you can verify and start Redis with:

```bash
# Wait for Docker to start, then:
docker run -d -p 6379:6379 --name redis redis:7-alpine && \
docker ps | grep redis && \
echo "✅ Redis is running!" && \
docker exec redis redis-cli ping
```

---

## 🆘 Troubleshooting

### Docker Desktop Won't Start
- Make sure you have enough disk space (at least 4GB free)
- Check System Settings → Privacy & Security for any blocked permissions
- Restart your Mac if needed

### "Docker command not found"
- Make sure Docker Desktop is running (check menu bar for whale icon)
- Open a new terminal window after starting Docker Desktop
- Check: `which docker` should show `/usr/local/bin/docker` or similar

### Port 6379 Already in Use
```bash
# Check what's using the port
lsof -ti:6379

# If Redis container exists but stopped
docker start redis

# If you need to remove and recreate
docker rm -f redis
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

---

## ✅ Verification Checklist

After installation:

- [ ] Docker Desktop is installed in Applications
- [ ] Docker Desktop is running (whale icon in menu bar)
- [ ] `docker --version` works in terminal
- [ ] `docker ps` works without errors
- [ ] Redis container is running: `docker ps | grep redis`
- [ ] Redis responds: `docker exec redis redis-cli ping` → `PONG`

---

## 📝 Next Steps

Once Docker and Redis are running:

1. ✅ **Verify Redis**: `docker exec redis redis-cli ping`
2. ✅ **Start Next.js**: `npm run dev`
3. ✅ **Start Ingestion**: `cd services/ingest && npm run dev`
4. ✅ **Start ASR Worker**: `cd services/asr-worker && npm run dev`

---

## 🔗 Useful Links

- **Docker Desktop Download**: https://www.docker.com/products/docker-desktop/
- **Docker Documentation**: https://docs.docker.com/
- **Redis Docker Image**: https://hub.docker.com/_/redis

