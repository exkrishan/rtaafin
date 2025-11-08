/**
 * Transcript Consumer Initialization
 * 
 * This module initializes the transcript consumer when the Next.js app starts.
 * It can be imported in app/layout.tsx or used via instrumentation hook.
 */

import { startTranscriptConsumer } from './transcript-consumer';

let initialized = false;

/**
 * Initialize transcript consumer
 * Safe to call multiple times (idempotent)
 */
export async function initTranscriptConsumer(): Promise<void> {
  if (initialized) {
    console.debug('[transcript-consumer-init] Already initialized');
    return;
  }

  // Only initialize in Node.js runtime (not Edge)
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    try {
      console.info('[transcript-consumer-init] Initializing transcript consumer...');
      await startTranscriptConsumer();
      initialized = true;
      console.info('[transcript-consumer-init] ✅ Transcript consumer initialized');
    } catch (error: any) {
      console.error('[transcript-consumer-init] Failed to initialize transcript consumer:', error);
      // Don't throw - allow app to start even if consumer fails
    }
  } else {
    console.debug('[transcript-consumer-init] Skipping initialization (Edge runtime or browser)');
  }
}

/**
 * Cleanup transcript consumer
 */
export async function cleanupTranscriptConsumer(): Promise<void> {
  if (!initialized) {
    return;
  }

  try {
    const { stopTranscriptConsumer } = await import('./transcript-consumer');
    await stopTranscriptConsumer();
    initialized = false;
    console.info('[transcript-consumer-init] ✅ Transcript consumer stopped');
  } catch (error: any) {
    console.error('[transcript-consumer-init] Error stopping transcript consumer:', error);
  }
}

// Auto-initialize if this module is imported
if (typeof window === 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
  // Use setImmediate to defer initialization until after module loading
  setImmediate(() => {
    initTranscriptConsumer().catch((error) => {
      console.error('[transcript-consumer-init] Auto-init failed:', error);
    });
  });
}

 * Transcript Consumer Initialization
 * 
 * This module initializes the transcript consumer when the Next.js app starts.
 * It can be imported in app/layout.tsx or used via instrumentation hook.
 */

import { startTranscriptConsumer } from './transcript-consumer';

let initialized = false;

/**
 * Initialize transcript consumer
 * Safe to call multiple times (idempotent)
 */
export async function initTranscriptConsumer(): Promise<void> {
  if (initialized) {
    console.debug('[transcript-consumer-init] Already initialized');
    return;
  }

  // Only initialize in Node.js runtime (not Edge)
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
    try {
      console.info('[transcript-consumer-init] Initializing transcript consumer...');
      await startTranscriptConsumer();
      initialized = true;
      console.info('[transcript-consumer-init] ✅ Transcript consumer initialized');
    } catch (error: any) {
      console.error('[transcript-consumer-init] Failed to initialize transcript consumer:', error);
      // Don't throw - allow app to start even if consumer fails
    }
  } else {
    console.debug('[transcript-consumer-init] Skipping initialization (Edge runtime or browser)');
  }
}

/**
 * Cleanup transcript consumer
 */
export async function cleanupTranscriptConsumer(): Promise<void> {
  if (!initialized) {
    return;
  }

  try {
    const { stopTranscriptConsumer } = await import('./transcript-consumer');
    await stopTranscriptConsumer();
    initialized = false;
    console.info('[transcript-consumer-init] ✅ Transcript consumer stopped');
  } catch (error: any) {
    console.error('[transcript-consumer-init] Error stopping transcript consumer:', error);
  }
}

// Auto-initialize if this module is imported
if (typeof window === 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
  // Use setImmediate to defer initialization until after module loading
  setImmediate(() => {
    initTranscriptConsumer().catch((error) => {
      console.error('[transcript-consumer-init] Auto-init failed:', error);
    });
  });
}

