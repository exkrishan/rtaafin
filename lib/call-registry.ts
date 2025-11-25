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
    // Task 2.2: Check Redis connection health before operation
    if (!this.redis) {
      console.warn('[CallRegistry] ⚠️ Redis client not available', {
        connectionStatus: this.connectionStatus,
        timestamp: new Date().toISOString(),
      });
      return [];
    }
    
    // Task 2.2: Verify connection status
    if (this.connectionStatus === 'error') {
      console.error('[CallRegistry] ❌ Redis connection in error state', {
        connectionStatus: this.connectionStatus,
        timestamp: new Date().toISOString(),
      });
      return [];
    }

    try {
      // Fix 2.2: Use SCAN instead of KEYS for better performance
      const startTime = Date.now();
      const pattern = `${CALL_METADATA_KEY_PREFIX}*`;
      
      console.log('[DEBUG] Starting Redis SCAN operation (replacing KEYS)', {
        pattern,
        limit,
        connectionStatus: this.connectionStatus,
        timestamp: new Date().toISOString(),
      });
      
      // Fix 2.2: Use SCAN instead of KEYS to avoid blocking
      let cursor = '0';
      const keys: string[] = [];
      const maxKeys = limit * 2; // Get more keys to filter
      
      do {
        try {
          const [nextCursor, batch] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100 // Scan 100 keys at a time
          );
          keys.push(...batch);
          cursor = nextCursor;
          
          // Stop if we have enough keys or cursor is back to 0
          if (keys.length >= maxKeys || cursor === '0') {
            break;
          }
        } catch (scanError: any) {
          console.error('[CallRegistry] SCAN operation error', {
            error: scanError.message,
            cursor,
            keysFound: keys.length,
          });
          break; // Exit loop on error
        }
      } while (cursor !== '0' && keys.length < maxKeys);
      
      // Fix 2.2: Log performance metrics
      const scanDuration = Date.now() - startTime;
      console.log('[DEBUG] Redis SCAN performance metrics', {
        duration: `${scanDuration}ms`,
        keysReturned: keys.length,
        pattern,
        exceeds5Seconds: scanDuration > 5000,
        timestamp: new Date().toISOString(),
      });
      
      if (scanDuration > 5000) {
        console.warn('[CallRegistry] ⚠️ redis.scan() took longer than 5 seconds', {
          duration: `${scanDuration}ms`,
          keysReturned: keys.length,
        });
      }
      
      const calls: CallMetadata[] = [];
      const now = Date.now();
      const RECENTLY_ENDED_GRACE_PERIOD_MS = 60000; // 60 seconds - enough for UI to discover

      // Get more keys to filter (we'll filter by status and time)
      const processStartTime = Date.now();
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

