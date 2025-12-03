/**
 * Script to send audio chunks every 5 seconds to the ingest service
 * This simulates a call and tests the end-to-end flow:
 * 1. Ingest service receives audio
 * 2. ASR worker transcribes it
 * 3. UI displays the transcription
 */

import WebSocket from 'ws';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const INGEST_WS_URL = process.env.INGEST_WS_URL || 'ws://localhost:8443/v1/ingest';
const SAMPLE_RATE = 16000; // 16kHz for better transcription
const CHUNK_DURATION_MS = 5000; // 5 seconds
const CHUNK_SIZE_BYTES = (SAMPLE_RATE * CHUNK_DURATION_MS) / 1000 * 2; // PCM16 = 2 bytes per sample

// Generate a simple sine wave audio (440Hz tone) for testing
function generateTestAudio(durationMs: number, sampleRate: number): Buffer {
  const numSamples = (sampleRate * durationMs) / 1000;
  const buffer = Buffer.allocUnsafe(numSamples * 2); // 2 bytes per sample (PCM16)
  const frequency = 440; // A4 note
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Generate sine wave, scale to 16-bit range
    const sample = Math.sin(2 * Math.PI * frequency * t);
    const int16Sample = Math.max(-32768, Math.min(32767, Math.round(sample * 16000))); // Scale to 16-bit
    buffer.writeInt16LE(int16Sample, i * 2);
  }
  
  return buffer;
}

// Generate speech-like audio (multiple frequencies to simulate speech)
function generateSpeechLikeAudio(durationMs: number, sampleRate: number): Buffer {
  const numSamples = (sampleRate * durationMs) / 1000;
  const buffer = Buffer.allocUnsafe(numSamples * 2);
  
  // Mix multiple frequencies to create speech-like audio
  const frequencies = [200, 400, 600, 800, 1000]; // Formant-like frequencies
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    
    // Mix frequencies with different amplitudes (simulate formants)
    frequencies.forEach((freq, idx) => {
      const amplitude = 1 / (idx + 1); // Decreasing amplitude
      sample += amplitude * Math.sin(2 * Math.PI * freq * t);
    });
    
    // Add some variation to make it more speech-like
    sample += 0.1 * Math.sin(2 * Math.PI * 50 * t); // Low frequency modulation
    
    // Scale to 16-bit range
    const int16Sample = Math.max(-32768, Math.min(32767, Math.round(sample * 8000)));
    buffer.writeInt16LE(int16Sample, i * 2);
  }
  
  return buffer;
}

async function sendAudioChunks() {
  const streamSid = `test-stream-${Date.now()}`;
  const callSid = `test-call-${Date.now()}`;
  const accountSid = 'Exotel';
  
  console.log(`[AudioSender] 🚀 Starting audio chunk sender`, {
    ingestUrl: INGEST_WS_URL,
    streamSid,
    callSid,
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: CHUNK_DURATION_MS,
    chunkSizeBytes: CHUNK_SIZE_BYTES,
  });

  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(INGEST_WS_URL);
    let sequenceNumber = 0;
    let chunkNumber = 0;
    let intervalId: NodeJS.Timeout | null = null;
    let isConnected = false;

    ws.on('open', () => {
      console.log(`[AudioSender] ✅ Connected to ingest service`);
      isConnected = true;

      // Send connected event
      ws.send(JSON.stringify({
        event: 'connected',
      }));

      // Send start event
      const startEvent = {
        event: 'start',
        sequence_number: sequenceNumber++,
        stream_sid: streamSid,
        start: {
          stream_sid: streamSid,
          call_sid: callSid,
          account_sid: accountSid,
          from: '+1234567890',
          to: '+0987654321',
          custom_parameters: {
            test: 'true',
            script: 'send-audio-chunks-every-5sec',
          },
          media_format: {
            encoding: 'pcm16',
            sample_rate: SAMPLE_RATE.toString(),
          },
        },
      };

      console.log(`[AudioSender] 📤 Sending start event:`, {
        streamSid,
        callSid,
        sampleRate: SAMPLE_RATE,
      });
      ws.send(JSON.stringify(startEvent));

      // Start sending audio chunks every 5 seconds
      console.log(`[AudioSender] 🎵 Starting to send audio chunks every ${CHUNK_DURATION_MS}ms`);
      
      // Send first chunk immediately
      sendAudioChunk();
      
      // Then send every 5 seconds
      intervalId = setInterval(() => {
        sendAudioChunk();
      }, CHUNK_DURATION_MS);
    });

    function sendAudioChunk() {
      if (!isConnected) {
        console.warn(`[AudioSender] ⚠️ Not connected, skipping chunk`);
        return;
      }

      chunkNumber++;
      
      // Generate test audio (use speech-like for better transcription)
      const audioBuffer = generateSpeechLikeAudio(CHUNK_DURATION_MS, SAMPLE_RATE);
      const base64Audio = audioBuffer.toString('base64');

      const mediaEvent = {
        event: 'media',
        sequence_number: sequenceNumber++,
        stream_sid: streamSid,
        media: {
          chunk: chunkNumber,
          timestamp: new Date().toISOString(),
          payload: base64Audio,
        },
      };

      console.log(`[AudioSender] 📤 Sending audio chunk ${chunkNumber}`, {
        seq: sequenceNumber - 1,
        sizeBytes: audioBuffer.length,
        durationMs: CHUNK_DURATION_MS,
        base64Length: base64Audio.length,
        timestamp: new Date().toISOString(),
      });

      ws.send(JSON.stringify(mediaEvent));

      // Stop after 10 chunks (50 seconds total)
      if (chunkNumber >= 10) {
        console.log(`[AudioSender] 🛑 Sent 10 chunks, stopping...`);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        
        // Send stop event after a short delay
        setTimeout(() => {
          const stopEvent = {
            event: 'stop',
            sequence_number: sequenceNumber++,
            stream_sid: streamSid,
            stop: {
              call_sid: callSid,
              account_sid: accountSid,
              reason: 'stopped',
            },
          };
          
          console.log(`[AudioSender] 📤 Sending stop event`);
          ws.send(JSON.stringify(stopEvent));
          
          // Close connection after stop
          setTimeout(() => {
            ws.close();
            console.log(`[AudioSender] ✅ Connection closed`);
            resolve();
          }, 1000);
        }, 2000);
      }
    }

    ws.on('message', (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[AudioSender] 📨 Received message:`, message);
      } catch (err) {
        console.log(`[AudioSender] 📨 Received non-JSON message:`, data.toString().substring(0, 100));
      }
    });

    ws.on('error', (error) => {
      console.error(`[AudioSender] ❌ WebSocket error:`, error);
      if (intervalId) {
        clearInterval(intervalId);
      }
      reject(error);
    });

    ws.on('close', () => {
      console.log(`[AudioSender] 🔌 WebSocket closed`);
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (!isConnected) {
        reject(new Error('Connection closed before completing'));
      }
    });
  });
}

// Run the script
if (require.main === module) {
  sendAudioChunks()
    .then(() => {
      console.log(`[AudioSender] ✅ Script completed successfully`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`[AudioSender] ❌ Script failed:`, error);
      process.exit(1);
    });
}

export { sendAudioChunks };

