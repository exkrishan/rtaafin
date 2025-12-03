"use strict";
/**
 * Call Registry Service
 * Stores and manages active call metadata for auto-discovery and routing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCallRegistry = getCallRegistry;
// Dynamic import for optional ioredis dependency
let ioredis = null;
try {
    ioredis = require('ioredis');
}
catch (e) {
    // ioredis is optional
}
const CALL_METADATA_TTL_SECONDS = 3600; // 1 hour
const CALL_METADATA_KEY_PREFIX = 'call:metadata:';
class CallRegistry {
    constructor() {
        // Create dedicated Redis connection for key-value operations
        if (!ioredis) {
            console.warn('[CallRegistry] ioredis not available, call registry will not work');
            return;
        }
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        try {
            this.redis = new ioredis(redisUrl, {
                retryStrategy: (times) => {
                    if (times > 10)
                        return null;
                    return Math.min(times * 50, 2000);
                },
                maxRetriesPerRequest: null,
                enableReadyCheck: true,
                lazyConnect: false,
            });
            this.redis.on('error', (err) => {
                console.error('[CallRegistry] Redis error:', err);
            });
            this.redis.on('connect', () => {
                console.info('[CallRegistry] Connected to Redis for call registry');
            });
        }
        catch (error) {
            console.error('[CallRegistry] Failed to create Redis connection', {
                error: error.message,
            });
        }
    }
    /**
     * Register a new call
     */
    async registerCall(metadata) {
        if (!this.redis) {
            console.warn('[CallRegistry] Redis not available, skipping call registration');
            return;
        }
        try {
            const key = `${CALL_METADATA_KEY_PREFIX}${metadata.interactionId}`;
            await this.redis.setex(key, CALL_METADATA_TTL_SECONDS, JSON.stringify(metadata));
            console.info('[CallRegistry] ✅ Registered call', {
                interactionId: metadata.interactionId,
                callSid: metadata.callSid,
                from: metadata.from,
                to: metadata.to,
                tenantId: metadata.tenantId,
            });
        }
        catch (error) {
            console.error('[CallRegistry] Failed to register call', {
                error: error.message,
                interactionId: metadata.interactionId,
            });
        }
    }
    /**
     * Get call metadata by interaction ID
     */
    async getCallByInteractionId(interactionId) {
        if (!this.redis) {
            return null;
        }
        try {
            const key = `${CALL_METADATA_KEY_PREFIX}${interactionId}`;
            const data = await this.redis.get(key);
            if (!data) {
                return null;
            }
            return JSON.parse(data);
        }
        catch (error) {
            console.error('[CallRegistry] Failed to get call', {
                error: error.message,
                interactionId,
            });
            return null;
        }
    }
    /**
     * Update call status
     */
    async updateCallStatus(interactionId, status) {
        if (!this.redis) {
            return;
        }
        try {
            const metadata = await this.getCallByInteractionId(interactionId);
            if (metadata) {
                metadata.status = status;
                metadata.lastActivity = Date.now();
                await this.registerCall(metadata);
            }
        }
        catch (error) {
            console.error('[CallRegistry] Failed to update call status', {
                error: error.message,
                interactionId,
            });
        }
    }
    /**
     * Get all active calls
     */
    async getActiveCalls(limit = 10) {
        if (!this.redis) {
            return [];
        }
        try {
            const pattern = `${CALL_METADATA_KEY_PREFIX}*`;
            const keys = await this.redis.keys(pattern);
            const calls = [];
            for (const key of keys.slice(0, limit)) {
                try {
                    const data = await this.redis.get(key);
                    if (data) {
                        const metadata = JSON.parse(data);
                        if (metadata.status === 'active') {
                            calls.push(metadata);
                        }
                    }
                }
                catch (err) {
                    // Skip invalid entries
                    console.debug('[CallRegistry] Skipping invalid call metadata', { key });
                }
            }
            // Sort by last activity (most recent first)
            calls.sort((a, b) => b.lastActivity - a.lastActivity);
            return calls;
        }
        catch (error) {
            console.error('[CallRegistry] Failed to get active calls', {
                error: error.message,
            });
            return [];
        }
    }
    /**
     * Get calls by agent ID
     */
    async getCallsByAgentId(agentId) {
        if (!this.redis) {
            return [];
        }
        try {
            const allCalls = await this.getActiveCalls(100); // Get more to filter
            return allCalls.filter(call => call.agentId === agentId);
        }
        catch (error) {
            console.error('[CallRegistry] Failed to get calls by agent', {
                error: error.message,
                agentId,
            });
            return [];
        }
    }
    /**
     * Mark call as ended
     */
    async endCall(interactionId) {
        await this.updateCallStatus(interactionId, 'ended');
    }
}
// Singleton instance
let registryInstance = null;
function getCallRegistry() {
    if (!registryInstance) {
        registryInstance = new CallRegistry();
    }
    return registryInstance;
}
