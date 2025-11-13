/**
 * Circuit Breaker Pattern for ElevenLabs API
 * Prevents cascading failures when ElevenLabs service has issues
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening circuit
  timeout?: number; // Timeout in ms before attempting half-open
  resetTimeout?: number; // Time to wait before resetting failure count
}

export class ElevenLabsCircuitBreaker {
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private state: CircuitState = 'CLOSED';
  private threshold: number;
  private timeout: number;
  private resetTimeout: number;
  private successCount: number = 0; // Track successes in HALF_OPEN state
  private halfOpenSuccessThreshold: number = 3; // Need 3 successes to close from half-open

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold || 5; // 5 failures before opening
    this.timeout = options.timeout || 60000; // 1 minute cooldown
    this.resetTimeout = options.resetTimeout || 300000; // 5 minutes before resetting failure count
  }

  async call<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.timeout) {
        // Try half-open state
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.info('[CircuitBreaker] 🔄 Moving to HALF_OPEN state - testing if service recovered');
      } else {
        const remainingTime = Math.ceil((this.timeout - timeSinceLastFailure) / 1000);
        throw new Error(
          `Circuit breaker is OPEN - ElevenLabs service unavailable. Retry in ${remainingTime}s`
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        // Successfully recovered
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        console.info('[CircuitBreaker] ✅ Circuit breaker CLOSED - service recovered');
      } else {
        console.debug(
          `[CircuitBreaker] ✅ Success in HALF_OPEN (${this.successCount}/${this.halfOpenSuccessThreshold})`
        );
      }
    } else {
      // In CLOSED state, reset failure count after resetTimeout
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.resetTimeout) {
        this.failureCount = 0;
        console.debug('[CircuitBreaker] ✅ Failure count reset after successful period');
      }
    }
  }

  private onFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    const errorMessage = error?.message || String(error);
    const isTransientError =
      errorMessage.includes('timeout') ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('network') ||
      errorMessage.includes('429'); // Rate limit

    if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN immediately opens the circuit
      this.state = 'OPEN';
      this.successCount = 0;
      console.error(
        `[CircuitBreaker] 🚨 Circuit breaker OPENED from HALF_OPEN after failure: ${errorMessage}`
      );
    } else if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.error(
        `[CircuitBreaker] 🚨 Circuit breaker OPENED after ${this.failureCount} failures`,
        {
          failureCount: this.failureCount,
          threshold: this.threshold,
          lastError: errorMessage,
          isTransientError,
          cooldownSeconds: Math.ceil(this.timeout / 1000),
        }
      );
    } else {
      console.warn(`[CircuitBreaker] ⚠️ Failure ${this.failureCount}/${this.threshold}`, {
        failureCount: this.failureCount,
        threshold: this.threshold,
        error: errorMessage,
        isTransientError,
      });
    }
  }

  getState(): CircuitState {
    // Auto-transition from OPEN to HALF_OPEN if timeout elapsed
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.info('[CircuitBreaker] 🔄 Auto-transitioning to HALF_OPEN state');
      }
    }
    return this.state;
  }

  getStats(): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number;
    timeSinceLastFailure: number;
    threshold: number;
    timeout: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: Date.now() - this.lastFailureTime,
      threshold: this.threshold,
      timeout: this.timeout,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    console.info('[CircuitBreaker] 🔄 Circuit breaker manually reset');
  }
}

