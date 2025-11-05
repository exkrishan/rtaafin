/**
 * Ingest orchestrator for RTAA transcript chunks.
 * Supports dev mode (local files) and s3 mode (presigned URLs).
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface ChunkData {
  callId: string;
  seq: number;
  ts: string;
  text: string;
  end?: boolean;
}

interface IngestOptions {
  mode?: 'dev' | 's3';
  pollIntervalMs?: number;
}

interface ManifestEntry {
  url: string;
  seq: number;
}

// Track running ingest loops
const activeIngests = new Map<string, { stop: boolean; timerId?: NodeJS.Timeout }>();

// Track processed chunks to avoid duplicates
const seenChunks = new Set<string>();

/**
 * Start ingesting transcript chunks for a call.
 * @param callId - The call identifier
 * @param opts - Options: mode ('dev' or 's3'), pollIntervalMs (default 2500)
 */
export async function startIngest(
  callId: string,
  opts?: IngestOptions
): Promise<void> {
  const mode = opts?.mode || 'dev';
  const pollIntervalMs = opts?.pollIntervalMs || 2500;

  console.info(`[ingest] Starting ingest for callId=${callId}, mode=${mode}`);

  if (activeIngests.has(callId)) {
    console.warn(`[ingest] Ingest already running for callId=${callId}`);
    return;
  }

  // Initialize state
  const state = { stop: false, timerId: undefined as NodeJS.Timeout | undefined };
  activeIngests.set(callId, state);

  try {
    if (mode === 'dev') {
      await runDevModeIngest(callId, pollIntervalMs, state);
    } else if (mode === 's3') {
      await runS3ModeIngest(callId, pollIntervalMs, state);
    } else {
      throw new Error(`Unknown mode: ${mode}`);
    }
  } catch (err) {
    console.error(`[ingest] Fatal error for callId=${callId}:`, err);
  } finally {
    activeIngests.delete(callId);
    console.info(`[ingest] Stopped ingest for callId=${callId}`);
  }
}

/**
 * Stop an active ingest loop.
 * @param callId - The call identifier
 */
export function stopIngest(callId: string): void {
  const state = activeIngests.get(callId);
  if (!state) {
    console.warn(`[ingest] No active ingest for callId=${callId}`);
    return;
  }

  console.info(`[ingest] Stopping ingest for callId=${callId}`);
  state.stop = true;
  if (state.timerId) {
    clearTimeout(state.timerId);
  }
}

/**
 * Dev mode: read chunks from ./data/${callId}/chunk-*.json
 */
async function runDevModeIngest(
  callId: string,
  pollIntervalMs: number,
  state: { stop: boolean; timerId?: NodeJS.Timeout }
): Promise<void> {
  const dataDir = join(process.cwd(), 'data', callId);
  let processedIndex = 0;

  const poll = async () => {
    if (state.stop) return;

    try {
      // Read all chunk files
      let files: string[] = [];
      try {
        files = await readdir(dataDir);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          console.error(`[ingest] Directory not found: ${dataDir}`);
          return;
        }
        throw err;
      }

      // Filter and sort chunk files
      const chunkFiles = files
        .filter((f) => /^chunk-\d+\.json$/.test(f))
        .map((f) => {
          const match = f.match(/^chunk-(\d+)\.json$/);
          return { file: f, seq: parseInt(match![1], 10) };
        })
        .sort((a, b) => a.seq - b.seq);

      if (chunkFiles.length === 0) {
        console.warn(`[ingest] No chunk files found in ${dataDir}`);
        return;
      }

      // Process next chunk
      if (processedIndex < chunkFiles.length) {
        const { file, seq } = chunkFiles[processedIndex];
        const filePath = join(dataDir, file);

        try {
          const content = await readFile(filePath, 'utf-8');
          const chunk: ChunkData = JSON.parse(content);

          // Validate chunk
          if (!chunk.text || chunk.text.trim() === '') {
            console.warn(`[ingest] Empty text in chunk seq=${seq}, skipping`);
            processedIndex++;
          } else {
            const shouldStop = await processChunk(chunk);
            processedIndex++;

            if (shouldStop) {
              console.info(`[ingest] End marker detected, stopping ingest`);
              return;
            }
          }
        } catch (err) {
          console.error(`[ingest] Error reading chunk file ${file}:`, err);
          processedIndex++;
        }
      }

      // Check if we've processed all chunks
      if (processedIndex >= chunkFiles.length) {
        console.info(`[ingest] All chunks processed for callId=${callId}`);
        return;
      }

      // Schedule next poll
      if (!state.stop) {
        state.timerId = setTimeout(poll, pollIntervalMs);
      }
    } catch (err) {
      console.error(`[ingest] Error in dev mode poll:`, err);
      // Continue polling despite errors
      if (!state.stop) {
        state.timerId = setTimeout(poll, pollIntervalMs);
      }
    }
  };

  // Start polling
  await poll();
}

/**
 * S3 mode: fetch manifest and process chunks from presigned URLs
 */
async function runS3ModeIngest(
  callId: string,
  pollIntervalMs: number,
  state: { stop: boolean; timerId?: NodeJS.Timeout }
): Promise<void> {
  try {
    // Fetch manifest
    const manifestUrl = `http://localhost:3000/api/ingest/s3-index?callId=${callId}`;
    console.info(`[ingest] Fetching manifest from ${manifestUrl}`);

    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest: ${manifestRes.statusText}`);
    }

    const manifestData = await manifestRes.json();
    if (!manifestData.ok || !Array.isArray(manifestData.manifest)) {
      throw new Error(`Invalid manifest response`);
    }

    const manifest: ManifestEntry[] = manifestData.manifest;
    console.info(`[ingest] Found ${manifest.length} chunks in manifest`);

    let processedIndex = 0;

    const poll = async () => {
      if (state.stop) return;

      if (processedIndex >= manifest.length) {
        console.info(`[ingest] All chunks processed for callId=${callId}`);
        return;
      }

      const entry = manifest[processedIndex];

      try {
        console.info(`[ingest] Fetching chunk from ${entry.url}`);
        const chunkRes = await fetch(entry.url);
        if (!chunkRes.ok) {
          throw new Error(`Failed to fetch chunk: ${chunkRes.statusText}`);
        }

        const chunk: ChunkData = await chunkRes.json();

        // Validate chunk
        if (!chunk.text || chunk.text.trim() === '') {
          console.warn(`[ingest] Empty text in chunk seq=${entry.seq}, skipping`);
          processedIndex++;
        } else {
          const shouldStop = await processChunk(chunk);
          processedIndex++;

          if (shouldStop) {
            console.info(`[ingest] End marker detected, stopping ingest`);
            return;
          }
        }
      } catch (err) {
        console.error(`[ingest] Error processing chunk seq=${entry.seq}:`, err);
        processedIndex++;
      }

      // Schedule next poll
      if (!state.stop) {
        state.timerId = setTimeout(poll, pollIntervalMs);
      }
    };

    // Start polling
    await poll();
  } catch (err) {
    console.error(`[ingest] Error in s3 mode:`, err);
    throw err;
  }
}

/**
 * Process a single chunk with retry logic.
 * @returns true if should stop (end marker), false otherwise
 */
async function processChunk(chunk: ChunkData): Promise<boolean> {
  const chunkKey = `${chunk.callId}-${chunk.seq}`;

  // Check if already processed
  if (seenChunks.has(chunkKey)) {
    console.warn(`[ingest] Chunk seq=${chunk.seq} already processed, skipping`);
    return false;
  }

  // Optional: check with server if chunk was already processed
  try {
    const checkUrl = `http://localhost:3000/api/ingest/check?callId=${chunk.callId}&seq=${chunk.seq}`;
    const checkRes = await fetch(checkUrl);
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.seen) {
        console.warn(`[ingest] Server reports chunk seq=${chunk.seq} already seen, skipping`);
        seenChunks.add(chunkKey);
        return false;
      }
    }
  } catch {
    // If check endpoint doesn't exist, continue
  }

  console.info(`[ingest] Posting chunk seq=${chunk.seq} callId=${chunk.callId}`);

  // Post chunk with retry logic
  const maxRetries = 3;
  const backoffDelays = [500, 1000, 2000];

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const postUrl = 'http://localhost:3000/api/calls/ingest-transcript';
      const response = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: chunk.callId,
          seq: chunk.seq,
          ts: chunk.ts,
          text: chunk.text,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.info(
        `[ingest] Chunk seq=${chunk.seq} posted successfully`,
        result.intent ? `intent=${result.intent}` : ''
      );

      // Mark as processed
      seenChunks.add(chunkKey);

      // Check for end marker
      if (chunk.end === true) {
        await finalizeCall(chunk.callId);
        return true;
      }

      return false;
    } catch (err) {
      const isLastAttempt = attempt === maxRetries - 1;
      console.error(
        `[ingest] Attempt ${attempt + 1}/${maxRetries} failed for seq=${chunk.seq}:`,
        err
      );

      if (isLastAttempt) {
        console.error(`[ingest] Max retries exceeded for seq=${chunk.seq}, continuing to next chunk`);
        return false;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]));
    }
  }

  return false;
}

/**
 * Finalize call when end marker is detected.
 */
async function finalizeCall(callId: string): Promise<void> {
  try {
    console.info(`[ingest] Finalizing call callId=${callId}`);
    const endUrl = 'http://localhost:3000/api/calls/end';
    const response = await fetch(endUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to finalize call: ${response.statusText}`);
    }

    console.info(`[ingest] Call finalized successfully callId=${callId}`);
  } catch (err) {
    console.error(`[ingest] Error finalizing call:`, err);
  }
}
