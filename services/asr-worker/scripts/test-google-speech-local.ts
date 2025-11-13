/**
 * Standalone test script for Google Cloud Speech-to-Text
 * Tests the GoogleSpeechProvider without Redis/pubsub dependencies
 * 
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json \
 *   ASR_PROVIDER=google \
 *   ts-node scripts/test-google-speech-local.ts [audio-file.wav]
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleSpeechProvider } from '../src/providers/googleSpeechProvider';
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
  console.log('🎤 Testing Google Cloud Speech-to-Text with audio file');
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

  await testProvider(audio, sampleRate, 'file-test');
}

async function testWithGeneratedAudio() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎤 Testing Google Cloud Speech-to-Text with generated test audio');
  console.log(`${'='.repeat(80)}\n`);

  const sampleRate = 8000;
  const durationMs = 3000; // 3 seconds
  const frequency = 440; // A4 note

  console.log(`📊 Generating test audio:`, {
    duration: `${durationMs}ms`,
    sampleRate: `${sampleRate} Hz`,
    frequency: `${frequency} Hz`,
  });

  const audio = generateTestAudio(durationMs, sampleRate, frequency);
  await testProvider(audio, sampleRate, 'generated-test');
}

async function testProvider(audio: Buffer, sampleRate: number, interactionId: string) {
  // Check for credentials
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT_ID) {
    console.error('❌ GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT_ID is required');
    console.error('   Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json');
    process.exit(1);
  }

  const provider = new GoogleSpeechProvider();

  try {
    console.log('🚀 Starting transcription...\n');

    // Split audio into chunks (simulate real-time streaming)
    const chunkSizeMs = 250; // 250ms chunks
    const bytesPerSample = 2; // 16-bit
    const samplesPerChunk = Math.floor((chunkSizeMs / 1000) * sampleRate);
    const bytesPerChunk = samplesPerChunk * bytesPerSample;

    let seq = 1;
    const transcripts: Transcript[] = [];

    // Send audio in chunks
    for (let offset = 0; offset < audio.length; offset += bytesPerChunk) {
      const chunk = audio.slice(offset, offset + bytesPerChunk);
      if (chunk.length === 0) break;

      const chunkDurationMs = (chunk.length / bytesPerSample / sampleRate) * 1000;
      
      console.log(`📤 Sending chunk ${seq} (${chunkDurationMs.toFixed(0)}ms, ${chunk.length} bytes)...`);

      try {
        const transcript = await provider.sendAudioChunk(chunk, {
          interactionId,
          seq,
          sampleRate,
        });

        transcripts.push(transcript);

        if (transcript.text.trim()) {
          console.log(`📝 [${transcript.isFinal ? 'FINAL' : 'PARTIAL'}] ${transcript.text}`);
          if (transcript.confidence) {
            console.log(`   Confidence: ${(transcript.confidence * 100).toFixed(1)}%`);
          }
        } else {
          console.log(`   (empty transcript)`);
        }
      } catch (error: any) {
        console.error(`❌ Error sending chunk ${seq}:`, error.message);
      }

      seq++;

      // Small delay between chunks to simulate real-time
      await new Promise(resolve => setTimeout(resolve, chunkDurationMs));
    }

    // Wait a bit for final transcripts
    console.log('\n⏳ Waiting for final transcripts...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Print summary
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 Test Summary');
    console.log(`${'='.repeat(80)}`);
    console.log(`Total chunks sent: ${seq - 1}`);
    console.log(`Total transcripts received: ${transcripts.length}`);
    
    const finalTranscripts = transcripts.filter(t => t.isFinal && t.text.trim());
    const partialTranscripts = transcripts.filter(t => !t.isFinal && t.text.trim());
    const emptyTranscripts = transcripts.filter(t => !t.text.trim());

    console.log(`Final transcripts: ${finalTranscripts.length}`);
    console.log(`Partial transcripts: ${partialTranscripts.length}`);
    console.log(`Empty transcripts: ${emptyTranscripts.length}`);

    if (finalTranscripts.length > 0) {
      console.log(`\n📝 Final Transcripts:`);
      finalTranscripts.forEach((t, i) => {
        console.log(`   ${i + 1}. "${t.text}" (confidence: ${t.confidence ? (t.confidence * 100).toFixed(1) + '%' : 'N/A'})`);
      });
    }

    if (partialTranscripts.length > 0 && finalTranscripts.length === 0) {
      console.log(`\n📝 Partial Transcripts (no final transcripts received):`);
      partialTranscripts.forEach((t, i) => {
        console.log(`   ${i + 1}. "${t.text}"`);
      });
    }

    console.log(`${'='.repeat(80)}\n`);

  } catch (error: any) {
    console.error('❌ Test failed:', error);
    process.exit(1);
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

main().catch(console.error);



