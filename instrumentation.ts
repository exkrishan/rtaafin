/**
 * Next.js Instrumentation Hook
 * 
 * This file is executed when the Next.js server starts.
 * We use it to initialize the transcript consumer background worker.
 * 
 * Requires: experimental.instrumentationHook = true in next.config.js
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on Node.js runtime (not Edge)
    const { startTranscriptConsumer } = await import('./lib/transcript-consumer');
    
    console.info('[instrumentation] Starting transcript consumer...');
    try {
      await startTranscriptConsumer();
      console.info('[instrumentation] ✅ Transcript consumer started');
    } catch (error: any) {
      console.error('[instrumentation] Failed to start transcript consumer:', error);
      // Don't fail the app startup - transcript consumer is optional
    }
  }
}

