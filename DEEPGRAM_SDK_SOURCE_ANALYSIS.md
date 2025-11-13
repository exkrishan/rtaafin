# Deepgram SDK Source Code Analysis

## Overview

After reviewing the official Deepgram JavaScript SDK source code ([deepgram-js-sdk](https://github.com/deepgram/deepgram-js-sdk)), we've confirmed our recommendations and discovered additional insights.

## Key Findings from SDK Source

### 1. `getReadyState()` Method Exists and is Recommended

**Location:** `src/packages/AbstractLiveClient.ts:232-234`

```typescript
public getReadyState(): SOCKET_STATES {
  return this.conn?.readyState ?? SOCKET_STATES.closed;
}
```

**Key Points:**
- ✅ Method exists and is public
- ✅ Returns `SOCKET_STATES` enum values: `0=connecting, 1=open, 2=closing, 3=closed`
- ✅ Safely handles null/undefined connection
- ✅ This is the **official way** to check connection state

**Our Current Implementation:**
- ❌ Manual `socket.readyState` checks via complex recursive search
- ❌ 200+ lines of socket access code
- ❌ May not work reliably across SDK versions

**Recommendation:** Use `connection.getReadyState()` instead of manual socket checks.

---

### 2. `keepAlive()` Method Exists and is Simple

**Location:** `src/packages/ListenLiveClient.ts:112-118`

```typescript
public keepAlive(): void {
  this.send(
    JSON.stringify({
      type: "KeepAlive",
    })
  );
}
```

**Key Points:**
- ✅ Method exists and is public
- ✅ Uses SDK's `send()` method (which handles connection state)
- ✅ Automatically buffers if not connected
- ✅ This is the **official way** to send KeepAlive

**Our Current Implementation:**
- ❌ Manual JSON stringify: `JSON.stringify({ type: 'KeepAlive' })`
- ❌ Multiple fallback methods (socket.send, sendText, connection.send)
- ❌ Complex success/failure tracking
- ❌ May not work correctly

**Recommendation:** Use `connection.keepAlive()` instead of manual implementation.

---

### 3. SDK's `send()` Method Already Handles Buffering

**Location:** `src/packages/AbstractLiveClient.ts:250-278`

```typescript
send(data: SocketDataLike): void {
  const callback = async () => {
    // ... validation logic
    this.conn?.send(data);
  };

  if (this.isConnected()) {
    callback();
  } else {
    this.sendBuffer.push(callback);
  }
}
```

**Key Points:**
- ✅ SDK's `send()` method checks `isConnected()` before sending
- ✅ If not connected, it buffers the data in `sendBuffer`
- ✅ Uses `isConnected()` which checks `connectionState() === CONNECTION_STATE.Open`
- ✅ This means we don't need to manually check readyState before calling `send()`

**Our Current Implementation:**
- ❌ Manual readyState checks before sending
- ❌ Manual queue management
- ❌ Complex logic to wait for OPEN state

**Recommendation:** Trust SDK's `send()` method - it handles buffering automatically. We can call `connection.send()` directly without manual state checks.

---

### 4. `isConnected()` Helper Method

**Location:** `src/packages/AbstractLiveClient.ts:239-241`

```typescript
public isConnected(): boolean {
  return this.connectionState() === CONNECTION_STATE.Open;
}
```

**Key Points:**
- ✅ Convenient helper method
- ✅ Returns boolean (easier than checking `getReadyState() === 1`)
- ✅ Can be used for conditional logic

**Recommendation:** Can use `connection.isConnected()` for boolean checks, or `connection.getReadyState() === 1` for explicit state checks.

---

### 5. Connection State Management

**Location:** `src/packages/AbstractLiveClient.ts:214-225`

```typescript
public connectionState(): CONNECTION_STATE {
  switch (this.conn && this.conn.readyState) {
    case SOCKET_STATES.connecting:
      return CONNECTION_STATE.Connecting;
    case SOCKET_STATES.open:
      return CONNECTION_STATE.Open;
    case SOCKET_STATES.closing:
      return CONNECTION_STATE.Closing;
    default:
      return CONNECTION_STATE.Closed;
  }
}
```

**Key Points:**
- ✅ SDK provides high-level connection state enum
- ✅ Maps WebSocket readyState to connection state
- ✅ More readable than numeric constants

**Constants:**
```typescript
export enum SOCKET_STATES {
  connecting = 0,
  open = 1,
  closing = 2,
  closed = 3,
}

export enum CONNECTION_STATE {
  Connecting = "connecting",
  Open = "open",
  Closing = "closing",
  Closed = "closed",
}
```

---

### 6. SDK Handles Connection Setup Internally

**Location:** `src/packages/AbstractLiveClient.ts:107-182`

**Key Points:**
- ✅ SDK manages WebSocket connection lifecycle
- ✅ Handles different environments (browser, Node.js, Bun)
- ✅ Sets up event handlers internally
- ✅ We don't need to access underlying socket directly

**Our Current Implementation:**
- ❌ Complex recursive search for underlying WebSocket
- ❌ Manual socket access for KeepAlive
- ❌ May break with SDK updates

**Recommendation:** Don't access underlying socket - use SDK methods instead.

---

## Updated Recommendations

### High Priority

1. **Use `connection.getReadyState()` Instead of Manual Socket Checks**
   ```typescript
   // BEFORE:
   if (state.socket && state.socket.readyState === 1) { ... }
   
   // AFTER:
   if (state.connection.getReadyState() === 1) { ... }
   // OR:
   if (state.connection.isConnected()) { ... }
   ```

2. **Use `connection.keepAlive()` Instead of Manual KeepAlive**
   ```typescript
   // BEFORE:
   const keepAliveMsg = JSON.stringify({ type: 'KeepAlive' });
   state.socket.send(keepAliveMsg);
   
   // AFTER:
   state.connection.keepAlive();
   ```

3. **Trust SDK's `send()` Method - Remove Manual State Checks**
   ```typescript
   // BEFORE:
   if (state.socket.readyState === 1) {
     state.connection.send(audioData);
   } else {
     // Queue audio...
   }
   
   // AFTER:
   // SDK handles buffering automatically!
   state.connection.send(audioData);
   ```

### Medium Priority

4. **Remove All Socket Access Code**
   - Remove 200+ lines of recursive socket search
   - Remove manual socket.readyState checks
   - Use SDK methods exclusively

5. **Simplify Connection State Tracking**
   - Use `connection.isConnected()` for boolean checks
   - Use `connection.getReadyState()` for state checks
   - Remove custom `isReady` flag (use SDK's state instead)

---

## Code Examples from SDK

### Example 1: Starter Implementation (Simple)
```javascript
if (deepgram.getReadyState() === 1) {
  deepgram.send(message);
} else if (deepgram.getReadyState() >= 2) {
  deepgram.finish();
  deepgram.removeAllListeners();
  deepgram = setupDeepgram(ws);
}
```

### Example 2: SDK's send() Method (Automatic Buffering)
```typescript
// From AbstractLiveClient.ts
send(data: SocketDataLike): void {
  if (this.isConnected()) {
    // Send immediately
    this.conn?.send(data);
  } else {
    // Buffer automatically
    this.sendBuffer.push(callback);
  }
}
```

### Example 3: KeepAlive Implementation (Simple)
```typescript
// From ListenLiveClient.ts
public keepAlive(): void {
  this.send(JSON.stringify({ type: "KeepAlive" }));
}
```

---

## What This Means for Our Implementation

1. **We can simplify significantly:**
   - Remove 200+ lines of socket access code
   - Remove manual readyState checks
   - Remove manual KeepAlive implementation
   - Trust SDK's built-in buffering

2. **We should keep:**
   - Audio buffering logic (for Exotel's small chunks)
   - Connection reuse (beneficial for one-call-per-connection)
   - Sample rate validation (critical for Exotel 8000 Hz)

3. **We should change:**
   - Use `connection.getReadyState()` or `connection.isConnected()`
   - Use `connection.keepAlive()`
   - Call `connection.send()` directly (SDK handles buffering)
   - Remove all manual socket access

---

## Conclusion

The SDK source code confirms our recommendations:
- ✅ `getReadyState()` exists and is the official way
- ✅ `keepAlive()` exists and is the official way
- ✅ `send()` already handles buffering automatically
- ✅ We don't need to access underlying socket

**Key Takeaway:** The SDK is designed to be used through its public API methods, not by accessing internal WebSocket directly. Our complex socket access code is unnecessary and may be causing issues.

