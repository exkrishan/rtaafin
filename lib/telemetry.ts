/**
 * Telemetry & Metrics Emitter
 * Lightweight event tracking for KB adapter performance, API calls, and system metrics
 */

import { supabase } from '@/lib/supabase';

/**
 * Telemetry event payload
 */
export interface TelemetryEvent {
  event_name: string;
  tenant_id?: string;
  provider?: string;
  latency_ms?: number;
  found_count?: number;
  error?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

/**
 * Emit a telemetry event
 * Attempts to write to Supabase metrics table, falls back to console logging
 *
 * @param eventName - Event identifier (e.g., 'kb_suggestion_latency_logged')
 * @param payload - Event data
 */
export async function emit(eventName: string, payload: Record<string, any>): Promise<void> {
  const event: TelemetryEvent = {
    event_name: eventName,
    timestamp: new Date(),
    ...payload,
  };

  // Try to write to Supabase metrics table (if exists)
  try {
    const { error } = await (supabase as any).from('rtaa_metrics').insert({
      event_name: event.event_name,
      tenant_id: event.tenant_id,
      provider: event.provider,
      latency_ms: event.latency_ms,
      found_count: event.found_count,
      error: event.error,
      metadata: event.metadata || {},
      created_at: event.timestamp?.toISOString(),
    });

    if (error) {
      // Table might not exist - fall back to console
      logToConsole(event);
    } else {
      console.info('[telemetry] Event written to metrics table:', eventName);
    }
  } catch (err) {
    // Supabase not available or table doesn't exist - log to console
    logToConsole(event);
  }
}

/**
 * Console-based telemetry logging (fallback)
 */
function logToConsole(event: TelemetryEvent): void {
  const parts = [`[kb-telemetry] ${event.event_name}`];

  if (event.tenant_id) parts.push(`tenant=${event.tenant_id}`);
  if (event.provider) parts.push(`provider=${event.provider}`);
  if (event.latency_ms !== undefined) parts.push(`latency_ms=${event.latency_ms}`);
  if (event.found_count !== undefined) parts.push(`found=${event.found_count}`);
  if (event.error) parts.push(`error=${event.error}`);

  console.info(parts.join(' '));
}

/**
 * Emit KB search telemetry
 * Convenience wrapper for KB adapter performance tracking
 */
export async function emitKBSearch(
  tenantId: string,
  provider: string,
  latencyMs: number,
  foundCount: number,
  error?: string
): Promise<void> {
  await emit('kb_suggestion_latency_logged', {
    tenant_id: tenantId,
    provider,
    latency_ms: latencyMs,
    found_count: foundCount,
    error,
  });
}

/**
 * Generic telemetry emitter exposed for other modules.
 * Alias to emit() for compatibility with legacy code expectations.
 */
export async function emitTelemetry(eventName: string, payload: Record<string, any>): Promise<void> {
  await emit(eventName, payload);
}
