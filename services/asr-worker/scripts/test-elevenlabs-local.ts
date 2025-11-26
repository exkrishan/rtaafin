/**
 * Standalone test script for ElevenLabs Speech-to-Text
 * Tests the ElevenLabsProvider without Redis/pubsub dependencies
 * 
 * Usage:
 *   ELEVENLABS_API_KEY=your_api_key \
 *   ASR_PROVIDER=elevenlabs \
 *   ts-node scripts/test-elevenlabs-local.ts [audio-file.wav]
 */

import * as fs from 'fs';
import * as path from 'path';
import { ElevenLabsProvider } from '../src/providers/elevenlabsProvider';
import { Transcript } from '../src/types';

// Generate test audio (sine wave) if no file provided
function generateTestAudio(durationMs: number, sampleRate: number, frequency: number): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.allocUnsafe(samples * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    
    // Write as little-endian 16-bit signed integer
    buffer.writeInt16LE(int16Sample, i * 2);
  }

  return buffer;
}

// Read audio file (assumes PCM16 WAV format)
function readAudioFile(filePath: string): { audio: Buffer; sampleRate: number } {
  const buffer = fs.readFileSync(filePath);
  
  // Simple WAV parser (assumes standard WAV format)
  // For production, use a proper WAV parser library
  const sampleRate = buffer.readUInt32LE(24);
  const dataOffset = 44; // Standard WAV header size
  const audioData = buffer.slice(dataOffset);
  
  return { audio: audioData, sampleRate };
}

async function testWithAudioFile(filePath: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎤 Testing ElevenLabs Speech-to-Text with audio file');
  console.log(`📁 File: ${filePath}`);
  console.log(`${'='.repeat(80)}\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const { audio, sampleRate } = readAudioFile(filePath);
  console.log(`📊 Audio info:`, {
    size: `${(audio.length / 1024).toFixed(2)} KB`,
    sampleRate: `${sampleRate} Hz`,
    duration: `${(audio.length / (sampleRate * 2)).toFixed(2)}s`,
  });

  // CRITICAL: Warn if using 8kHz (testing showed 0% transcription success)
  if (sampleRate === 8000) {
    console.warn(`\n⚠️  WARNING: Audio file is 8kHz`);
    console.warn(`   Testing showed 0% transcription success at 8kHz`);
    console.warn(`   Recommendation: Use 16kHz audio for better results`);
    console.warn(`   ElevenLabs works best with 16kHz sample rate\n`);
  } else if (sampleRate === 16000) {
    console.log(`✅ Using 16kHz sample rate (optimal for ElevenLabs)\n`);
  }

  await testProvider(audio, sampleRate, 'file-test');
}

async function testWithGeneratedAudio() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎤 Testing ElevenLabs Speech-to-Text with generated test audio');
  console.log(`${'='.repeat(80)}\n`);

  // CRITICAL FIX: Use 16kHz instead of 8kHz (8kHz has 0% transcription success)
  const sampleRate = 16000;
  const durationMs = 10000; // 10 seconds (enough for testing)
  const frequency = 440; // A4 note

  console.log(`📊 Generating test audio:`, {
    duration: `${durationMs}ms`,
    sampleRate: `${sampleRate} Hz (16kHz - optimal for ElevenLabs)`,
    frequency: `${frequency} Hz`,
    note: 'Using 16kHz as 8kHz produces 0% transcription success',
  });

  const audio = generateTestAudio(durationMs, sampleRate, frequency);
  await testProvider(audio, sampleRate, 'generated-test');
}

async function testProvider(audio: Buffer, sampleRate: number, interactionId: string) {
  // Check for API key
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY is required');
    console.error('   Set ELEVENLABS_API_KEY=your_api_key');
    process.exit(1);
  }

  const provider = new ElevenLabsProvider(process.env.ELEVENLABS_API_KEY);

  try {
    console.log('🚀 Starting transcription...\n');
    console.log('📋 Chunking strategy:');
    console.log('   - First chunk: 2000ms (ElevenLabs requires 2 seconds minimum)');
    console.log('   - Subsequent chunks: 500ms (optimal for continuous streaming)');
    console.log('');

    // CRITICAL FIX: ElevenLabs requires 2 seconds of audio before transcription starts
    // Per our fixes: MIN_INITIAL_CHUNK_DURATION_MS = 2000ms, MIN_CONTINUOUS_CHUNK_DURATION_MS = 500ms
    const MIN_INITIAL_CHUNK_DURATION_MS = 2000; // ElevenLabs requirement
    const MIN_CONTINUOUS_CHUNK_DURATION_MS = 500; // Optimal for continuous streaming
    const bytesPerSample = 2; // 16-bit = 2 bytes per sample
    
    // Calculate bytes needed for initial chunk (2 seconds)
    const bytesPerInitialChunk = Math.floor((MIN_INITIAL_CHUNK_DURATION_MS / 1000) * sampleRate * bytesPerSample);
    // Calculate bytes needed for continuous chunks (500ms)
    const bytesPerContinuousChunk = Math.floor((MIN_CONTINUOUS_CHUNK_DURATION_MS / 1000) * sampleRate * bytesPerSample);

    const transcripts: Transcript[] = [];
    let seq = 1;
    let offset = 0;
    let hasSentInitialChunk = false;

    // Process audio in chunks
    while (offset < audio.length) {
      // Determine chunk size based on whether we've sent initial chunk
      const chunkSizeBytes = hasSentInitialChunk ? bytesPerContinuousChunk : bytesPerInitialChunk;
      const chunkSizeMs = hasSentInitialChunk ? MIN_CONTINUOUS_CHUNK_DURATION_MS : MIN_INITIAL_CHUNK_DURATION_MS;
      
      // Get chunk
      const chunk = audio.slice(offset, offset + chunkSizeBytes);
      if (chunk.length === 0) break;

      const durationMs = (chunk.length / bytesPerSample / sampleRate) * 1000;
      const chunkType = hasSentInitialChunk ? 'continuous' : 'initial';
      console.log(`📤 Sending chunk ${seq} (${chunkType}, ${durationMs.toFixed(0)}ms, ${chunk.length} bytes)...`);

      try {
        const transcript = await provider.sendAudioChunk(chunk, {
          interactionId,
          seq,
          sampleRate,
        });

        transcripts.push(transcript);

        if (transcript.text.trim()) {
          console.log(`📝 Transcript (${transcript.type}):`, {
            text: transcript.text,
            confidence: transcript.confidence?.toFixed(2),
            isFinal: transcript.isFinal,
          });
        } else {
          console.log(`   (empty transcript)`);
        }

        // Mark initial chunk as sent
        if (!hasSentInitialChunk) {
          hasSentInitialChunk = true;
          console.log(`   ✅ Initial chunk sent - ElevenLabs can now start transcription`);
        }

        // Small delay between chunks to simulate real-time
        await new Promise(resolve => setTimeout(resolve, chunkSizeMs));
      } catch (error: any) {
        console.error(`❌ Error processing chunk ${seq}:`, error.message);
      }

      offset += chunkSizeBytes;
      seq++;
    }

    // Wait for final transcripts
    console.log('\n⏳ Waiting for final transcripts...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 Test Summary');
    console.log(`${'='.repeat(80)}`);
    console.log(`Total chunks sent: ${seq - 1}`);
    console.log(`Total transcripts received: ${transcripts.length}`);
    console.log(`Final transcripts: ${transcripts.filter(t => t.isFinal).length}`);
    console.log(`Partial transcripts: ${transcripts.filter(t => !t.isFinal).length}`);
    console.log(`Empty transcripts: ${transcripts.filter(t => !t.text.trim()).length}`);
    console.log(`${'='.repeat(80)}\n`);

    // Show all non-empty transcripts
    const nonEmptyTranscripts = transcripts.filter(t => t.text.trim());
    if (nonEmptyTranscripts.length > 0) {
      console.log('📝 Non-empty transcripts:');
      nonEmptyTranscripts.forEach((t, i) => {
        console.log(`  ${i + 1}. [${t.type.toUpperCase()}] ${t.text}`);
      });
      console.log();
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await provider.close();
  }
}

// Main
async function main() {
  const audioFile = process.argv[2];

  if (audioFile) {
    await testWithAudioFile(audioFile);
  } else {
    await testWithGeneratedAudio();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});




