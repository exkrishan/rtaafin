# 🔌 WebSocket Testing Guide

**Service URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`

---

## ✅ Quick Health Check

First, verify the service is running:

```bash
curl https://rtaa-ingest.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ingest",
  "pubsub": true,
  "timestamp": "2025-11-07T..."
}
```

---

## 🧪 Method 1: Using `wscat` (Command Line)

### Install wscat
```bash
npm install -g wscat
```

### Test with JWT Token
```bash
# Generate a test JWT token first
node scripts/generate-test-jwt.js

# Then connect with the token
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Test Exotel Protocol (No JWT)
If `SUPPORT_EXOTEL=true` is set:
```bash
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

### Send Test Messages
Once connected, send a start event:
```json
{"event":"start","interaction_id":"test-123","tenant_id":"test-tenant","sample_rate":24000,"encoding":"pcm16"}
```

Expected response:
```json
{"event":"started","interaction_id":"test-123"}
```

---

## 🌐 Method 2: Browser Console (JavaScript)

Open browser console (F12) and run:

```javascript
// Connect to WebSocket
const ws = new WebSocket('wss://rtaa-ingest.onrender.com/v1/ingest', {
  headers: {
    'Authorization': 'Bearer <your-jwt-token>'
  }
});

// Note: Browser WebSocket API doesn't support custom headers directly
// For JWT auth, you may need to pass token in query string or use a proxy

// For Exotel (no auth), try:
const ws = new WebSocket('wss://rtaa-ingest.onrender.com/v1/ingest');

ws.onopen = () => {
  console.log('✅ WebSocket connected!');
  
  // Send start event
  ws.send(JSON.stringify({
    event: 'start',
    interaction_id: 'test-123',
    tenant_id: 'test-tenant',
    sample_rate: 24000,
    encoding: 'pcm16'
  }));
};

ws.onmessage = (event) => {
  console.log('📨 Received:', event.data);
};

ws.onerror = (error) => {
  console.error('❌ WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('🔌 WebSocket closed:', event.code, event.reason);
};
```

---

## 📝 Method 3: Node.js Test Script

Create a test script:

```javascript
// test-websocket.js
const WebSocket = require('ws');

const ws = new WebSocket('wss://rtaa-ingest.onrender.com/v1/ingest', {
  headers: {
    'Authorization': 'Bearer <your-jwt-token>'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket connected!');
  
  // Send start event
  ws.send(JSON.stringify({
    event: 'start',
    interaction_id: 'test-123',
    tenant_id: 'test-tenant',
    sample_rate: 24000,
    encoding: 'pcm16'
  }));
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', code, reason.toString());
});
```

Run:
```bash
node test-websocket.js
```

---

## 🔍 Method 4: Check Render Logs

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your `rtaa-ingest` service
3. Click on **"Logs"** tab
4. Look for:
   - `✅ Ingestion server listening on port 10000`
   - `WebSocket endpoint: ws://localhost:10000/v1/ingest`
   - Connection messages when clients connect

---

## 🧪 Method 5: Using Online WebSocket Testers

Use online tools like:
- **WebSocket King**: https://websocketking.com/
- **WebSocket.org Echo Test**: https://www.websocket.org/echo.html

**Note:** These may not support custom headers (JWT), so use for basic connectivity tests only.

---

## 📊 Expected Behavior

### Successful Connection
1. ✅ WebSocket connects without errors
2. ✅ Receives `{"event":"started","interaction_id":"..."}` after sending start event
3. ✅ Can send audio frames (binary or JSON for Exotel)
4. ✅ Receives ACK messages periodically

### Connection Issues
- **401 Unauthorized**: JWT token missing or invalid
- **Connection Refused**: Service not running or wrong URL
- **Timeout**: Service not responding (check Render logs)

---

## 🔐 Testing Authentication

### Test JWT Authentication
```bash
# Without token (should fail)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest

# With invalid token (should fail)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer invalid-token"

# With valid token (should succeed)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer <valid-jwt-token>"
```

### Test Exotel Protocol
If `SUPPORT_EXOTEL=true`:
```bash
# Should connect without JWT
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

---

## 🐛 Troubleshooting

### Issue: Connection Refused
**Check:**
- Service is running (check Render dashboard)
- Health endpoint responds: `curl https://rtaa-ingest.onrender.com/health`
- Correct URL: `wss://rtaa-ingest.onrender.com/v1/ingest`

### Issue: 401 Unauthorized
**Check:**
- JWT token is valid and not expired
- Token includes required claims: `tenant_id`, `interaction_id`
- `SUPPORT_EXOTEL=true` if testing Exotel protocol

### Issue: No Response After Start Event
**Check:**
- Render logs for errors
- Redis connection (check `pubsub: true` in health response)
- Message format matches expected schema

---

## 📋 Quick Test Checklist

- [ ] Health endpoint returns 200 OK
- [ ] WebSocket connects successfully
- [ ] Start event is accepted
- [ ] Receives `started` response
- [ ] Can send audio frames
- [ ] Receives ACK messages
- [ ] Render logs show connection activity

---

**Ready to test!** 🚀


**Service URL:** `wss://rtaa-ingest.onrender.com/v1/ingest`

---

## ✅ Quick Health Check

First, verify the service is running:

```bash
curl https://rtaa-ingest.onrender.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "ingest",
  "pubsub": true,
  "timestamp": "2025-11-07T..."
}
```

---

## 🧪 Method 1: Using `wscat` (Command Line)

### Install wscat
```bash
npm install -g wscat
```

### Test with JWT Token
```bash
# Generate a test JWT token first
node scripts/generate-test-jwt.js

# Then connect with the token
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer <your-jwt-token>"
```

### Test Exotel Protocol (No JWT)
If `SUPPORT_EXOTEL=true` is set:
```bash
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

### Send Test Messages
Once connected, send a start event:
```json
{"event":"start","interaction_id":"test-123","tenant_id":"test-tenant","sample_rate":24000,"encoding":"pcm16"}
```

Expected response:
```json
{"event":"started","interaction_id":"test-123"}
```

---

## 🌐 Method 2: Browser Console (JavaScript)

Open browser console (F12) and run:

```javascript
// Connect to WebSocket
const ws = new WebSocket('wss://rtaa-ingest.onrender.com/v1/ingest', {
  headers: {
    'Authorization': 'Bearer <your-jwt-token>'
  }
});

// Note: Browser WebSocket API doesn't support custom headers directly
// For JWT auth, you may need to pass token in query string or use a proxy

// For Exotel (no auth), try:
const ws = new WebSocket('wss://rtaa-ingest.onrender.com/v1/ingest');

ws.onopen = () => {
  console.log('✅ WebSocket connected!');
  
  // Send start event
  ws.send(JSON.stringify({
    event: 'start',
    interaction_id: 'test-123',
    tenant_id: 'test-tenant',
    sample_rate: 24000,
    encoding: 'pcm16'
  }));
};

ws.onmessage = (event) => {
  console.log('📨 Received:', event.data);
};

ws.onerror = (error) => {
  console.error('❌ WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('🔌 WebSocket closed:', event.code, event.reason);
};
```

---

## 📝 Method 3: Node.js Test Script

Create a test script:

```javascript
// test-websocket.js
const WebSocket = require('ws');

const ws = new WebSocket('wss://rtaa-ingest.onrender.com/v1/ingest', {
  headers: {
    'Authorization': 'Bearer <your-jwt-token>'
  }
});

ws.on('open', () => {
  console.log('✅ WebSocket connected!');
  
  // Send start event
  ws.send(JSON.stringify({
    event: 'start',
    interaction_id: 'test-123',
    tenant_id: 'test-tenant',
    sample_rate: 24000,
    encoding: 'pcm16'
  }));
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('🔌 WebSocket closed:', code, reason.toString());
});
```

Run:
```bash
node test-websocket.js
```

---

## 🔍 Method 4: Check Render Logs

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your `rtaa-ingest` service
3. Click on **"Logs"** tab
4. Look for:
   - `✅ Ingestion server listening on port 10000`
   - `WebSocket endpoint: ws://localhost:10000/v1/ingest`
   - Connection messages when clients connect

---

## 🧪 Method 5: Using Online WebSocket Testers

Use online tools like:
- **WebSocket King**: https://websocketking.com/
- **WebSocket.org Echo Test**: https://www.websocket.org/echo.html

**Note:** These may not support custom headers (JWT), so use for basic connectivity tests only.

---

## 📊 Expected Behavior

### Successful Connection
1. ✅ WebSocket connects without errors
2. ✅ Receives `{"event":"started","interaction_id":"..."}` after sending start event
3. ✅ Can send audio frames (binary or JSON for Exotel)
4. ✅ Receives ACK messages periodically

### Connection Issues
- **401 Unauthorized**: JWT token missing or invalid
- **Connection Refused**: Service not running or wrong URL
- **Timeout**: Service not responding (check Render logs)

---

## 🔐 Testing Authentication

### Test JWT Authentication
```bash
# Without token (should fail)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest

# With invalid token (should fail)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer invalid-token"

# With valid token (should succeed)
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest \
  -H "Authorization: Bearer <valid-jwt-token>"
```

### Test Exotel Protocol
If `SUPPORT_EXOTEL=true`:
```bash
# Should connect without JWT
wscat -c wss://rtaa-ingest.onrender.com/v1/ingest
```

---

## 🐛 Troubleshooting

### Issue: Connection Refused
**Check:**
- Service is running (check Render dashboard)
- Health endpoint responds: `curl https://rtaa-ingest.onrender.com/health`
- Correct URL: `wss://rtaa-ingest.onrender.com/v1/ingest`

### Issue: 401 Unauthorized
**Check:**
- JWT token is valid and not expired
- Token includes required claims: `tenant_id`, `interaction_id`
- `SUPPORT_EXOTEL=true` if testing Exotel protocol

### Issue: No Response After Start Event
**Check:**
- Render logs for errors
- Redis connection (check `pubsub: true` in health response)
- Message format matches expected schema

---

## 📋 Quick Test Checklist

- [ ] Health endpoint returns 200 OK
- [ ] WebSocket connects successfully
- [ ] Start event is accepted
- [ ] Receives `started` response
- [ ] Can send audio frames
- [ ] Receives ACK messages
- [ ] Render logs show connection activity

---

**Ready to test!** 🚀

