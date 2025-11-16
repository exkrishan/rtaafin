/**
 * Audio Dumper for ASR Worker
 * 
 * Dumps buffered audio chunks that are sent to ASR providers (e.g., ElevenLabs).
 * These are the actual chunks used for transcription, not the raw incoming chunks.
 * 
 * Environment Variables:
 * - ASR_AUDIO_DUMP_ENABLED: Enable audio dumping (default: false)
 * - ASR_AUDIO_DUMP_DIR: Directory to save audio files (default: ./asr-audio-dumps)
 * - ASR_AUDIO_DUMP_FORMAT: Format to save ('wav' or 'raw') (default: 'wav')
 * - GCS_ENABLED: Enable GCS uploads (default: false)
 * - GCS_BUCKET_NAME: GCS bucket name (required if GCS_ENABLED=true)
 * - GOOGLE_APPLICATION_CREDENTIALS_JSON: Service account JSON (for GCS)
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';

interface AudioDumpConfig {
  enabled: boolean;
  dumpDir: string;
  format: 'wav' | 'raw';
  gcsEnabled: boolean;
  gcsBucketName?: string;
  gcsCredentialsJson?: string;
}

let config: AudioDumpConfig | null = null;
let gcsClient: any = null;

/**
 * Initialize audio dumper configuration
 */
function getConfig(): AudioDumpConfig {
  if (config) return config;

  const enabled = process.env.ASR_AUDIO_DUMP_ENABLED === 'true';
  const dumpDir = process.env.ASR_AUDIO_DUMP_DIR || './asr-audio-dumps';
  const format = (process.env.ASR_AUDIO_DUMP_FORMAT || 'wav') as 'wav' | 'raw';
  const gcsEnabled = process.env.GCS_ENABLED === 'true';
  const gcsBucketName = process.env.GCS_BUCKET_NAME;
  const gcsCredentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  config = {
    enabled,
    dumpDir,
    format,
    gcsEnabled: gcsEnabled && !!gcsBucketName && !!gcsCredentialsJson,
    gcsBucketName,
    gcsCredentialsJson,
  };

  if (enabled) {
    console.info('[asr-audio-dumper] Audio dumping enabled', {
      dump_dir: dumpDir,
      format,
      gcs_enabled: config.gcsEnabled,
      gcs_bucket: gcsBucketName || 'not set',
    });
  }

  return config;
}

/**
 * Create WAV file header for PCM16 audio
 */
function createWavHeader(dataLength: number, sampleRate: number): Buffer {
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const fileSize = 36 + dataLength;

  const header = Buffer.alloc(44);
  let offset = 0;

  // RIFF header
  header.write('RIFF', offset); offset += 4;
  header.writeUInt32LE(fileSize, offset); offset += 4;
  header.write('WAVE', offset); offset += 4;

  // fmt chunk
  header.write('fmt ', offset); offset += 4;
  header.writeUInt32LE(16, offset); offset += 4; // fmt chunk size
  header.writeUInt16LE(1, offset); offset += 2; // audio format (1 = PCM)
  header.writeUInt16LE(numChannels, offset); offset += 2;
  header.writeUInt32LE(sampleRate, offset); offset += 4;
  header.writeUInt32LE(byteRate, offset); offset += 4;
  header.writeUInt16LE(blockAlign, offset); offset += 2;
  header.writeUInt16LE(bitsPerSample, offset); offset += 2;

  // data chunk
  header.write('data', offset); offset += 4;
  header.writeUInt32LE(dataLength, offset);

  return header;
}

/**
 * Initialize GCS client
 */
async function initializeGCSClient(): Promise<void> {
  if (gcsClient) return;

  const cfg = getConfig();
  if (!cfg.gcsEnabled || !cfg.gcsBucketName || !cfg.gcsCredentialsJson) {
    return;
  }

  try {
    const { Storage } = require('@google-cloud/storage');
    const credentials = JSON.parse(cfg.gcsCredentialsJson);
    
    gcsClient = new Storage({
      credentials,
      projectId: credentials.project_id,
    });

    console.info('[asr-audio-dumper] ✅ GCS client initialized', {
      bucket: cfg.gcsBucketName,
    });
  } catch (error: any) {
    console.error('[asr-audio-dumper] ❌ Failed to initialize GCS client:', error.message);
    config!.gcsEnabled = false;
  }
}

/**
 * Upload file to GCS
 */
async function uploadToGCS(
  interactionId: string,
  fileName: string,
  filePath: string,
  mimeType: string = 'audio/wav'
): Promise<void> {
  const cfg = getConfig();
  if (!cfg.gcsEnabled || !gcsClient || !cfg.gcsBucketName) {
    return;
  }

  try {
    const { readFile } = require('fs/promises');
    const fileContent = await readFile(filePath);
    const sanitizedId = interactionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectPath = `asr-buffered-chunks/${sanitizedId}/${fileName}`;

    const bucket = gcsClient.bucket(cfg.gcsBucketName);
    const file = bucket.file(objectPath);
    
    await file.save(fileContent, {
      metadata: {
        contentType: mimeType,
        metadata: {
          interactionId,
          source: 'asr-worker-buffered',
        },
      },
    });

    console.debug('[asr-audio-dumper] ✅ Uploaded to GCS', {
      interaction_id: interactionId,
      file_name: fileName,
      object_path: objectPath,
    });
  } catch (error: any) {
    console.debug('[asr-audio-dumper] GCS upload failed (non-critical)', {
      error: error.message,
    });
  }
}

/**
 * Ensure directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * Dump buffered audio chunk that will be sent to ASR provider
 * 
 * @param interactionId - Interaction/call ID
 * @param seq - Sequence number (from the buffered chunk)
 * @param audioData - PCM16 audio buffer (already buffered/combined)
 * @param sampleRate - Sample rate in Hz
 * @param chunkDurationMs - Duration of this buffered chunk in milliseconds
 */
export async function dumpBufferedAudioChunk(
  interactionId: string,
  seq: number,
  audioData: Buffer,
  sampleRate: number,
  chunkDurationMs: number,
  encoding: string = 'pcm16'
): Promise<void> {
  const cfg = getConfig();
  
  if (!cfg.enabled) {
    return;
  }

  try {
    // Sanitize interaction ID for filesystem
    const sanitizedId = interactionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const interactionDir = join(cfg.dumpDir, sanitizedId);
    
    // Ensure directory exists
    await ensureDir(interactionDir);

    let filePath: string;
    let fileData: Buffer;

    if (cfg.format === 'wav') {
      // Create WAV file with header
      const header = createWavHeader(audioData.length, sampleRate);
      fileData = Buffer.concat([header, audioData]);
      filePath = join(interactionDir, `buffered-chunk-${seq.toString().padStart(6, '0')}-${chunkDurationMs.toFixed(0)}ms.wav`);
    } else {
      // Save raw PCM16
      fileData = audioData;
      filePath = join(interactionDir, `buffered-chunk-${seq.toString().padStart(6, '0')}-${chunkDurationMs.toFixed(0)}ms.pcm`);
    }

    // Write file
    await writeFile(filePath, fileData);

    // Upload to GCS if enabled
    if (cfg.gcsEnabled) {
      if (!gcsClient) {
        await initializeGCSClient();
      }
      if (gcsClient) {
        uploadToGCS(
          interactionId,
          basename(filePath),
          filePath,
          cfg.format === 'wav' ? 'audio/wav' : 'application/octet-stream'
        ).catch(() => {
          // Non-critical - already logged in uploadToGCS
        });
      }
    }

    // Log first few chunks and every 50th chunk
    if (seq <= 3 || seq % 50 === 0) {
      console.info('[asr-audio-dumper] 💾 Dumped buffered audio chunk', {
        interaction_id: interactionId,
        seq,
        chunk_duration_ms: chunkDurationMs.toFixed(2),
        file_path: filePath,
        size_bytes: fileData.length,
        sample_rate: sampleRate,
        format: cfg.format,
        gcs_uploaded: cfg.gcsEnabled,
      });
    }
  } catch (error: any) {
    // Non-critical - don't block ASR processing
    console.debug('[asr-audio-dumper] Failed to dump audio chunk (non-critical)', {
      interaction_id: interactionId,
      seq,
      error: error.message,
    });
  }
}

