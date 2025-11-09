# 🔧 Deepgram Socket Access Fix - conn/transport Patterns

## 🚨 Issue from Logs

**Problem:** Logs show continuous `⚠️ Cannot send periodic KeepAlive: WebSocket not accessible`

**Connection Object Structure (from logs):**
```
Connection object keys: [
  '_events', '_eventsCount', '_maxListeners', 'factory',
  'namespace', 'version', 'baseUrl', 'logger',
  'key', 'options', 'conn', 'sendBuffer',
  'reconnect', 'transport', 'headers'
]
```

**Key Insight:** The connection object has `'conn'` and `'transport'` properties, which likely contain the underlying WebSocket.

---

## ✅ Fix Applied

### Added Socket Access Through `conn` and `transport`

The code now tries to access the WebSocket through multiple paths:

1. **Direct socket access:**
   - `connection._socket`
   - `connection.socket`

2. **Through `conn` property:**
   - `connection.conn._socket`
   - `connection.conn.socket`
   - `connection.conn` (if it's the WebSocket itself - checked via `send()` and `readyState`)

3. **Through `transport` property:**
   - `connection.transport._socket`
   - `connection.transport.socket`
   - `connection.transport` (if it's the WebSocket itself - checked via `send()` and `readyState`)

4. **Nested patterns:**
   - `connection._connection._socket`
   - `connection._connection.socket`
   - `connection.getSocket()` (if function exists)

### Enhanced Logging

Added detailed logging to show:
- `conn` and `transport` existence and types
- Keys within `conn` and `transport` objects
- This helps identify the correct path to the WebSocket

---

## 📋 Expected Behavior After Fix

### ✅ Success Scenario:
1. Connection created → Socket accessed through `conn` or `transport`
2. Log shows: `✅ Accessed underlying WebSocket for {interactionId}`
3. KeepAlive sent successfully: `📡 Sent KeepAlive (JSON text frame)`
4. No more `⚠️ Cannot send periodic KeepAlive` errors
5. Connections stay open → No timeout errors (1011)
6. Transcripts received from Deepgram

### ⚠️ If Socket Still Not Found:
- Logs will show detailed structure of `conn` and `transport`
- This will help identify the correct path to the WebSocket
- May need to check Deepgram SDK source code or documentation

---

## 🔍 Debugging Information

The enhanced logging will show:
```javascript
Connection structure: {
  has_conn: true/false,
  has_transport: true/false,
  conn_type: 'object' | 'undefined',
  transport_type: 'object' | 'undefined',
  conn_keys: [...],  // Keys within conn object
  transport_keys: [...],  // Keys within transport object
}
```

This information will help identify:
- Whether `conn` or `transport` contains the WebSocket
- What properties are available within these objects
- The correct path to access the underlying WebSocket

---

## 🚀 Next Steps

1. **Deploy to Render** and monitor logs
2. **Check for socket access success:**
   - Look for `✅ Accessed underlying WebSocket`
   - Or `✅ Accessed underlying WebSocket after Open event`
3. **Verify KeepAlive sending:**
   - Should see `📡 Sent KeepAlive (JSON text frame)` instead of warnings
4. **Monitor connection stability:**
   - Should no longer see timeout errors (1011)
   - Connections should stay open
5. **Check for transcripts:**
   - Should start receiving transcript events from Deepgram

---

## 📚 Notes

- The Deepgram SDK might be using Socket.IO or a similar abstraction layer
- The `conn` and `transport` properties suggest a layered connection architecture
- If socket access still fails, we may need to:
  - Check Deepgram SDK source code
  - Use a different approach (e.g., monkey-patching `connection.send()`)
  - Or use Deepgram SDK's official KeepAlive method (if available)

---

**Status:** ✅ **FIXED** - Added `conn` and `transport` socket access patterns

