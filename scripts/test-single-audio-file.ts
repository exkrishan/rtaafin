#!/usr/bin/env tsx
/**
 * Send a single audio file for transcription
 * Usage: npx tsx scripts/test-single-audio-file.ts <audio-file-path>
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

const audioFilePath = process.argv[2];
if (!audioFilePath) {
  console.error('Usage: npx tsx scripts/test-single-audio-file.ts <audio-file-path>');
  process.exit(1);
}

// Configuration
const WS_URL = process.env.INGEST_WS_URL || 'wss://ingestservice.onrender.com/v1/ingest';
const UI_URL = process.env.UI_URL || 'https://frontend-8jdd.onrender.com';

// Read WAV file
function readWavFile(wavPath: string): { audio: Buffer; sampleRate: number } {
  if (!fs.existsSync(wavPath)) {
    throw new Error(`WAV file not found: ${wavPath}`);
  }
  
  const buffer = fs.readFileSync(wavPath);
  
  if (buffer.length < 44) {
    throw new Error('File too small to be a valid WAV file');
  }
  
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Not a valid WAV file (missing RIFF/WAVE header)');
  }
  
  const audioFormat = buffer.readUInt16LE(20);
  const numChannels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  
  if (audioFormat !== 1) {
    throw new Error(`Unsupported audio format: ${audioFormat} (expected PCM=1)`);
  }
  
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bit depth: ${bitsPerSample} (expected 16-bit)`);
  }
  
  // Find data chunk
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    if (chunkId === 'data') {
      const audioData = buffer.slice(offset + 8, offset + 8 + chunkSize);
      return { audio: audioData, sampleRate };
    }
    
    offset += 8 + chunkSize;
  }
  
  throw new Error('No data chunk found in WAV file');
}

async function streamAudioFile(audioFilePath: string): Promise<string> {
  console.log('📁 Loading audio file...');
  const { audio, sampleRate } = readWavFile(audioFilePath);
  const durationMs = (audio.length / (sampleRate * 2)) * 1000;
  console.log(`✅ Loaded: ${path.basename(audioFilePath)}`);
  console.log(`   Sample Rate: ${sampleRate}Hz`);
  console.log(`   Duration: ${durationMs.toFixed(0)}ms`);
  console.log(`   Size: ${audio.length} bytes`);
  
  // CRITICAL: Warn if using 8kHz (ElevenLabs has 0% success at 8kHz)
  if (sampleRate === 8000) {
    console.warn(`\n⚠️  WARNING: Audio file is 8kHz`);
    console.warn(`   ElevenLabs testing showed 0% transcription success at 8kHz`);
    console.warn(`   Recommendation: Use 16kHz audio file for better transcription results`);
    console.warn(`   The script will still work, but you may see empty transcripts\n`);
  } else if (sampleRate === 16000) {
    console.log(`✅ Using 16kHz sample rate (optimal for ElevenLabs transcription)\n`);
  }
  
  // Generate call identifiers
  const callSid = `call_${randomBytes(16).toString('hex')}`;
  const streamSid = `stream_${randomBytes(16).toString('hex')}`;
  const accountSid = `account_${randomBytes(16).toString('hex')}`;
  
  console.log('');
  console.log('🔌 Connecting to ingest service...');
  console.log(`   URL: ${WS_URL}`);
  console.log(`   Call ID: ${callSid}`);
  console.log(`   This simulates Exotel streaming (20ms frames, Exotel message format)`);
  console.log(`   Flow: Local File → Ingest Service → Redis → ASR Worker → ElevenLabs → Transcripts`);
  
  // Wake up service first
  const serviceUrl = WS_URL.replace('wss://', 'https://').replace('/v1/ingest', '/health');
  try {
    await fetch(serviceUrl);
    console.log('✅ Service is awake');
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error: any) {
    console.warn(`⚠️  Could not wake up service: ${error.message}`);
  }
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      rejectUnauthorized: false,
    });
    
    let seq = 0;
    let frameCount = 0;
    const frameSizeMs = 20; // 20ms frames
    const frameSizeBytes = Math.floor((sampleRate * frameSizeMs) / 1000 * 2); // 16-bit = 2 bytes
    let audioOffset = 0;
    let connected = false;
    let started = false;
    
    const timeout = setTimeout(() => {
      if (!connected || !started) {
        ws.close();
        reject(new Error(`Timeout: connected=${connected}, started=${started}`));
      }
    }, 30000);
    
    ws.on('open', () => {
      connected = true;
      console.log('✅ WebSocket connected');
      
      // Send start event
      seq++;
      const startEvent = {
        event: 'start',
        sequence_number: seq,
        stream_sid: streamSid,
        start: {
          stream_sid: streamSid,
          call_sid: callSid,
          account_sid: accountSid,
          from: '+1234567890',
          to: '+0987654321',
          media_format: {
            encoding: 'pcm16',
            sample_rate: sampleRate.toString(),
          },
        },
      };
      ws.send(JSON.stringify(startEvent));
      console.log('📤 Sent: start event');
      started = true;
      
      // Wait a moment before sending audio
      setTimeout(() => {
        console.log('');
        console.log('📤 Streaming audio (20ms frames, matching Exotel format)...');
        
        // Stream audio in 20ms frames (matching Exotel's format)
        const sendFrame = () => {
          if (audioOffset >= audio.length) {
            // All audio sent, send stop event
            seq++;
            const stopEvent = {
              event: 'stop',
              sequence_number: seq,
              stream_sid: streamSid,
              stop: {
                call_sid: callSid,
                account_sid: accountSid,
                reason: 'stopped',
              },
            };
            ws.send(JSON.stringify(stopEvent));
            console.log('📤 Sent: stop event');
            console.log(`✅ Streaming complete: ${frameCount} frames sent`);
            console.log(`   Total audio sent: ${(audioOffset / (sampleRate * 2)).toFixed(2)}s`);
            console.log(`   Interaction ID (for UI): ${callSid}`);
            
            clearTimeout(timeout);
            setTimeout(() => {
              ws.close();
              resolve(callSid);
            }, 1000);
            return;
          }
          
          const chunk = audio.slice(audioOffset, audioOffset + frameSizeBytes);
          const base64Audio = chunk.toString('base64');
          
          seq++;
          const mediaEvent = {
            event: 'media',
            sequence_number: seq,
            stream_sid: streamSid,
            media: {
              chunk: seq,
              timestamp: Date.now().toString(),
              payload: base64Audio,
            },
          };
          
          ws.send(JSON.stringify(mediaEvent));
          frameCount++;
          audioOffset += frameSizeBytes;
          
          // Log progress every 50 frames (1 second at 20ms intervals)
          if (frameCount % 50 === 0) {
            const progress = ((audioOffset / audio.length) * 100).toFixed(1);
            console.log(`   📤 Progress: ${progress}% (${frameCount} frames, ~${(frameCount * frameSizeMs / 1000).toFixed(1)}s)`);
          }
          
          // Send next frame after 20ms (matching Exotel's real-time streaming)
          setTimeout(sendFrame, frameSizeMs);
        };
        
        sendFrame();
      }, 1000);
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('❌ WebSocket error:', error);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed (code: ${code}, reason: ${reason?.toString() || 'none'})`);
    });
  });
}

async function main() {
  try {
    console.log('🎤 Single Audio File Transcription Test');
    console.log('='.repeat(60));
    console.log(`   Audio File: ${audioFilePath}`);
    console.log(`   Ingest URL: ${WS_URL}`);
    console.log(`   UI URL: ${UI_URL}`);
    console.log('');
    
    const interactionId = await streamAudioFile(audioFilePath);
    
    console.log('');
    console.log('📊 Next Steps:');
    console.log('='.repeat(60));
    console.log('1. Open the UI:');
    console.log(`   ${UI_URL}/test-agent-assist`);
    console.log('');
    console.log(`2. Interaction ID: ${interactionId}`);
    console.log('   The UI should auto-discover this call within 5 seconds');
    console.log('');
    console.log('3. Transcripts should appear in real-time');
    console.log('');
    console.log('⏳ Waiting 60 seconds for transcripts to appear...');
    console.log('   (You can stop this script with Ctrl+C)');
    await new Promise(resolve => setTimeout(resolve, 60000));
    console.log('✅ Test complete');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();


