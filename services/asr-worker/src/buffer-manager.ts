/**
 * Comprehensive Buffer Manager
 * Tracks buffer lifecycle, connection states, and provides health monitoring
 */

interface BufferState {
  audioChunks: Buffer[];
  createdAt: number;
  lastActivity: number;
  isActive: boolean;
  interactionId: string;
  tenantId: string;
  sampleRate: number;
  hasSentInitialChunk: boolean;
  chunksCount: number;
  totalAudioMs: number;
}

interface ConnectionState {
  wsConnected: boolean;
  sessionStarted: boolean;
  hasAudio: boolean;
  lastAudioTime: number;
  connectionCreatedAt: number;
}

export class BufferManager {
  private buffers: Map<string, BufferState> = new Map();
  private connectionStates: Map<string, ConnectionState> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    // Start health check monitoring
    this.startHealthMonitoring();
  }

  createBuffer(interactionId: string, tenantId: string, sampleRate: number): void {
    console.log(`[BufferManager] 📊 Creating buffer for ${interactionId}`, {
      interactionId,
      tenantId,
      sampleRate,
      timestamp: new Date().toISOString(),
    });

    this.buffers.set(interactionId, {
      audioChunks: [],
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isActive: true,
      interactionId,
      tenantId,
      sampleRate,
      hasSentInitialChunk: false,
      chunksCount: 0,
      totalAudioMs: 0,
    });

    this.connectionStates.set(interactionId, {
      wsConnected: false,
      sessionStarted: false,
      hasAudio: false,
      lastAudioTime: 0,
      connectionCreatedAt: Date.now(),
    });
  }

  updateBufferActivity(interactionId: string): void {
    const buffer = this.buffers.get(interactionId);
    if (buffer) {
      buffer.lastActivity = Date.now();
      buffer.isActive = true;
    }
  }

  updateBufferStats(
    interactionId: string,
    stats: {
      chunksCount?: number;
      totalAudioMs?: number;
      hasSentInitialChunk?: boolean;
    }
  ): void {
    const buffer = this.buffers.get(interactionId);
    if (buffer) {
      if (stats.chunksCount !== undefined) buffer.chunksCount = stats.chunksCount;
      if (stats.totalAudioMs !== undefined) buffer.totalAudioMs = stats.totalAudioMs;
      if (stats.hasSentInitialChunk !== undefined) buffer.hasSentInitialChunk = stats.hasSentInitialChunk;
      buffer.lastActivity = Date.now();
    }
  }

  updateConnectionState(
    interactionId: string,
    state: Partial<ConnectionState>
  ): void {
    const connectionState = this.connectionStates.get(interactionId);
    if (connectionState) {
      Object.assign(connectionState, state);
      if (state.hasAudio) {
        connectionState.lastAudioTime = Date.now();
      }
    } else {
      // Create connection state if it doesn't exist
      this.connectionStates.set(interactionId, {
        wsConnected: state.wsConnected || false,
        sessionStarted: state.sessionStarted || false,
        hasAudio: state.hasAudio || false,
        lastAudioTime: state.hasAudio ? Date.now() : 0,
        connectionCreatedAt: Date.now(),
      });
    }
  }

  handleCallEnd(interactionId: string): void {
    const buffer = this.buffers.get(interactionId);
    const connectionState = this.connectionStates.get(interactionId);

    if (!buffer) {
      console.warn(`[BufferManager] ❌ No buffer found for ended call ${interactionId}`, {
        interactionId,
        totalBuffers: this.buffers.size,
        connectionState: connectionState || 'unknown',
        possibleCauses: [
          'Buffer was cleaned up prematurely',
          'Connection never established properly',
          'Buffer creation failed',
          'Call ended before buffer was created',
        ],
        existingBufferIds: Array.from(this.buffers.keys()).slice(0, 10), // First 10 for debugging
      });
      return;
    }

    console.info(`[BufferManager] 🧹 Handling call end for ${interactionId}`, {
      interactionId,
      bufferAge: Date.now() - buffer.createdAt,
      lastActivity: Date.now() - buffer.lastActivity,
      chunksCount: buffer.chunksCount,
      totalAudioMs: buffer.totalAudioMs,
      hasSentInitialChunk: buffer.hasSentInitialChunk,
      connectionState: connectionState || 'unknown',
    });

    // Proper cleanup
    this.cleanupBuffer(interactionId);
  }

  cleanupBuffer(interactionId: string): void {
    const buffer = this.buffers.get(interactionId);
    const connectionState = this.connectionStates.get(interactionId);

    if (buffer) {
      console.log(`[BufferManager] 🧹 Cleaning up buffer for ${interactionId}`, {
        interactionId,
        bufferLifetime: Date.now() - buffer.createdAt,
        chunksCount: buffer.chunksCount,
        totalAudioMs: buffer.totalAudioMs,
      });
    }

    this.buffers.delete(interactionId);
    this.connectionStates.delete(interactionId);
  }

  getBuffer(interactionId: string): BufferState | undefined {
    return this.buffers.get(interactionId);
  }

  getConnectionState(interactionId: string): ConnectionState | undefined {
    return this.connectionStates.get(interactionId);
  }

  hasBuffer(interactionId: string): boolean {
    return this.buffers.has(interactionId);
  }

  // Health check method
  getSystemHealth(): {
    totalBuffers: number;
    activeBuffers: number;
    staleBuffers: number;
    memoryUsage: NodeJS.MemoryUsage;
    bufferDetails: Array<{
      interactionId: string;
      age: number;
      lastActivity: number;
      chunksCount: number;
      totalAudioMs: number;
    }>;
  } {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    let activeBuffers = 0;
    let staleBuffers = 0;
    const bufferDetails: Array<{
      interactionId: string;
      age: number;
      lastActivity: number;
      chunksCount: number;
      totalAudioMs: number;
    }> = [];

    for (const [id, buffer] of this.buffers.entries()) {
      const age = now - buffer.createdAt;
      const lastActivity = now - buffer.lastActivity;

      if (lastActivity > staleThreshold) {
        staleBuffers++;
        console.warn(`[BufferManager] ⚠️ Stale buffer detected: ${id}`, {
          interactionId: id,
          age,
          lastActivity,
          chunksCount: buffer.chunksCount,
        });
      } else {
        activeBuffers++;
      }

      bufferDetails.push({
        interactionId: id,
        age,
        lastActivity,
        chunksCount: buffer.chunksCount,
        totalAudioMs: buffer.totalAudioMs,
      });
    }

    return {
      totalBuffers: this.buffers.size,
      activeBuffers,
      staleBuffers,
      memoryUsage: process.memoryUsage(),
      bufferDetails,
    };
  }

  private startHealthMonitoring(): void {
    // Perform health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      const health = this.getSystemHealth();
      if (health.staleBuffers > 0) {
        console.warn(`[BufferManager] ⚠️ Health check: ${health.staleBuffers} stale buffers detected`, {
          totalBuffers: health.totalBuffers,
          activeBuffers: health.activeBuffers,
          staleBuffers: health.staleBuffers,
        });
      }
    }, 30000); // Every 30 seconds
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.buffers.clear();
    this.connectionStates.clear();
  }
}

