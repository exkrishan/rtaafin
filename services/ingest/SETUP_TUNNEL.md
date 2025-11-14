# 🌐 Setting Up Tunnel for Exotel (Local Development)

## The Problem

Exotel **cannot** access `localhost` on your computer. You need to expose your local service to the internet using a tunnel.

## Solution: Use ngrok (Easiest)

### Step 1: Install ngrok

**macOS:**
```bash
# Using Homebrew
brew install ngrok

# OR download from: https://ngrok.com/download
```

**Or use npx (no installation needed):**
```bash
npx ngrok http 8443
```

### Step 2: Start ngrok

In a **new terminal window**, run:

```bash
ngrok http 8443
```

You'll see output like:
```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:8443
```

### Step 3: Copy the HTTPS URL

Copy the **HTTPS URL** (starts with `https://`), for example:
```
https://abc123.ngrok-free.app
```

### Step 4: Use in Exotel

In Exotel Dashboard, use:
```
wss://abc123.ngrok-free.app/v1/ingest
```

**Important:**
- Use `wss://` (secure WebSocket) not `ws://`
- Add `/v1/ingest` at the end
- Replace `abc123.ngrok-free.app` with YOUR ngrok URL

---

## Alternative: Cloudflare Tunnel (Free)

### Step 1: Install Cloudflare Tunnel

```bash
brew install cloudflared
```

### Step 2: Start Tunnel

```bash
cloudflared tunnel --url http://localhost:8443
```

### Step 3: Copy the URL

You'll get a URL like:
```
https://abc123.trycloudflare.com
```

### Step 4: Use in Exotel

```
wss://abc123.trycloudflare.com/v1/ingest
```

---

## Alternative: localtunnel (No Installation)

### Step 1: Run localtunnel

```bash
npx localtunnel --port 8443
```

### Step 2: Copy the URL

You'll get a URL like:
```
https://abc123.loca.lt
```

### Step 3: Use in Exotel

```
wss://abc123.loca.lt/v1/ingest
```

---

## Complete Setup Example

### Terminal 1: Start Ingest Service
```bash
cd services/ingest
./START_WITH_AUDIO_DUMP.sh
```

### Terminal 2: Start ngrok
```bash
ngrok http 8443
```

### Terminal 3: Configure Exotel
- Go to Exotel Dashboard
- Set WebSocket URL: `wss://YOUR-NGROK-URL.ngrok-free.app/v1/ingest`
- Save configuration

### Terminal 4: Monitor
```bash
cd services/ingest
watch -n 1 './CHECK_AUDIO_DUMPS.sh'
```

---

## Important Notes

1. **Keep ngrok running** - If you close ngrok, Exotel will lose connection
2. **URL changes** - Free ngrok URLs change each time you restart (unless you have a paid account)
3. **Use HTTPS/WSS** - Always use `wss://` (secure) not `ws://` (insecure)
4. **Add /v1/ingest** - Don't forget the path at the end

---

## Troubleshooting

### Exotel can't connect
- Check ngrok is still running
- Verify URL is correct (with `wss://` and `/v1/ingest`)
- Check service is running on port 8443

### Connection drops
- ngrok free tier has connection limits
- Consider using paid ngrok or Cloudflare Tunnel

### URL not working
- Make sure you're using the HTTPS URL (not HTTP)
- Make sure you added `/v1/ingest` at the end
- Check service logs for connection attempts

