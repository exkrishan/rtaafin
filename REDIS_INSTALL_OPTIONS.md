# 🔧 Redis Installation Options (Without Docker Desktop)

## Option 1: Homebrew (macOS - Recommended)

**Best for:** macOS users with Homebrew installed

```bash
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Redis
brew install redis

# Start Redis (runs in background)
brew services start redis

# Or run in foreground
redis-server

# Verify
redis-cli ping
# Should return: PONG
```

**Pros:**
- Easy to install and manage
- Automatic updates
- Runs as a service

**Cons:**
- Requires Homebrew

---

## Option 2: Download and Build from Source

**Best for:** Any system, no package manager needed

```bash
# Download Redis
cd ~/Downloads
wget https://download.redis.io/redis-stable.tar.gz
# OR
curl -O https://download.redis.io/redis-stable.tar.gz

# Extract
tar xzf redis-stable.tar.gz
cd redis-stable

# Build (requires make and gcc)
make

# Test build
make test

# Install (optional - copies to /usr/local/bin)
sudo make install

# Run Redis
./src/redis-server

# In another terminal, test
./src/redis-cli ping
```

**Pros:**
- No package manager needed
- Works on any Unix-like system
- Full control

**Cons:**
- Requires build tools (make, gcc)
- Manual updates

---

## Option 3: Pre-built Binary (macOS)

**Best for:** macOS without Homebrew

```bash
# Download pre-built binary for macOS
cd ~/Downloads
curl -O https://download.redis.io/releases/redis-7.2.3.tar.gz
tar xzf redis-7.2.3.tar.gz
cd redis-7.2.3

# Run directly (no build needed if binary available)
# Or build if needed
make

# Run
./src/redis-server
```

---

## Option 4: Use Docker CLI (Without Docker Desktop)

**Best for:** If you have Docker CLI but not Docker Desktop

```bash
# Install Docker CLI only (no GUI)
# macOS: via Homebrew
brew install docker

# Or download Docker CLI binary
# https://docs.docker.com/engine/install/binaries/

# Run Redis container
docker run -d -p 6379:6379 --name redis-rtaa redis:7-alpine

# Verify
docker exec redis-rtaa redis-cli ping
```

**Note:** This still requires Docker runtime, just not the Desktop GUI.

---

## Option 5: Use Podman (Docker Alternative)

**Best for:** Docker alternative, no Docker Desktop needed

```bash
# Install Podman (macOS)
brew install podman

# Initialize Podman
podman machine init
podman machine start

# Run Redis
podman run -d -p 6379:6379 --name redis-rtaa redis:7-alpine

# Verify
podman exec redis-rtaa redis-cli ping
```

**Pros:**
- Docker-compatible commands
- No Docker Desktop needed
- Rootless containers

---

## Option 6: Use Colima (Lightweight Docker Alternative)

**Best for:** Lightweight Docker runtime without Desktop

```bash
# Install Colima
brew install colima docker

# Start Colima
colima start

# Use Docker commands (they work with Colima)
docker run -d -p 6379:6379 --name redis-rtaa redis:7-alpine

# Verify
docker exec redis-rtaa redis-cli ping
```

**Pros:**
- Lightweight
- Docker-compatible
- No Desktop GUI

---

## Option 7: Use Existing Redis Server (Remote)

**Best for:** If you have access to a remote Redis server

```bash
# Update .env.local
REDIS_URL=redis://your-redis-server:6379
# Or with password
REDIS_URL=redis://:password@your-redis-server:6379
```

**Pros:**
- No local installation
- Use existing infrastructure

**Cons:**
- Requires network access
- May have latency

---

## Option 8: Use Redis Cloud (Free Tier)

**Best for:** Cloud-hosted Redis, no local installation

1. Sign up at https://redis.com/try-free/
2. Create a free database
3. Get connection URL
4. Update `.env.local`:

```bash
REDIS_URL=redis://default:password@redis-xxxxx.cloud.redislabs.com:xxxxx
```

**Pros:**
- No local installation
- Free tier available
- Managed service

**Cons:**
- Requires internet
- Free tier has limits

---

## Quick Comparison

| Method | Difficulty | Requires | Best For |
|--------|-----------|----------|----------|
| Homebrew | ⭐ Easy | Homebrew | macOS users |
| Build from Source | ⭐⭐ Medium | make, gcc | Any system |
| Docker CLI | ⭐⭐ Medium | Docker runtime | Docker users |
| Podman | ⭐⭐ Medium | Podman | Docker alternative |
| Colima | ⭐⭐ Medium | Colima | Lightweight Docker |
| Remote Redis | ⭐ Easy | Network access | Existing infrastructure |
| Redis Cloud | ⭐ Easy | Internet | Cloud-hosted |

---

## Recommended: Homebrew (macOS)

If you're on macOS, Homebrew is the easiest:

```bash
# One command install
brew install redis

# Start it
brew services start redis

# Done! Redis is running on localhost:6379
```

---

## Verify Installation

After installing, verify Redis is working:

```bash
# Test connection
redis-cli ping
# Should return: PONG

# Check if running
redis-cli info server | grep redis_version

# Or check port
lsof -i :6379
```

---

## Update .env.local

Once Redis is installed and running:

```bash
PUBSUB_ADAPTER=redis_streams
REDIS_URL=redis://localhost:6379
```

Then restart services:

```bash
./stop-all-services.sh
./start-all-services.sh
```

---

## Troubleshooting

### Redis not starting

```bash
# Check if port 6379 is in use
lsof -i :6379

# Kill existing Redis
pkill redis-server

# Start fresh
redis-server
```

### Connection refused

```bash
# Check Redis is running
redis-cli ping

# Check Redis is listening
netstat -an | grep 6379
```

### Permission denied

```bash
# Run with sudo if needed
sudo redis-server

# Or fix permissions
sudo chown -R $(whoami) /usr/local/var/db/redis
```

---

## Which Should You Choose?

- **macOS with Homebrew**: Use Option 1 (Homebrew) - easiest
- **macOS without Homebrew**: Use Option 2 (Build from source) or Option 3 (Pre-built)
- **Want Docker alternative**: Use Option 5 (Podman) or Option 6 (Colima)
- **Have remote Redis**: Use Option 7 (Remote server)
- **Want cloud-hosted**: Use Option 8 (Redis Cloud)

---

## Need Help?

If you're unsure which option to use, tell me:
1. Your operating system (macOS version?)
2. Do you have Homebrew installed?
3. Do you have Docker CLI (without Desktop)?
4. Do you have access to a remote Redis server?

I can guide you through the best option for your setup!

