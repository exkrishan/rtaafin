/**
 * Audio Dumper Utility
 * 
 * Dumps audio chunks received from Exotel to files for debugging and analysis.
 * Files are organized by interaction_id/call_sid and saved as WAV files.
 * 
 * Environment Variables:
 * - AUDIO_DUMP_ENABLED: Enable audio dumping (default: false)
 * - AUDIO_DUMP_DIR: Directory to save audio files (default: ./audio-dumps)
 * - AUDIO_DUMP_FORMAT: Format to save ('wav' or 'raw') (default: 'wav')
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { uploadToGoogleDrive } from './google-drive-uploader';

interface AudioDumpConfig {
  enabled: boolean;
  dumpDir: string;
  format: 'wav' | 'raw';
}

let config: AudioDumpConfig | null = null;

/**
 * Initialize audio dumper configuration
 */
function getConfig(): AudioDumpConfig {
  if (config) return config;

  const enabled = process.env.AUDIO_DUMP_ENABLED === 'true';
  const dumpDir = process.env.AUDIO_DUMP_DIR || './audio-dumps';
  const format = (process.env.AUDIO_DUMP_FORMAT || 'wav') as 'wav' | 'raw';

  config = {
    enabled,
    dumpDir,
    format,
  };

  if (enabled) {
    console.info('[audio-dumper] Audio dumping enabled', {
      dump_dir: dumpDir,
      format,
    });
  }

  return config;
}

/**
 * Create WAV file header for PCM16 audio
 */
function createWavHeader(dataLength: number, sampleRate: number, channels: number = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2; // 2 bytes per sample (16-bit)
  const blockAlign = channels * 2;
  const fileSize = dataLength + 36; // 36 = header size - 8

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  return header;
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
 * Dump audio chunk to file
 * 
 * @param interactionId - Interaction/call ID
 * @param seq - Sequence number
 * @param audioData - PCM16 audio buffer
 * @param sampleRate - Sample rate in Hz
 * @param encoding - Audio encoding (default: 'pcm16')
 */
export async function dumpAudioChunk(
  interactionId: string,
  seq: number,
  audioData: Buffer,
  sampleRate: number,
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
      filePath = join(interactionDir, `chunk-${seq.toString().padStart(6, '0')}.wav`);
    } else {
      // Save raw PCM16
      fileData = audioData;
      filePath = join(interactionDir, `chunk-${seq.toString().padStart(6, '0')}.pcm`);
    }

    // Write file
    await writeFile(filePath, fileData);

    // Upload to Google Drive if enabled
    uploadToGoogleDrive(
      interactionId,
      basename(filePath),
      filePath,
      cfg.format === 'wav' ? 'audio/wav' : 'application/octet-stream'
    ).catch((err) => {
      // Non-critical - don't block processing
      // Log errors for first few chunks to help debug
      if (seq <= 3) {
        console.error('[audio-dumper] Google Drive upload failed (non-critical)', {
          interaction_id: interactionId,
          seq,
          file_name: basename(filePath),
          error: err.message,
          error_stack: err.stack?.substring(0, 200),
        });
      } else {
        console.debug('[audio-dumper] Google Drive upload failed (non-critical)', { error: err.message });
      }
    });

    // Log first few chunks and every 100th chunk
    if (seq <= 3 || seq % 100 === 0) {
      console.info('[audio-dumper] 💾 Dumped audio chunk', {
        interaction_id: interactionId,
        seq,
        file_path: filePath,
        size_bytes: audioData.length,
        sample_rate: sampleRate,
        format: cfg.format,
        duration_ms: Math.round((audioData.length / (sampleRate * 2)) * 1000), // 2 bytes per sample
      });
    }
  } catch (error: any) {
    // Don't throw - audio dumping is non-critical
    console.error('[audio-dumper] Failed to dump audio chunk', {
      interaction_id: interactionId,
      seq,
      error: error.message,
    });
  }
}

/**
 * Create a combined WAV file from all chunks for an interaction
 * This can be called after the call ends to create a single playable file
 */
export async function combineAudioChunks(
  interactionId: string,
  sampleRate: number
): Promise<string | null> {
  const cfg = getConfig();
  
  if (!cfg.enabled) {
    return null;
  }

  try {
    const { readdir, readFile, unlink } = await import('fs/promises');
    const sanitizedId = interactionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const interactionDir = join(cfg.dumpDir, sanitizedId);

    if (!existsSync(interactionDir)) {
      return null;
    }

    // Read all chunk files
    const files = await readdir(interactionDir);
    const chunkFiles = files
      .filter(f => f.startsWith('chunk-') && (f.endsWith('.wav') || f.endsWith('.pcm')))
      .map(f => {
        const match = f.match(/chunk-(\d+)\.(wav|pcm)/);
        if (!match) return null;
        return {
          file: f,
          seq: parseInt(match[1], 10),
          path: join(interactionDir, f),
        };
      })
      .filter((f): f is { file: string; seq: number; path: string } => f !== null)
      .sort((a, b) => a.seq - b.seq);

    if (chunkFiles.length === 0) {
      return null;
    }

    // Combine all audio data
    const audioChunks: Buffer[] = [];
    for (const chunkFile of chunkFiles) {
      const data = await readFile(chunkFile.path);
      
      if (cfg.format === 'wav') {
        // Extract audio data from WAV (skip 44-byte header)
        if (data.length > 44) {
          audioChunks.push(data.slice(44));
        }
      } else {
        // Raw PCM16
        audioChunks.push(data);
      }
    }

    const combinedAudio = Buffer.concat(audioChunks);
    
    // Create combined WAV file
    const header = createWavHeader(combinedAudio.length, sampleRate);
    const combinedWav = Buffer.concat([header, combinedAudio]);
    const outputPath = join(interactionDir, `combined-${sanitizedId}.wav`);
    
    await writeFile(outputPath, combinedWav);

    console.info('[audio-dumper] ✅ Combined audio chunks', {
      interaction_id: interactionId,
      output_path: outputPath,
      chunks_combined: chunkFiles.length,
      total_duration_ms: Math.round((combinedAudio.length / (sampleRate * 2)) * 1000),
    });

    return outputPath;
  } catch (error: any) {
    console.error('[audio-dumper] Failed to combine audio chunks', {
      interaction_id: interactionId,
      error: error.message,
    });
    return null;
  }
}

