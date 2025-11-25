/**
 * Call Registry Service
 * Stores and manages active call metadata for auto-discovery and routing
 */

// Dynamic import for optional ioredis dependency
let ioredis: any = null;
try {
  ioredis = require('ioredis');
} catch (e) {
  // ioredis is optional
}

export interface CallMetadata {
  interactionId: string;
  callSid: string;
  from: string; // Customer phone number
  to: string;   // Agent/IVR phone number
  agentId?: string;
  tenantId: string;
  startTime: number;
  status: 'active' | 'ended';
  lastActivity: number;
}

const CALL_METADATA_TTL_SECONDS = 3600; // 1 hour
const CALL_METADATA_KEY_PREFIX = 'call:metadata:';

class CallRegistry {
  private redis: any;
  private redisUrl: string = '';
  private connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';

  constructor() {
    // Create dedicated Redis connection for key-value operations
    if (!ioredis) {
      console.warn('[CallRegistry] ⚠️ ioredis not available, call registry will not work');
      this.connectionStatus = 'error';
      return;
    }

    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redis = new ioredis(this.redisUrl, {
        retryStrategy: (times: number) => {
          if (times > 10) {
            console.error('[CallRegistry] ❌ Max Redis retries reached, giving up');
            this.connectionStatus = 'error';
            return null;
          }
          const delay = Math.min(times * 50, 2000);
          console.warn(`[CallRegistry] ⚠️ Redis connection retry ${times}/10 in ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
        lazyConnect: false,
      });

      this.redis.on('error', (err: Error) => {
        console.error('[CallRegistry] ❌ Redis error:', {
          error: err.message,
          code: (err as any).code,
          redisUrl: this.redisUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
        });
        this.connectionStatus = 'error';
      });

      this.redis.on('connect', () => {
        console.info('[CallRegistry] ✅ Connected to Redis for call registry', {
          redisUrl: this.redisUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
        });
        this.connectionStatus = 'connected';
      });

      this.redis.on('close', () => {
        console.warn('[CallRegistry] ⚠️ Redis connection closed');
        this.connectionStatus = 'disconnected';
      });

      this.redis.on('ready', () => {
        console.info('[CallRegistry] ✅ Redis connection ready');
        this.connectionStatus = 'connected';
      });
    } catch (error: any) {
      console.error('[CallRegistry] ❌ Failed to create Redis connection', {
        error: error.message,
        redisUrl: this.redisUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
      });
      this.connectionStatus = 'error';
    }
  }

  /**
   * Check Redis connection health
   */
  async checkHealth(): Promise<{ accessible: boolean; error?: string; status?: string }> {
    if (!this.redis) {
      return { 
        accessible: false, 
        error: 'Redis client not initialized (ioredis not available)',
        status: this.connectionStatus,
      };
    }

    try {
      // Check connection status
      if (this.connectionStatus === 'error') {
        return { 
          accessible: false, 
          error: 'Redis connection in error state',
          status: this.connectionStatus,
        };
      }

      // Try a simple PING command
      const result = await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PING timeout')), 2000)
        ),
      ]);

      if (result === 'PONG') {
        return { accessible: true, status: 'connected' };
      }

      return { 
        accessible: false, 
        error: 'PING did not return PONG',
        status: this.connectionStatus,
      };
    } catch (error: any) {
      return { 
        accessible: false, 
        error: error.message || String(error),
        status: this.connectionStatus,
      };
    }
  }

  /**
   * Register a new call
   */
  async registerCall(metadata: CallMetadata): Promise<void> {
    if (!this.redis) {
      console.warn('[CallRegistry] ⚠️ Redis not available, skipping call registration', {
        interactionId: metadata.interactionId,
        callSid: metadata.callSid,
        reason: 'Redis client not initialized',
      });
      return;
    }

    // Check connection status before attempting registration
    if (this.connectionStatus === 'error') {
      console.error('[CallRegistry] ❌ Cannot register call - Redis connection in error state', {
        interactionId: metadata.interactionId,
        callSid: metadata.callSid,
        connectionStatus: this.connectionStatus,
      });
      return;
    }

    try {
      const key = `${CALL_METADATA_KEY_PREFIX}${metadata.interactionId}`;
      await this.redis.setex(
        key,
        CALL_METADATA_TTL_SECONDS,
        JSON.stringify(metadata)
      );
      console.info('[CallRegistry] ✅ Registered call', {
        interactionId: metadata.interactionId,
        callSid: metadata.callSid,
        from: metadata.from,
        to: metadata.to,
        tenantId: metadata.tenantId,
        ttl: CALL_METADATA_TTL_SECONDS,
      });
    } catch (error: any) {
      console.error('[CallRegistry] ❌ Failed to register call', {
        error: error.message,
        errorCode: (error as any).code,
        interactionId: metadata.interactionId,
        callSid: metadata.callSid,
        connectionStatus: this.connectionStatus,
      });
      // Update connection status on error
      if (error.message?.includes('ECONNREFUSED') || 
          error.message?.includes('Connection') ||
          (error as any).code === 'ECONNREFUSED') {
        this.connectionStatus = 'error';
      }
    }
  }

  /**
   * Get call metadata by interaction ID
   */
  async getCallByInteractionId(interactionId: string): Promise<CallMetadata | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const key = `${CALL_METADATA_KEY_PREFIX}${interactionId}`;
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as CallMetadata;
    } catch (error: any) {
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
  async updateCallStatus(interactionId: string, status: 'active' | 'ended'): Promise<void> {
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
    } catch (error: any) {
      console.error('[CallRegistry] Failed to update call status', {
        error: error.message,
        interactionId,
      });
    }
  }

  /**
   * Get all active calls (includes recently ended calls for UI auto-discovery)
   * 
   * For real-time transcription, we need to include calls that ended within the last 60 seconds
   * so the UI can still discover and connect to them even if the test script sent a stop event.
   */
  async getActiveCalls(limit: number = 10): Promise<CallMetadata[]> {
    if (!this.redis) {
      return [];
    }

    try {
      const pattern = `${CALL_METADATA_KEY_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      const calls: CallMetadata[] = [];
      const now = Date.now();
      const RECENTLY_ENDED_GRACE_PERIOD_MS = 60000; // 60 seconds - enough for UI to discover

      // Get more keys to filter (we'll filter by status and time)
      for (const key of keys.slice(0, limit * 2)) {
        try {
          const data = await this.redis.get(key);
          if (data) {
            const metadata = JSON.parse(data) as CallMetadata;
            const isActive = metadata.status === 'active';
            const isRecentlyEnded = metadata.status === 'ended' && 
                                   (now - metadata.lastActivity) < RECENTLY_ENDED_GRACE_PERIOD_MS;
            
            // Include active calls OR recently ended calls (for real-time transcription)
            if (isActive || isRecentlyEnded) {
              calls.push(metadata);
            }
          }
        } catch (err) {
          // Skip invalid entries
          console.debug('[CallRegistry] Skipping invalid call metadata', { key });
        }
      }

      // Sort by last activity (most recent first)
      calls.sort((a, b) => b.lastActivity - a.lastActivity);

      // Return only the limit requested
      return calls.slice(0, limit);
    } catch (error: any) {
      console.error('[CallRegistry] Failed to get active calls', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get calls by agent ID
   */
  async getCallsByAgentId(agentId: string): Promise<CallMetadata[]> {
    if (!this.redis) {
      return [];
    }

    try {
      const allCalls = await this.getActiveCalls(100); // Get more to filter
      return allCalls.filter(call => call.agentId === agentId);
    } catch (error: any) {
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
  async endCall(interactionId: string): Promise<void> {
    await this.updateCallStatus(interactionId, 'ended');
  }
}

// Singleton instance
let registryInstance: CallRegistry | null = null;

export function getCallRegistry(): CallRegistry {
  if (!registryInstance) {
    registryInstance = new CallRegistry();
  }
  return registryInstance;
}

