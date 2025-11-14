/**
 * Enhanced test script for ElevenLabs Speech-to-Text with simulated audio chunks
 * Allows testing with custom audio chunks, different sample rates, and chunk sizes
 * 
 * Usage:
 *   ELEVENLABS_API_KEY=your_api_key ts-node scripts/test-elevenlabs-simulate.ts [options]
 * 
 * Options:
 *   --mode=interactive    - Interactive mode: send chunks manually
 *   --mode=auto          - Auto mode: send chunks automatically (default)
 *   --sample-rate=8000   - Sample rate in Hz (default: 8000)
 *   --chunk-size=250     - Chunk size in milliseconds (default: 250)
 *   --duration=5000      - Total duration in milliseconds for auto mode (default: 5000)
 *   --file=path.wav      - Use audio file instead of generated audio
 *   --silence            - Send silence chunks (for testing empty transcript handling)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ElevenLabsProvider } from '../src/providers/elevenlabsProvider';
import { Transcript } from '../src/types';

const execAsync = promisify(exec);

interface TestOptions {
  mode: 'interactive' | 'auto';
  sampleRate: number;
  chunkSizeMs: number;
  durationMs: number;
  audioFile?: string;
  silence: boolean;
  interactionId: string;
}

// Parse command line arguments
function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  const options: TestOptions = {
    mode: 'auto',
    sampleRate: 8000,
    chunkSizeMs: 250,
    durationMs: 5000,
    silence: false,
    interactionId: `test-${Date.now()}`,
  };

  for (const arg of args) {
    if (arg.startsWith('--mode=')) {
      const mode = arg.split('=')[1];
      if (mode === 'interactive' || mode === 'auto') {
        options.mode = mode;
      }
    } else if (arg.startsWith('--sample-rate=')) {
      options.sampleRate = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--chunk-size=')) {
      options.chunkSizeMs = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--duration=')) {
      options.durationMs = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--file=')) {
      options.audioFile = arg.split('=')[1];
    } else if (arg === '--silence') {
      options.silence = true;
    } else if (arg.startsWith('--interaction-id=')) {
      options.interactionId = arg.split('=')[1];
    }
  }

  return options;
}

// Generate test audio (sine wave)
function generateSineWave(durationMs: number, sampleRate: number, frequency: number): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.allocUnsafe(samples * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(int16Sample, i * 2);
  }

  return buffer;
}

// Generate silence
function generateSilence(durationMs: number, sampleRate: number): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  return Buffer.alloc(samples * 2); // All zeros
}

// Generate speech-like audio (multiple frequencies)
function generateSpeechLike(durationMs: number, sampleRate: number): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.allocUnsafe(samples * 2);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    // Mix multiple frequencies to simulate speech
    const sample = 
      Math.sin(2 * Math.PI * 200 * t) * 0.3 +  // Low frequency
      Math.sin(2 * Math.PI * 500 * t) * 0.4 +  // Mid frequency
      Math.sin(2 * Math.PI * 1000 * t) * 0.2 + // High frequency
      Math.sin(2 * Math.PI * 2000 * t) * 0.1;  // Very high frequency
    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(sample * 16383))); // Lower amplitude
    buffer.writeInt16LE(int16Sample, i * 2);
  }

  return buffer;
}

// Convert MP3 to PCM16 WAV using ffmpeg
async function convertMp3ToWav(mp3Path: string, outputPath: string, sampleRate: number = 8000): Promise<void> {
  // Try to find ffmpeg - first try the installed package, then system
  let ffmpegCmd: string | null = null;
  
  // Try @ffmpeg-installer/ffmpeg package first
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller && ffmpegInstaller.path) {
      ffmpegCmd = ffmpegInstaller.path;
    }
  } catch {
    // Package not available, try system ffmpeg
  }
  
  // Try system ffmpeg
  if (!ffmpegCmd) {
    try {
      await execAsync('which ffmpeg');
      ffmpegCmd = 'ffmpeg';
    } catch {
      // Try alternative locations
      const alternatives = ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'];
      for (const alt of alternatives) {
        if (fs.existsSync(alt)) {
          ffmpegCmd = alt;
          break;
        }
      }
    }
  }
  
  if (!ffmpegCmd) {
    throw new Error(
      'ffmpeg not found. Please install ffmpeg:\n' +
      '  macOS: brew install ffmpeg\n' +
      '  Linux: apt-get install ffmpeg or yum install ffmpeg\n' +
      '  Or run: npm install --save-dev @ffmpeg-installer/ffmpeg\n' +
      '  Or download from https://ffmpeg.org/download.html'
    );
  }

  // Convert MP3 to PCM16 WAV
  // -f wav: WAV format
  // -ar <rate>: Sample rate
  // -ac 1: Mono channel
  // -acodec pcm_s16le: PCM 16-bit little-endian
  const command = `${ffmpegCmd} -i "${mp3Path}" -f wav -ar ${sampleRate} -ac 1 -acodec pcm_s16le -y "${outputPath}"`;
  
  try {
    await execAsync(command);
    console.log(`✅ Converted MP3 to WAV: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to convert MP3: ${error.message}`);
  }
}

// Read audio file (supports WAV and MP3)
async function readAudioFile(filePath: string, targetSampleRate?: number): Promise<{ audio: Buffer; sampleRate: number }> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  let wavPath = filePath;
  let tempFile = false;

  // Convert MP3 to WAV if needed
  if (ext === '.mp3') {
    const tempDir = require('os').tmpdir();
    wavPath = path.join(tempDir, `temp_${Date.now()}.wav`);
    tempFile = true;
    const sampleRate = targetSampleRate || 8000;
    console.log(`🔄 Converting MP3 to WAV (${sampleRate}Hz)...`);
    await convertMp3ToWav(filePath, wavPath, sampleRate);
  }

  try {
    const buffer = fs.readFileSync(wavPath);
    
    // Simple WAV parser
    const sampleRate = buffer.readUInt32LE(24);
    const dataOffset = 44; // Standard WAV header size
    const audioData = buffer.slice(dataOffset);
    
    // Clean up temp file if created
    if (tempFile && fs.existsSync(wavPath)) {
      fs.unlinkSync(wavPath);
    }
    
    return { audio: audioData, sampleRate };
  } catch (error: any) {
    // Clean up temp file on error
    if (tempFile && fs.existsSync(wavPath)) {
      try {
        fs.unlinkSync(wavPath);
      } catch {}
    }
    throw new Error(`Failed to read audio file: ${error.message}`);
  }
}

// Split audio into chunks
function splitIntoChunks(audio: Buffer, sampleRate: number, chunkSizeMs: number): Buffer[] {
  const bytesPerSample = 2; // 16-bit = 2 bytes
  const bytesPerChunk = Math.floor((chunkSizeMs / 1000) * sampleRate * bytesPerSample);
  const chunks: Buffer[] = [];

  for (let offset = 0; offset < audio.length; offset += bytesPerChunk) {
    const chunk = audio.slice(offset, offset + bytesPerChunk);
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  return chunks;
}

// Auto mode: send chunks automatically
async function runAutoMode(provider: ElevenLabsProvider, options: TestOptions) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🤖 AUTO MODE: Sending audio chunks automatically');
  console.log(`${'='.repeat(80)}`);
  console.log(`Interaction ID: ${options.interactionId}`);
  console.log(`Sample Rate: ${options.sampleRate} Hz`);
  console.log(`Chunk Size: ${options.chunkSizeMs} ms`);
  console.log(`Duration: ${options.durationMs} ms`);
  console.log(`Mode: ${options.silence ? 'SILENCE' : 'SPEECH-LIKE'}`);
  console.log(`${'='.repeat(80)}\n`);

  let audio: Buffer;
  if (options.audioFile) {
    const fileData = await readAudioFile(options.audioFile, options.sampleRate);
    audio = fileData.audio;
    options.sampleRate = fileData.sampleRate; // Use file's sample rate
    console.log(`📁 Loaded audio file: ${options.audioFile}`);
    console.log(`   Sample rate: ${fileData.sampleRate} Hz`);
    console.log(`   Duration: ${(audio.length / (fileData.sampleRate * 2)).toFixed(2)}s\n`);
  } else if (options.silence) {
    audio = generateSilence(options.durationMs, options.sampleRate);
    console.log(`🔇 Generated silence audio\n`);
  } else {
    audio = generateSpeechLike(options.durationMs, options.sampleRate);
    console.log(`🎵 Generated speech-like audio\n`);
  }

  const chunks = splitIntoChunks(audio, options.sampleRate, options.chunkSizeMs);
  console.log(`📦 Split into ${chunks.length} chunks\n`);
  
  // Limit number of chunks for testing (max 60 seconds of audio)
  const maxChunks = Math.min(chunks.length, Math.floor(60000 / options.chunkSizeMs));
  if (chunks.length > maxChunks) {
    console.log(`⚠️  Limiting test to first ${maxChunks} chunks (${(maxChunks * options.chunkSizeMs / 1000).toFixed(1)}s) for faster testing\n`);
  }
  const chunksToProcess = chunks.slice(0, maxChunks);

  const transcripts: Transcript[] = [];
  let seq = 1;
  const pendingPromises: Promise<void>[] = [];

  // Send chunks with minimal delay (don't wait for responses)
  for (const chunk of chunksToProcess) {
    const durationMs = (chunk.length / 2 / options.sampleRate) * 1000;
    
    // Send chunk without waiting (fire and forget for sending)
    const sendPromise = (async () => {
      try {
        const startTime = Date.now();
        const transcript = await provider.sendAudioChunk(chunk, {
          interactionId: options.interactionId,
          seq,
          sampleRate: options.sampleRate,
        });
        const latency = Date.now() - startTime;

        transcripts.push(transcript);

        if (transcript.text.trim()) {
          console.log(`   ✅ [${seq}] [${transcript.type.toUpperCase()}] ${transcript.text}`);
          if (transcript.confidence) {
            console.log(`      Confidence: ${(transcript.confidence * 100).toFixed(1)}%, Latency: ${latency}ms`);
          } else {
            console.log(`      Latency: ${latency}ms`);
          }
        } else if (seq <= 10 || seq % 20 === 0) {
          // Only log empty transcripts for first 10 or every 20th chunk
          console.log(`   ⚠️  [${seq}] Empty transcript (latency: ${latency}ms)`);
        }
      } catch (error: any) {
        console.error(`   ❌ [${seq}] Error: ${error.message}`);
      }
    })();
    
    pendingPromises.push(sendPromise);
    
    // Log sending (only for first few or periodically)
    if (seq <= 10 || seq % 20 === 0) {
      console.log(`📤 [${seq}] Sending chunk: ${durationMs.toFixed(1)}ms, ${chunk.length} bytes`);
    }

    // Small delay between sends to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, Math.max(50, options.chunkSizeMs / 5)));
    seq++;
  }
  
  // Wait for all pending transcript responses
  console.log(`\n⏳ Waiting for ${pendingPromises.length} transcript responses...\n`);
  await Promise.all(pendingPromises);

  // Wait for final transcripts
  console.log('⏳ Waiting for final transcripts...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Summary
  printSummary(transcripts, seq - 1);
}

// Interactive mode: send chunks manually
async function runInteractiveMode(provider: ElevenLabsProvider, options: TestOptions) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('👤 INTERACTIVE MODE: Send audio chunks manually');
  console.log(`${'='.repeat(80)}`);
  console.log(`Interaction ID: ${options.interactionId}`);
  console.log(`Sample Rate: ${options.sampleRate} Hz`);
  console.log(`Chunk Size: ${options.chunkSizeMs} ms`);
  console.log(`${'='.repeat(80)}\n`);
  console.log('Commands:');
  console.log('  send [duration_ms] [frequency] - Send a sine wave chunk');
  console.log('  speech [duration_ms]          - Send speech-like audio chunk');
  console.log('  silence [duration_ms]         - Send silence chunk');
  console.log('  file <path>                   - Load and send chunks from file');
  console.log('  status                         - Show connection status');
  console.log('  quit                           - Exit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let seq = 1;
  const transcripts: Transcript[] = [];

  const prompt = () => {
    rl.question('> ', async (input) => {
      const parts = input.trim().split(/\s+/);
      const command = parts[0]?.toLowerCase();

      if (command === 'quit' || command === 'exit' || command === 'q') {
        printSummary(transcripts, seq - 1);
        rl.close();
        return;
      }

      try {
        if (command === 'send') {
          const durationMs = parseInt(parts[1] || '250', 10);
          const frequency = parseInt(parts[2] || '440', 10);
          const chunk = generateSineWave(durationMs, options.sampleRate, frequency);
          await sendChunk(provider, chunk, options, seq++, transcripts);
        } else if (command === 'speech') {
          const durationMs = parseInt(parts[1] || '250', 10);
          const chunk = generateSpeechLike(durationMs, options.sampleRate);
          await sendChunk(provider, chunk, options, seq++, transcripts);
        } else if (command === 'silence') {
          const durationMs = parseInt(parts[1] || '250', 10);
          const chunk = generateSilence(durationMs, options.sampleRate);
          await sendChunk(provider, chunk, options, seq++, transcripts);
        } else if (command === 'file') {
          const filePath = parts[1];
          if (!filePath) {
            console.log('❌ Please provide a file path');
            prompt();
            return;
          }
          try {
            const fileData = await readAudioFile(filePath, options.sampleRate);
            const chunks = splitIntoChunks(fileData.audio, fileData.sampleRate, options.chunkSizeMs);
            console.log(`📁 Loaded ${chunks.length} chunks from file\n`);
            for (const chunk of chunks) {
              await sendChunk(provider, chunk, { ...options, sampleRate: fileData.sampleRate }, seq++, transcripts);
              await new Promise(resolve => setTimeout(resolve, options.chunkSizeMs));
            }
          } catch (error: any) {
            console.error(`❌ Error loading file: ${error.message}\n`);
          }
        } else if (command === 'status') {
          console.log(`\n📊 Status:`);
          console.log(`   Sequence: ${seq - 1}`);
          console.log(`   Transcripts received: ${transcripts.length}`);
          console.log(`   Non-empty transcripts: ${transcripts.filter(t => t.text.trim()).length}\n`);
        } else if (command === 'help' || command === 'h') {
          console.log('\nCommands:');
          console.log('  send [duration_ms] [frequency] - Send a sine wave chunk');
          console.log('  speech [duration_ms]          - Send speech-like audio chunk');
          console.log('  silence [duration_ms]          - Send silence chunk');
          console.log('  file <path>                   - Load and send chunks from file');
          console.log('  status                         - Show connection status');
          console.log('  quit                           - Exit\n');
        } else {
          console.log(`❌ Unknown command: ${command}. Type 'help' for commands.\n`);
        }
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}\n`);
      }

      prompt();
    });
  };

  prompt();
}

async function sendChunk(
  provider: ElevenLabsProvider,
  chunk: Buffer,
  options: TestOptions,
  seq: number,
  transcripts: Transcript[]
) {
  const durationMs = (chunk.length / 2 / options.sampleRate) * 1000;
  console.log(`📤 [${seq}] Sending chunk: ${durationMs.toFixed(1)}ms, ${chunk.length} bytes`);

  try {
    const startTime = Date.now();
    const transcript = await provider.sendAudioChunk(chunk, {
      interactionId: options.interactionId,
      seq,
      sampleRate: options.sampleRate,
    });
    const latency = Date.now() - startTime;

    transcripts.push(transcript);

    if (transcript.text.trim()) {
      console.log(`   ✅ [${transcript.type.toUpperCase()}] ${transcript.text}`);
      if (transcript.confidence) {
        console.log(`      Confidence: ${(transcript.confidence * 100).toFixed(1)}%`);
      }
      console.log(`      Latency: ${latency}ms\n`);
    } else {
      console.log(`   ⚠️  Empty transcript (latency: ${latency}ms)\n`);
    }
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }
}

function printSummary(transcripts: Transcript[], totalChunks: number) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 Test Summary');
  console.log(`${'='.repeat(80)}`);
  console.log(`Total chunks sent: ${totalChunks}`);
  console.log(`Total transcripts received: ${transcripts.length}`);
  console.log(`Final transcripts: ${transcripts.filter(t => t.isFinal).length}`);
  console.log(`Partial transcripts: ${transcripts.filter(t => !t.isFinal).length}`);
  console.log(`Empty transcripts: ${transcripts.filter(t => !t.text.trim()).length}`);
  console.log(`Non-empty transcripts: ${transcripts.filter(t => t.text.trim()).length}`);
  console.log(`${'='.repeat(80)}\n`);

  const nonEmptyTranscripts = transcripts.filter(t => t.text.trim());
  if (nonEmptyTranscripts.length > 0) {
    console.log('📝 All non-empty transcripts:');
    nonEmptyTranscripts.forEach((t, i) => {
      const confidence = t.confidence ? ` (${(t.confidence * 100).toFixed(1)}%)` : '';
      console.log(`  ${i + 1}. [${t.type.toUpperCase()}]${confidence} ${t.text}`);
    });
    console.log();
  }
}

// Main
async function main() {
  const options = parseArgs();

  // Check for API key
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY is required');
    console.error('   Set ELEVENLABS_API_KEY=your_api_key');
    process.exit(1);
  }

  const provider = new ElevenLabsProvider(process.env.ELEVENLABS_API_KEY);

  try {
    if (options.mode === 'interactive') {
      await runInteractiveMode(provider, options);
    } else {
      await runAutoMode(provider, options);
    }
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await provider.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

