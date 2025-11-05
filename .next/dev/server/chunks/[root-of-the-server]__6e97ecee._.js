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
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/http [external] (http, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("http", () => require("http"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[externals]/punycode [external] (punycode, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("punycode", () => require("punycode"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/zlib [external] (zlib, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("zlib", () => require("zlib"));

module.exports = mod;
}),
"[project]/lib/supabase.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "supabase",
    ()=>supabase
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/@supabase/supabase-js/dist/module/index.js [app-route] (ecmascript) <locals>");
;
const supabaseUrl = ("TURBOPACK compile-time value", "https://djuxbmchatnamqbkfjyi.supabase.co");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
if (!supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in environment');
}
// Custom fetch with better error handling for Node.js and corporate proxies
const customFetch = async (input, init)=>{
    try {
        // For development: bypass SSL verification for corporate proxies
        // In Node.js 20+, we need to handle self-signed certificates
        const https = await __turbopack_context__.A("[externals]/https [external] (https, cjs, async loader)");
        const agent = new https.Agent({
            rejectUnauthorized: false
        });
        const response = await fetch(input, {
            ...init,
            // @ts-ignore - agent is valid for Node.js fetch
            agent,
            // @ts-ignore - keepalive may not be in types but is valid
            keepalive: false
        });
        return response;
    } catch (error) {
        console.error('Supabase fetch error:', error);
        throw error;
    }
};
const supabase = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$supabase$2f$supabase$2d$js$2f$dist$2f$module$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["createClient"])(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        persistSession: false
    },
    global: {
        headers: {
            'x-rt-agent-assist': 'rtaa-demo'
        },
        fetch: customFetch
    }
});
}),
"[project]/lib/intent.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Intent Detection Library
 * Uses OpenAI API to detect customer intent from transcript chunks
 */ __turbopack_context__.s([
    "detectIntent",
    ()=>detectIntent,
    "normalizeIntent",
    ()=>normalizeIntent
]);
async function detectIntent(text, context) {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
        console.warn('[intent] LLM_API_KEY not configured, returning unknown intent');
        return {
            intent: 'unknown',
            confidence: 0
        };
    }
    try {
        // Build context window
        const contextText = context && context.length > 0 ? `Previous context:\n${context.join('\n')}\n\nCurrent:` : 'Current:';
        const prompt = `You are an intent classifier for customer support calls. Given the transcript snippet below, output a concise 3-5 word intent label and a confidence score (0-1).

${contextText}
"${text}"

Respond ONLY with valid JSON in this exact format:
{"intent": "intent_label", "confidence": 0.0}

Common intents: reset_password, update_billing, plan_upgrade, account_inquiry, technical_support, cancel_service, payment_issue`;
        console.info('[intent] Calling OpenAI API for intent detection');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a customer support intent classifier. Always respond with valid JSON containing "intent" and "confidence" fields.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 100
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[intent] OpenAI API error:', response.status, errorText);
            return {
                intent: 'unknown',
                confidence: 0
            };
        }
        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        if (!content) {
            console.error('[intent] No content in OpenAI response');
            return {
                intent: 'unknown',
                confidence: 0
            };
        }
        // Parse JSON response
        const result = JSON.parse(content.trim());
        // Normalize intent
        const normalizedIntent = normalizeIntent(result.intent);
        const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
        console.info('[intent] Detected intent:', {
            intent: normalizedIntent,
            confidence
        });
        return {
            intent: normalizedIntent,
            confidence
        };
    } catch (error) {
        console.error('[intent] Error detecting intent:', error.message);
        return {
            intent: 'unknown',
            confidence: 0
        };
    }
}
function normalizeIntent(str) {
    if (!str) return 'unknown';
    return str.toLowerCase().trim().replace(/[^\w\s-]/g, '') // Remove special chars except space and dash
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/-+/g, '_') // Replace dashes with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .substring(0, 50); // Limit length
}
}),
"[project]/app/api/calls/ingest-transcript/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Ingest Transcript API - Receives transcript chunks from the orchestrator.
 * Validates, logs, stores chunks, detects intent, and fetches KB articles.
 */ __turbopack_context__.s([
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/supabase.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$intent$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/intent.ts [app-route] (ecmascript)");
;
;
;
async function POST(req) {
    try {
        const body = await req.json();
        // Validate required fields
        if (!body.callId || body.seq === undefined || !body.ts || !body.text) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                ok: false,
                error: 'Missing required fields: callId, seq, ts, text'
            }, {
                status: 400
            });
        }
        console.info('[ingest-transcript] Received chunk', {
            callId: body.callId,
            seq: body.seq,
            ts: body.ts,
            textLength: body.text.length
        });
        // Insert into Supabase ingest_events table
        try {
            const { data, error } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["supabase"].from('ingest_events').insert({
                call_id: body.callId,
                seq: body.seq,
                ts: body.ts,
                text: body.text,
                created_at: new Date().toISOString()
            }).select();
            if (error) {
                console.error('[ingest-transcript] Supabase insert error:', error);
                // Don't fail the request, just log it
                console.warn('[ingest-transcript] Continuing despite Supabase error');
            } else {
                console.info('[ingest-transcript] Stored in Supabase:', data);
            }
        } catch (supabaseErr) {
            console.error('[ingest-transcript] Supabase error:', supabaseErr);
        // Continue processing even if Supabase fails
        }
        // Phase 2: Intent detection and KB article recommendations
        let intent = 'unknown';
        let confidence = 0.0;
        let articles = [];
        try {
            // Detect intent from the transcript text
            console.info('[ingest-transcript] Detecting intent for seq:', body.seq);
            const intentResult = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$intent$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["detectIntent"])(body.text);
            intent = intentResult.intent;
            confidence = intentResult.confidence;
            console.info('[ingest-transcript] Intent detected:', {
                intent,
                confidence
            });
            // Store intent in database
            try {
                const { error: intentError } = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$supabase$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["supabase"].from('intents').insert({
                    call_id: body.callId,
                    seq: body.seq,
                    intent,
                    confidence,
                    created_at: new Date().toISOString()
                });
                if (intentError) {
                    console.error('[ingest-transcript] Failed to store intent:', intentError);
                } else {
                    console.info('[ingest-transcript] Intent stored in database');
                }
            } catch (intentDbErr) {
                console.error('[ingest-transcript] Intent DB error:', intentDbErr);
            }
            // Fetch relevant KB articles based on intent
            if (intent && intent !== 'unknown') {
                try {
                    console.info('[ingest-transcript] Fetching KB articles for intent:', intent);
                    const kbUrl = `http://localhost:3000/api/kb/search?query=${encodeURIComponent(intent)}`;
                    const kbResponse = await fetch(kbUrl);
                    if (kbResponse.ok) {
                        const kbData = await kbResponse.json();
                        if (kbData.ok && kbData.results) {
                            articles = kbData.results.slice(0, 3); // Top 3 articles
                            console.info('[ingest-transcript] Found KB articles:', articles.length);
                        }
                    } else {
                        console.warn('[ingest-transcript] KB search failed:', kbResponse.status);
                    }
                } catch (kbErr) {
                    console.error('[ingest-transcript] KB fetch error:', kbErr);
                // Continue without articles
                }
            }
        } catch (intentErr) {
            console.error('[ingest-transcript] Intent detection error:', intentErr);
            // Fallback to unknown intent
            intent = 'unknown';
            confidence = 0.0;
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: true,
            intent,
            confidence,
            articles
        });
    } catch (err) {
        console.error('[ingest-transcript] Error:', err);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            ok: false,
            error: err.message || String(err)
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__6e97ecee._.js.map