/**
 * Connection Health Monitor
 * Monitors ElevenLabs WebSocket connection health with ping/pong
 */

export interface ConnectionHealth {
  interactionId: string;
  connectedAt: number;
  lastPong: number;
  reconnectAttempts: number;
  isHealthy: boolean;
  wsReadyState?: number; // WebSocket readyState
}

export class ConnectionHealthMonitor {
  private connections: Map<string, ConnectionHealth> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.startHealthCheck();
  }

  trackConnection(interactionId: string, wsInstance: any): void {
    console.info(`[ConnectionHealthMonitor] 📡 Tracking connection for ${interactionId}`);

    this.connections.set(interactionId, {
      interactionId,
      connectedAt: Date.now(),
      lastPong: Date.now(),
      reconnectAttempts: 0,
      isHealthy: true,
      wsReadyState: wsInstance?.readyState,
    });

    // Setup ping/pong for health checking if WebSocket supports it
    if (wsInstance && typeof wsInstance.ping === 'function') {
      const pingInterval = setInterval(() => {
        try {
          if (wsInstance.readyState === 1) { // WebSocket.OPEN
            wsInstance.ping();
            const connection = this.connections.get(interactionId);
            if (connection) {
              connection.wsReadyState = wsInstance.readyState;
            }
          } else {
            // Connection not open, mark as potentially unhealthy
            const connection = this.connections.get(interactionId);
            if (connection) {
              connection.isHealthy = false;
              connection.wsReadyState = wsInstance.readyState;
            }
          }
        } catch (error: any) {
          console.error(`[ConnectionHealthMonitor] Error sending ping for ${interactionId}:`, error);
          const connection = this.connections.get(interactionId);
          if (connection) {
            connection.isHealthy = false;
          }
        }
      }, 15000); // Ping every 15 seconds

      this.pingIntervals.set(interactionId, pingInterval);

      // Listen for pong
      if (typeof wsInstance.on === 'function') {
        wsInstance.on('pong', () => {
          const connection = this.connections.get(interactionId);
          if (connection) {
            connection.lastPong = Date.now();
            connection.isHealthy = true;
            connection.wsReadyState = wsInstance?.readyState;
          }
        });
      }

      // Listen for close
      if (typeof wsInstance.on === 'function') {
        wsInstance.on('close', () => {
          console.info(`[ConnectionHealthMonitor] Connection closed for ${interactionId}`);
          this.untrackConnection(interactionId);
        });
      }
    } else {
      // WebSocket doesn't support ping/pong, use alternative health check
      console.debug(`[ConnectionHealthMonitor] WebSocket doesn't support ping/pong for ${interactionId}, using alternative health check`);
    }
  }

  untrackConnection(interactionId: string): void {
    const pingInterval = this.pingIntervals.get(interactionId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(interactionId);
    }
    this.connections.delete(interactionId);
  }

  updateConnectionHealth(interactionId: string, isHealthy: boolean): void {
    const connection = this.connections.get(interactionId);
    if (connection) {
      connection.isHealthy = isHealthy;
      connection.lastPong = Date.now();
    }
  }

  incrementReconnectAttempts(interactionId: string): void {
    const connection = this.connections.get(interactionId);
    if (connection) {
      connection.reconnectAttempts++;
    } else {
      // Create new connection record if it doesn't exist
      this.connections.set(interactionId, {
        interactionId,
        connectedAt: Date.now(),
        lastPong: Date.now(),
        reconnectAttempts: 1,
        isHealthy: false,
      });
    }
  }

  performHealthCheck(): {
    totalConnections: number;
    healthyConnections: number;
    unhealthyConnections: number;
    unhealthyDetails: Array<{
      interactionId: string;
      connectedFor: number;
      lastPong: number;
      reconnectAttempts: number;
    }>;
  } {
    const now = Date.now();
    const unhealthyConnections: Array<{
      interactionId: string;
      connectedFor: number;
      lastPong: number;
      reconnectAttempts: number;
    }> = [];

    let healthyCount = 0;

    for (const [id, connection] of this.connections.entries()) {
      // Check if connection is unresponsive (45 seconds without pong)
      const timeSinceLastPong = now - connection.lastPong;
      if (timeSinceLastPong > 45000) {
        connection.isHealthy = false;
        unhealthyConnections.push({
          interactionId: id,
          connectedFor: now - connection.connectedAt,
          lastPong: timeSinceLastPong,
          reconnectAttempts: connection.reconnectAttempts,
        });

        console.error(`[ConnectionHealthMonitor] 🏥 Unhealthy connection detected: ${id}`, {
          interactionId: id,
          connectedFor: now - connection.connectedAt,
          lastPong: timeSinceLastPong,
          reconnectAttempts: connection.reconnectAttempts,
          wsReadyState: connection.wsReadyState,
        });
      } else {
        healthyCount++;
      }
    }

    if (unhealthyConnections.length > 0) {
      console.error(
        `[ConnectionHealthMonitor] ⚠️ System health alert: ${unhealthyConnections.length} unhealthy connections`,
        {
          totalConnections: this.connections.size,
          healthyConnections: healthyCount,
          unhealthyConnections: unhealthyConnections.length,
        }
      );
    }

    return {
      totalConnections: this.connections.size,
      healthyConnections: healthyCount,
      unhealthyConnections: unhealthyConnections.length,
      unhealthyDetails: unhealthyConnections,
    };
  }

  private startHealthCheck(): void {
    // Check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  getConnectionHealth(interactionId: string): ConnectionHealth | undefined {
    return this.connections.get(interactionId);
  }

  getAllConnections(): Map<string, ConnectionHealth> {
    return new Map(this.connections);
  }

  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    for (const [id, interval] of this.pingIntervals.entries()) {
      clearInterval(interval);
    }
    this.pingIntervals.clear();
    this.connections.clear();
  }
}

