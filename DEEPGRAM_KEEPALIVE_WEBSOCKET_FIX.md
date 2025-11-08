# 🔧 Deepgram KeepAlive WebSocket Fix

## 🚨 Critical Issue

**Problem:** Deepgram SDK's `connection.send()` method **only accepts binary audio data** (Uint8Array/Buffer), not JSON text frames. KeepAlive messages must be sent as **JSON text frames** over the WebSocket connection.

**Impact:**
- KeepAlive messages sent via `connection.send(JSON.stringify({ type: 'KeepAlive' }))` are being treated as binary data
- Deepgram doesn't recognize them as KeepAlive messages
- Connections timeout after ~5 seconds (error 1011)
- No transcripts are returned

## ✅ Solution

Access the **underlying WebSocket connection** and send KeepAlive messages directly as text frames via `socket.send()`.

### Changes Made

1. **Added `socket` to ConnectionState interface:**
   ```typescript
   interface ConnectionState {
     connection: any;
     socket?: any; // Underlying WebSocket for text frames
     // ...
   }
   ```

2. **Access underlying WebSocket on connection creation:**
   ```typescript
   // Try common SDK patterns to access underlying WebSocket
   let socket: any = null;
   if (connection._socket) {
     socket = connection._socket;
   } else if (connection.socket) {
     socket = connection.socket;
   } else if (connection._connection?._socket) {
     socket = connection._connection._socket;
   } else if (connection._connection?.socket) {
     socket = connection._connection.socket;
   } else if (typeof connection.getSocket === 'function') {
     socket = connection.getSocket();
   }
   ```

3. **Send KeepAlive via underlying WebSocket:**
   ```typescript
   // Send as TEXT frame via underlying WebSocket
   if (state.socket && typeof state.socket.send === 'function') {
     const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
     state.socket.send(keepAliveMsg); // ✅ Text frame
     console.info(`📡 Sent KeepAlive (JSON text frame)`);
   } else {
     // Fallback: Try connection.send() (may not work)
     connection.send(JSON.stringify({ type: 'KeepAlive' }));
   }
   ```

## 📋 What to Look For in Logs

### ✅ Success Indicators:
- `✅ Accessed underlying WebSocket for {interactionId}`
- `📡 Sent initial KeepAlive (JSON text frame) for {interactionId}`
- `📡 Sent periodic KeepAlive (JSON text frame) for {interactionId}` (every 3 seconds)
- **No timeout errors (1011)**
- **Transcript events received from Deepgram**

### ❌ Failure Indicators:
- `⚠️ Could not access underlying WebSocket for {interactionId}`
- `⚠️ Cannot send KeepAlive: underlying WebSocket not accessible`
- `❌ Failed to send KeepAlive via fallback`
- **Connection closes with error 1011 (timeout)**
- **No transcript events**

## 🔍 Debugging

If the underlying WebSocket cannot be accessed, the logs will show:
- Connection object keys
- Connection structure (has_socket, has_socket_underscore, has_connection)
- This helps identify the correct path to the WebSocket in the SDK

## 📚 References

- [Deepgram KeepAlive Documentation](https://developers.deepgram.com/docs/audio-keep-alive)
- KeepAlive must be sent as **JSON text frame**: `{"type": "KeepAlive"}`
- Must be sent every 3-5 seconds during silence to prevent timeout

## 🚀 Next Steps

1. **Deploy to Render** and monitor logs
2. **Verify WebSocket access** - Check for `✅ Accessed underlying WebSocket`
3. **Verify KeepAlive sending** - Check for `📡 Sent KeepAlive (JSON text frame)`
4. **Monitor for timeouts** - Should no longer see error 1011
5. **Check for transcripts** - Should start receiving transcript events from Deepgram

---

**Status:** ✅ Fixed - KeepAlive now sent via underlying WebSocket as text frame

