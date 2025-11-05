module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/lib/realtime.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Real-time event broadcasting module
 * Supports Server-Sent Events (SSE) for live transcript and intent updates
 *
 * In-memory pub/sub system with per-call subscriptions.
 */ __turbopack_context__.s([
    "broadcastEvent",
    ()=>broadcastEvent,
    "disconnectAllClients",
    ()=>disconnectAllClients,
    "getClientCount",
    ()=>getClientCount,
    "getClientsByCallId",
    ()=>getClientsByCallId,
    "openWebSocketServer",
    ()=>openWebSocketServer,
    "registerSseClient",
    ()=>registerSseClient
]);
// In-memory store of active SSE connections
const clients = new Map();
// Keep-alive interval (send comment every 30s to prevent timeout)
const HEARTBEAT_INTERVAL_MS = 30000;
let heartbeatTimer = null;
/**
 * Generate unique client ID
 */ function generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
function registerSseClient(req, res, callId = null) {
    const clientId = generateClientId();
    console.info('[realtime] New SSE client connected', {
        clientId,
        callId: callId || 'global',
        totalClients: clients.size + 1
    });
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    // CORS for dev (restrict in production)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Flush headers immediately
    if (res.flushHeaders) {
        res.flushHeaders();
    }
    // Send initial connection event
    sendEvent(res, {
        type: 'transcript_line',
        callId: callId || 'system',
        text: `Connected to realtime stream (clientId: ${clientId})`
    });
    // Store client
    clients.set(clientId, {
        id: clientId,
        callId,
        res,
        createdAt: new Date()
    });
    // Start heartbeat if not already running
    startHeartbeat();
    // Cleanup on disconnect
    req.on('close', ()=>{
        console.info('[realtime] SSE client disconnected', {
            clientId,
            callId: callId || 'global',
            duration: `${Date.now() - clients.get(clientId)?.createdAt.getTime() || 0}ms`
        });
        clients.delete(clientId);
        // Stop heartbeat if no clients left
        if (clients.size === 0) {
            stopHeartbeat();
        }
    });
    req.on('error', (err)=>{
        console.error('[realtime] SSE client error', {
            clientId,
            error: err.message
        });
        clients.delete(clientId);
    });
}
/**
 * Send a single event to a response stream
 */ function sendEvent(res, event) {
    try {
        // Format: event: <type>\ndata: <json>\n\n
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (err) {
        console.error('[realtime] Failed to send event', err);
    }
}
function broadcastEvent(event) {
    const targetCallId = event.callId;
    let sentCount = 0;
    for (const [clientId, client] of clients.entries()){
        // Send to global subscribers or matching callId subscribers
        if (client.callId === null || client.callId === targetCallId) {
            try {
                sendEvent(client.res, event);
                sentCount++;
            } catch (err) {
                console.error('[realtime] Failed to send to client', {
                    clientId,
                    error: err
                });
                // Remove failed client
                clients.delete(clientId);
            }
        }
    }
    console.info('[realtime] Broadcast event', {
        type: event.type,
        callId: targetCallId,
        seq: event.seq,
        recipients: sentCount,
        totalClients: clients.size
    });
}
/**
 * Start heartbeat to keep connections alive
 */ function startHeartbeat() {
    if (heartbeatTimer) return; // Already running
    heartbeatTimer = setInterval(()=>{
        const now = Date.now();
        for (const [clientId, client] of clients.entries()){
            try {
                // Send comment (ignored by EventSource but keeps connection alive)
                client.res.write(`: heartbeat ${now}\n\n`);
            } catch (err) {
                console.warn('[realtime] Heartbeat failed for client', {
                    clientId
                });
                clients.delete(clientId);
            }
        }
    }, HEARTBEAT_INTERVAL_MS);
    console.info('[realtime] Heartbeat started');
}
/**
 * Stop heartbeat timer
 */ function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        console.info('[realtime] Heartbeat stopped');
    }
}
function getClientCount() {
    return clients.size;
}
function getClientsByCallId(callId) {
    let count = 0;
    for (const client of clients.values()){
        if (client.callId === null || client.callId === callId) {
            count++;
        }
    }
    return count;
}
function disconnectAllClients() {
    console.info('[realtime] Disconnecting all clients', {
        count: clients.size
    });
    for (const [clientId, client] of clients.entries()){
        try {
            client.res.end();
        } catch (err) {
        // Ignore errors during shutdown
        }
    }
    clients.clear();
    stopHeartbeat();
}
function openWebSocketServer(server) {
    console.warn('[realtime] WebSocket support not implemented. Use SSE for now.');
// Future: Initialize ws.Server(server) and handle connections
}
}),
"[project]/app/api/events/stream/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * SSE Stream Endpoint
 * GET /api/events/stream?callId=...
 *
 * Real-time event stream for transcript lines and intent updates.
 * Clients connect via EventSource and receive live events as they occur.
 *
 * Note: Must use Node.js runtime (not Edge) for response streaming support.
 */ // Force Node runtime (Edge doesn't support streaming responses properly)
__turbopack_context__.s([
    "GET",
    ()=>GET,
    "OPTIONS",
    ()=>OPTIONS,
    "dynamic",
    ()=>dynamic,
    "runtime",
    ()=>runtime
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$realtime$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/realtime.ts [app-route] (ecmascript)");
const runtime = 'nodejs';
const dynamic = 'force-dynamic';
;
async function GET(req) {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId') || null;
    console.info('[sse-endpoint] New connection request', {
        callId: callId || 'global',
        userAgent: req.headers.get('user-agent')?.substring(0, 50)
    });
    // Create a TransformStream to handle SSE
    const stream = new ReadableStream({
        start (controller) {
            // Create a mock response object that writes to the controller
            const mockRes = {
                setHeader: ()=>{},
                flushHeaders: ()=>{},
                write: (chunk)=>{
                    try {
                        controller.enqueue(new TextEncoder().encode(chunk));
                    } catch (err) {
                        console.error('[sse-endpoint] Write error', err);
                    }
                },
                end: ()=>{
                    try {
                        controller.close();
                    } catch (err) {
                    // Already closed
                    }
                }
            };
            // Create a mock request for cleanup handling
            const mockReq = {
                on: (event, handler)=>{
                    if (event === 'close') {
                        // Store cleanup handler to call when stream is cancelled
                        return handler;
                    }
                }
            };
            // Register SSE client
            try {
                (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$realtime$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["registerSseClient"])(mockReq, mockRes, callId);
            } catch (err) {
                console.error('[sse-endpoint] Failed to register client', err);
                controller.error(err);
            }
        },
        cancel () {
            console.info('[sse-endpoint] Stream cancelled', {
                callId: callId || 'global'
            });
        }
    });
    // Return SSE response
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            // CORS for dev (restrict in production)
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}
async function OPTIONS() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__ccbc13d9._.js.map