/**
 * Integration test script for Google Cloud Speech-to-Text
 * Tests GoogleSpeechProvider within ASR worker context
 * Simulates audio frames and verifies transcript publishing
 * 
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
 *   ASR_PROVIDER=google \
 *   ts-node scripts/test-google-speech-integration.ts [audio-file.wav]
 */

import * as fs from 'fs';
import { GoogleSpeechProvider } from '../src/providers/googleSpeechProvider';
import { Transcript } from '../src/types';

// Simple WAV parser (for testing)
function readAudioFile(filePath: string): { audio: Buffer; sampleRate: number } {
  const buffer = fs.readFileSync(filePath);
  const sampleRate = buffer.readUInt32LE(24);
  const dataOffset = 44;
  const audioData = buffer.slice(dataOffset);
  return { audio: audioData, sampleRate };
}

// Generate test audio
function generateTestAudio(durationMs: number, sampleRate: number, frequency: number): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.allocUnsafe(samples * 2);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(int16Sample, i * 2);
  }

  return buffer;
}

// Simulate audio frame message
interface SimulatedAudioFrame {
  tenant_id: string;
  interaction_id: string;
  seq: number;
  timestamp_ms: number;
  sample_rate: number;
  encoding: 'pcm16';
  audio: string; // base64
}

function createAudioFrame(
  audio: Buffer,
  interactionId: string,
  seq: number,
  sampleRate: number
): SimulatedAudioFrame {
  return {
    tenant_id: 'test-tenant',
    interaction_id: interactionId,
    seq,
    timestamp_ms: Date.now(),
    sample_rate: sampleRate,
    encoding: 'pcm16',
    audio: audio.toString('base64'),
  };
}

async function testIntegration(audio: Buffer, sampleRate: number, interactionId: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🔧 Integration Test: Google Cloud Speech-to-Text');
  console.log(`${'='.repeat(80)}\n`);

  // Check for credentials
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT_ID is required');
    process.exit(1);
  }

  const provider = new GoogleSpeechProvider();

  try {
    console.log('🚀 Starting integration test...\n');

    // Simulate audio frames (like from Redis stream)
    const chunkSizeMs = 250;
    const bytesPerSample = 2;
    const samplesPerChunk = Math.floor((chunkSizeMs / 1000) * sampleRate);
    const bytesPerChunk = samplesPerChunk * bytesPerSample;

    const transcripts: Transcript[] = [];
    let seq = 1;

    // Process audio in chunks
    for (let offset = 0; offset < audio.length; offset += bytesPerChunk) {
      const chunk = audio.slice(offset, offset + bytesPerChunk);
      if (chunk.length === 0) break;

      // Simulate audio frame message
      const frame = createAudioFrame(chunk, interactionId, seq, sampleRate);
      
      // Decode audio from base64 (simulating what ASR worker does)
      const audioBuffer = Buffer.from(frame.audio, 'base64');

      console.log(`📥 Processing frame ${seq} (${frame.audio.length} bytes base64, ${audioBuffer.length} bytes audio)...`);

      try {
        // Send to provider (simulating ASR worker behavior)
        const transcript = await provider.sendAudioChunk(audioBuffer, {
          interactionId: frame.interaction_id,
          seq: frame.seq,
          sampleRate: frame.sample_rate,
        });

        transcripts.push(transcript);

        // Simulate transcript publishing (what ASR worker does)
        const transcriptMessage = {
          interaction_id: frame.interaction_id,
          tenant_id: frame.tenant_id,
          seq: frame.seq,
          type: transcript.type,
          text: transcript.text,
          confidence: transcript.confidence,
          timestamp_ms: Date.now(),
        };

        if (transcript.text.trim()) {
          console.log(`📤 Published transcript:`, {
            seq: transcriptMessage.seq,
            type: transcriptMessage.type,
            text: transcriptMessage.text,
            confidence: transcriptMessage.confidence,
          });
        }

      } catch (error: any) {
        console.error(`❌ Error processing frame ${seq}:`, error.message);
      }

      seq++;
      await new Promise(resolve => setTimeout(resolve, chunkSizeMs));
    }

    // Wait for final transcripts
    console.log('\n⏳ Waiting for final transcripts...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 Integration Test Summary');
    console.log(`${'='.repeat(80)}`);
    console.log(`Frames processed: ${seq - 1}`);
    console.log(`Transcripts received: ${transcripts.length}`);
    
    const finalTranscripts = transcripts.filter(t => t.isFinal && t.text.trim());
    const partialTranscripts = transcripts.filter(t => !t.isFinal && t.text.trim());
    
    console.log(`Final transcripts: ${finalTranscripts.length}`);
    console.log(`Partial transcripts: ${partialTranscripts.length}`);

    if (finalTranscripts.length > 0) {
      console.log(`\n✅ Test PASSED - Final transcripts received`);
      finalTranscripts.forEach((t, i) => {
        console.log(`   ${i + 1}. "${t.text}"`);
      });
    } else if (partialTranscripts.length > 0) {
      console.log(`\n⚠️  Test PARTIAL - Only partial transcripts received`);
      partialTranscripts.forEach((t, i) => {
        console.log(`   ${i + 1}. "${t.text}"`);
      });
    } else {
      console.log(`\n❌ Test FAILED - No transcripts received`);
    }

    console.log(`${'='.repeat(80)}\n`);

  } catch (error: any) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  } finally {
    await provider.close();
  }
}

async function main() {
  const audioFile = process.argv[2];
  const interactionId = `test-${Date.now()}`;

  let audio: Buffer;
  let sampleRate: number;

  if (audioFile) {
    if (!fs.existsSync(audioFile)) {
      console.error(`❌ File not found: ${audioFile}`);
      process.exit(1);
    }
    const result = readAudioFile(audioFile);
    audio = result.audio;
    sampleRate = result.sampleRate;
    console.log(`📁 Using audio file: ${audioFile}`);
  } else {
    audio = generateTestAudio(3000, 8000, 440);
    sampleRate = 8000;
    console.log(`🎵 Using generated test audio`);
  }

  await testIntegration(audio, sampleRate, interactionId);
}

main().catch(console.error);



