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

// Cache configuration
const CACHE_TTL_MS = 3000; // 3 seconds cache TTL
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5; // Open circuit after 5 failures
const CIRCUIT_BREAKER_RESET_MS = 30000; // Reset circuit after 30 seconds

interface CacheEntry {
  data: CallMetadata[];
  timestamp: number;
  expiresAt: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

class CallRegistry {
  private redis: any;
  private redisUrl: string = '';
  private connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  
  // In-memory cache for active calls
  private activeCallsCache: CacheEntry | null = null;
  
  // Circuit breaker for Redis operations
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed',
  };
  
  // Last known good state (fallback)
  private lastKnownGoodState: CallMetadata[] | null = null;
  private lastKnownGoodStateTime: number = 0;
  private static readonly MAX_LAST_KNOWN_GOOD_STATE = 100; // Maximum calls to store in fallback state (prevents memory leaks)

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
        const errorCode = (err as any).code;
        const errorMsg = err.message;
        
        // Handle EPIPE errors (connection closed unexpectedly) - prevent memory leaks
        if (errorCode === 'EPIPE' || errorMsg.includes('EPIPE')) {
          console.warn('[CallRegistry] ⚠️ Redis EPIPE error (connection closed) - will reconnect:', {
            redisUrl: this.redisUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
          });
          this.connectionStatus = 'disconnected';
          // Don't set to 'error' - allow reconnection attempts
          return;
        }
        
        console.error('[CallRegistry] ❌ Redis error:', {
          error: errorMsg,
          code: errorCode,
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
   * Invalidate cache (call when calls are registered/updated)
   */
  private invalidateCache(): void {
    this.activeCallsCache = null;
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
      
      // IMPROVEMENT: Invalidate cache when new call is registered
      this.invalidateCache();
      
      // IMPROVEMENT: Update last known good state if this is a new active call
      if (metadata.status === 'active') {
        if (!this.lastKnownGoodState) {
          this.lastKnownGoodState = [];
        }
        // Add or update the call in last known good state
        const existingIndex = this.lastKnownGoodState.findIndex(
          c => c.interactionId === metadata.interactionId
        );
        if (existingIndex >= 0) {
          this.lastKnownGoodState[existingIndex] = metadata;
        } else {
          this.lastKnownGoodState.push(metadata);
        }
        this.lastKnownGoodState.sort((a, b) => b.lastActivity - a.lastActivity);
        this.lastKnownGoodStateTime = Date.now();
      }
      
      console.info('[CallRegistry] ✅ Registered call', {
        interactionId: metadata.interactionId,
        callSid: metadata.callSid,
        from: metadata.from,
        to: metadata.to,
        tenantId: metadata.tenantId,
        ttl: CALL_METADATA_TTL_SECONDS,
      });

      // CRITICAL FIX: Trigger immediate stream discovery (throttled, safe)
      try {
        const { triggerStreamDiscovery } = await import('@/lib/transcript-consumer');
        // This is safe - triggerStreamDiscovery has a 2s throttle guard
        await triggerStreamDiscovery().catch(err => {
          // CRITICAL FIX: Don't fail registration if discovery fails
          console.debug('[CallRegistry] Stream discovery trigger failed (non-critical)', {
            interactionId: metadata.interactionId,
            error: err?.message,
          });
        });
      } catch (importErr) {
        // CRITICAL FIX: Handle import errors gracefully
        console.debug('[CallRegistry] Could not trigger stream discovery (module not available)', {
          interactionId: metadata.interactionId,
        });
      }
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
        this.recordFailure();
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
        await this.registerCall(metadata); // This will invalidate cache
      }
    } catch (error: any) {
      console.error('[CallRegistry] Failed to update call status', {
        error: error.message,
        interactionId,
      });
    }
  }
  
  /**
   * Get cache statistics (for monitoring)
   */
  getCacheStats(): {
    hasCache: boolean;
    cacheAge?: number;
    cacheSize?: number;
    circuitBreakerState: string;
    circuitBreakerFailures: number;
    hasFallback: boolean;
    fallbackAge?: number;
  } {
    const now = Date.now();
    return {
      hasCache: !!this.activeCallsCache,
      cacheAge: this.activeCallsCache ? now - this.activeCallsCache.timestamp : undefined,
      cacheSize: this.activeCallsCache?.data.length,
      circuitBreakerState: this.circuitBreaker.state,
      circuitBreakerFailures: this.circuitBreaker.failures,
      hasFallback: !!this.lastKnownGoodState,
      fallbackAge: this.lastKnownGoodState ? now - this.lastKnownGoodStateTime : undefined,
    };
  }

  /**
   * Check circuit breaker state
   */
  private checkCircuitBreaker(): boolean {
    const now = Date.now();
    
    // Reset circuit if enough time has passed
    if (this.circuitBreaker.state === 'open' && 
        now - this.circuitBreaker.lastFailureTime > CIRCUIT_BREAKER_RESET_MS) {
      console.info('[CallRegistry] 🔄 Circuit breaker transitioning to half-open');
      this.circuitBreaker.state = 'half-open';
      this.circuitBreaker.failures = 0;
    }
    
    // Block if circuit is open
    if (this.circuitBreaker.state === 'open') {
      return false;
    }
    
    return true;
  }
  
  /**
   * Record circuit breaker success
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      console.info('[CallRegistry] ✅ Circuit breaker closed - Redis is healthy again');
      this.circuitBreaker.state = 'closed';
    }
    this.circuitBreaker.failures = 0;
  }
  
  /**
   * Record circuit breaker failure
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      console.warn('[CallRegistry] ⚠️ Circuit breaker opened - too many failures', {
        failures: this.circuitBreaker.failures,
        threshold: CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      });
      this.circuitBreaker.state = 'open';
    }
  }
  
  /**
   * Get cached active calls if available and fresh
   */
  private getCachedActiveCalls(): CallMetadata[] | null {
    if (!this.activeCallsCache) {
      return null;
    }
    
    const now = Date.now();
    if (now < this.activeCallsCache.expiresAt) {
      // Cache is still valid
      return this.activeCallsCache.data;
    }
    
    // Cache expired
    this.activeCallsCache = null;
    return null;
  }
  
  /**
   * Update cache with new data
   */
  private updateCache(data: CallMetadata[]): void {
    const now = Date.now();
    this.activeCallsCache = {
      data: [...data], // Deep copy
      timestamp: now,
      expiresAt: now + CACHE_TTL_MS,
    };
  }

  /**
   * Get all active calls (includes recently ended calls for UI auto-discovery)
   * 
   * For real-time transcription, we need to include calls that ended within the last 60 seconds
   * so the UI can still discover and connect to them even if the test script sent a stop event.
   * 
   * IMPROVEMENTS:
   * - In-memory cache (3s TTL) to reduce Redis load
   * - Circuit breaker to skip Redis when unhealthy
   * - Fallback to last known good state
   */
  async getActiveCalls(limit: number = 10): Promise<CallMetadata[]> {
    // Check cache first (fast path)
    const cached = this.getCachedActiveCalls();
    if (cached) {
      console.debug('[CallRegistry] ✅ Returning cached active calls', {
        count: cached.length,
        cacheAge: Date.now() - (this.activeCallsCache?.timestamp || 0),
      });
      return cached.slice(0, limit);
    }
    
    // Check circuit breaker
    if (!this.checkCircuitBreaker()) {
      console.warn('[CallRegistry] ⚠️ Circuit breaker is open, using fallback', {
        failures: this.circuitBreaker.failures,
        lastFailureTime: new Date(this.circuitBreaker.lastFailureTime).toISOString(),
      });
      
      // Return last known good state if available
      if (this.lastKnownGoodState && 
          Date.now() - this.lastKnownGoodStateTime < 60000) { // Use fallback if less than 60s old
        console.info('[CallRegistry] ✅ Using last known good state (fallback)', {
          count: this.lastKnownGoodState.length,
          age: Date.now() - this.lastKnownGoodStateTime,
        });
        return this.lastKnownGoodState.slice(0, limit);
      }
      
      // No fallback available
      return [];
    }
    
    // Task 2.2: Check Redis connection health before operation
    if (!this.redis) {
      console.warn('[CallRegistry] ⚠️ Redis client not available', {
        connectionStatus: this.connectionStatus,
        timestamp: new Date().toISOString(),
      });
      return this.lastKnownGoodState?.slice(0, limit) || [];
    }
    
    // Task 2.2: Verify connection status
    if (this.connectionStatus === 'error') {
      console.error('[CallRegistry] ❌ Redis connection in error state', {
        connectionStatus: this.connectionStatus,
        timestamp: new Date().toISOString(),
      });
      this.recordFailure();
      return this.lastKnownGoodState?.slice(0, limit) || [];
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
      
      // Optimized: Use SCAN with early exit and pipeline GET operations
      let cursor = '0';
      const keys: string[] = [];
      const maxKeys = Math.min(limit * 3, 50); // Limit to 50 keys max for performance
      const maxScanIterations = 5; // Limit SCAN iterations to prevent timeout
      let scanIterations = 0;
      
      do {
        try {
          const [nextCursor, batch] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            50 // Reduced from 100 to 50 for faster scans
          );
          keys.push(...batch);
          cursor = nextCursor;
          scanIterations++;
          
          // Early exit conditions
          if (keys.length >= maxKeys || cursor === '0' || scanIterations >= maxScanIterations) {
            break;
          }
          
          // Timeout protection: if scan is taking too long, exit early
          if (Date.now() - startTime > 2000) {
            console.warn('[CallRegistry] ⚠️ SCAN taking too long, exiting early', {
              keysFound: keys.length,
              iterations: scanIterations,
            });
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
      } while (cursor !== '0' && keys.length < maxKeys && scanIterations < maxScanIterations);
      
      // Fix 2.2: Log performance metrics
      const scanDuration = Date.now() - startTime;
      console.log('[DEBUG] Redis SCAN performance metrics', {
        duration: `${scanDuration}ms`,
        keysReturned: keys.length,
        iterations: scanIterations,
        pattern,
        exceeds2Seconds: scanDuration > 2000,
        timestamp: new Date().toISOString(),
      });
      
      if (scanDuration > 2000) {
        console.warn('[CallRegistry] ⚠️ redis.scan() took longer than 2 seconds', {
          duration: `${scanDuration}ms`,
          keysReturned: keys.length,
        });
      }
      
      const calls: CallMetadata[] = [];
      const now = Date.now();
      const RECENTLY_ENDED_GRACE_PERIOD_MS = 60000; // 60 seconds - enough for UI to discover

      // Optimized: Use pipeline for batch GET operations (much faster than individual GETs)
      const processStartTime = Date.now();
      const keysToProcess = keys.slice(0, Math.min(keys.length, limit * 3));
      
      if (keysToProcess.length > 0) {
        try {
          // Use pipeline to batch all GET operations
          const pipeline = this.redis.pipeline();
          keysToProcess.forEach((key: string) => {
            pipeline.get(key);
          });
          
          const results = await pipeline.exec();
          
          // Process results
          for (let i = 0; i < results.length; i++) {
            const [err, data] = results[i];
            if (err) {
              console.debug('[CallRegistry] Pipeline GET error', { key: keysToProcess[i], error: err.message });
              continue;
            }
            
            if (data) {
              try {
                const metadata = JSON.parse(data) as CallMetadata;
                const isActive = metadata.status === 'active';
                const isRecentlyEnded = metadata.status === 'ended' && 
                                       (now - metadata.lastActivity) < RECENTLY_ENDED_GRACE_PERIOD_MS;
                
                // Include active calls OR recently ended calls (for real-time transcription)
                if (isActive || isRecentlyEnded) {
                  calls.push(metadata);
                  
                  // Early exit: if we have enough active calls, stop processing
                  if (calls.length >= limit * 2) {
                    break;
                  }
                }
              } catch (parseErr) {
                console.debug('[CallRegistry] Skipping invalid call metadata', { key: keysToProcess[i] });
              }
            }
          }
        } catch (pipelineError: any) {
          console.error('[CallRegistry] Pipeline execution error', {
            error: pipelineError.message,
            keysCount: keysToProcess.length,
          });
          // Fallback to individual GETs if pipeline fails
          for (const key of keysToProcess.slice(0, limit * 2)) {
            try {
              const data = await this.redis.get(key);
              if (data) {
                const metadata = JSON.parse(data) as CallMetadata;
                const isActive = metadata.status === 'active';
                const isRecentlyEnded = metadata.status === 'ended' && 
                                       (now - metadata.lastActivity) < RECENTLY_ENDED_GRACE_PERIOD_MS;
                
                if (isActive || isRecentlyEnded) {
                  calls.push(metadata);
                  if (calls.length >= limit) break;
                }
              }
            } catch (err) {
              console.debug('[CallRegistry] Skipping invalid call metadata', { key });
            }
          }
        }
      }
      
      const processDuration = Date.now() - processStartTime;
      if (processDuration > 1000) {
        console.warn('[CallRegistry] ⚠️ Processing calls took longer than 1 second', {
          duration: `${processDuration}ms`,
          callsFound: calls.length,
        });
      }

      // Sort by last activity (most recent first)
      calls.sort((a, b) => b.lastActivity - a.lastActivity);

      const result = calls.slice(0, limit);
      
      // Update cache
      this.updateCache(result);
      
      // Update last known good state (limit size to prevent memory leaks)
      const limitedResult = result.slice(0, CallRegistry.MAX_LAST_KNOWN_GOOD_STATE);
      this.lastKnownGoodState = [...limitedResult];
      this.lastKnownGoodStateTime = Date.now();
      
      // Record success for circuit breaker
      this.recordSuccess();

      // Return only the limit requested
      return result;
    } catch (error: any) {
      console.error('[CallRegistry] Failed to get active calls', {
        error: error.message,
      });
      
      // Record failure for circuit breaker
      this.recordFailure();
      
      // Return last known good state if available (limit to prevent memory issues)
      if (this.lastKnownGoodState && 
          Date.now() - this.lastKnownGoodStateTime < 60000) {
        const limitedState = this.lastKnownGoodState.slice(0, Math.min(limit, CallRegistry.MAX_LAST_KNOWN_GOOD_STATE));
        console.info('[CallRegistry] ✅ Using last known good state after error', {
          count: limitedState.length,
          originalCount: this.lastKnownGoodState.length,
          age: Date.now() - this.lastKnownGoodStateTime,
        });
        return limitedState;
      }
      
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

