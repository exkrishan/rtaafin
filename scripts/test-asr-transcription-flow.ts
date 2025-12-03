/**
 * Test script to verify ASR transcription flow
 * 
 * This script:
 * 1. Sends audio chunks to ingest service (simulating Exotel protocol)
 * 2. Waits for transcripts to appear in Redis
 * 3. Verifies the ASR worker is processing audio correctly
 * 
 * Usage:
 *   ts-node scripts/test-asr-transcription-flow.ts
 */

import WebSocket from 'ws';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as https from 'https';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const INGEST_WS_URL = process.env.INGEST_WS_URL || 'wss://ingestservice.onrender.com/v1/ingest?sample-rate=16000';
const REDIS_URL = process.env.REDIS_URL || 'redis://default:UC0l9DYDSnkd2Ko468JaHAg7h35GieDm@redis-13289.c84.us-east-1-2.ec2.cloud.redislabs.com:13289';
const SAMPLE_RATE = 16000; // 16kHz for better transcription
const CHUNK_DURATION_MS = 5000; // 5 seconds per chunk

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

async function testASRFlow() {
  const streamSid = `test-stream-${Date.now()}`;
  const callSid = `test-call-${Date.now()}`;
  const accountSid = 'Exotel';
  // Ingest service uses call_sid as interaction_id (see exotel-handler.ts line 425)
  const interactionId = callSid;
  
  console.log(`\n🧪 [ASR Test] Starting ASR transcription flow test\n`);
  console.log(`📋 Test Configuration:`, {
    ingestUrl: INGEST_WS_URL,
    redisUrl: REDIS_URL.replace(/:[^:@]+@/, ':****@'), // Hide password
    streamSid,
    callSid,
    interactionId,
    sampleRate: SAMPLE_RATE,
    chunkDurationMs: CHUNK_DURATION_MS,
  });

  // Connect to Redis to check for transcripts
  const redis = new Redis(REDIS_URL);
  const transcriptListKey = `transcripts:${interactionId}`;
  
  console.log(`\n✅ [ASR Test] Connected to Redis`);
  console.log(`   Will check for transcripts at: ${transcriptListKey}\n`);

  return new Promise<void>((resolve, reject) => {
    // Disable SSL verification for test (Render uses self-signed certs)
    const ws = new WebSocket(INGEST_WS_URL, {
      rejectUnauthorized: false, // Allow self-signed certificates for testing
    });
    let sequenceNumber = 0;
    let chunkNumber = 0;
    let intervalId: NodeJS.Timeout | null = null;
    let isConnected = false;
    let transcriptsFound: any[] = [];
    let checkInterval: NodeJS.Timeout | null = null;

    // Function to check for transcripts in Redis
    async function checkTranscripts() {
      try {
        const transcripts = await redis.lrange(transcriptListKey, 0, -1);
        
        if (transcripts.length > transcriptsFound.length) {
          const newTranscripts = transcripts.slice(transcriptsFound.length);
          console.log(`\n📝 [ASR Test] ✅ Found ${newTranscripts.length} new transcript(s)!`);
          
          newTranscripts.forEach((transcriptJson, idx) => {
            try {
              const transcript = JSON.parse(transcriptJson);
              console.log(`   Transcript ${transcriptsFound.length + idx + 1}:`, {
                text: transcript.text?.substring(0, 100) || '(empty)',
                type: transcript.type,
                seq: transcript.seq,
                timestamp: transcript.timestamp,
              });
              transcriptsFound.push(transcript);
            } catch (err) {
              console.warn(`   ⚠️ Failed to parse transcript:`, err);
            }
          });
        }
      } catch (err: any) {
        console.error(`   ❌ Error checking transcripts:`, err.message);
      }
    }

    // Start checking for transcripts every 2 seconds
    checkInterval = setInterval(checkTranscripts, 2000);

    ws.on('open', () => {
      console.log(`✅ [ASR Test] Connected to ingest service`);
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
            script: 'test-asr-transcription-flow',
          },
          media_format: {
            encoding: 'pcm16',
            sample_rate: SAMPLE_RATE.toString(),
          },
        },
      };

      console.log(`📤 [ASR Test] Sending start event...`);
      ws.send(JSON.stringify(startEvent));

      // Start sending audio chunks every 5 seconds
      console.log(`🎵 [ASR Test] Starting to send audio chunks every ${CHUNK_DURATION_MS}ms\n`);
      
      // Send first chunk immediately
      sendAudioChunk();
      
      // Then send every 5 seconds
      intervalId = setInterval(() => {
        sendAudioChunk();
      }, CHUNK_DURATION_MS);
    });

    function sendAudioChunk() {
      if (!isConnected) {
        console.warn(`⚠️ [ASR Test] Not connected, skipping chunk`);
        return;
      }

      chunkNumber++;
      
      // Generate test audio
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

      console.log(`📤 [ASR Test] Sending audio chunk ${chunkNumber}`, {
        seq: sequenceNumber - 1,
        sizeBytes: audioBuffer.length,
        durationMs: CHUNK_DURATION_MS,
        timestamp: new Date().toISOString(),
      });

      ws.send(JSON.stringify(mediaEvent));

      // Stop after 6 chunks (30 seconds total) to allow time for transcription
      if (chunkNumber >= 6) {
        console.log(`\n🛑 [ASR Test] Sent 6 chunks, stopping audio...`);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        
        // Wait a bit for final transcripts, then send stop event
        setTimeout(async () => {
          // Final check for transcripts
          await checkTranscripts();
          
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
          
          console.log(`\n📤 [ASR Test] Sending stop event...`);
          ws.send(JSON.stringify(stopEvent));
          
          // Wait a bit more for any final transcripts
          setTimeout(async () => {
            await checkTranscripts();
            
            // Summary
            console.log(`\n📊 [ASR Test] Test Summary:`);
            console.log(`   Audio chunks sent: ${chunkNumber}`);
            console.log(`   Transcripts received: ${transcriptsFound.length}`);
            
            if (transcriptsFound.length > 0) {
              console.log(`\n✅ [ASR Test] SUCCESS: ASR service is working!`);
              console.log(`   Found ${transcriptsFound.length} transcript(s) in Redis`);
              transcriptsFound.forEach((t, idx) => {
                const textPreview = t.text?.substring(0, 100) || '(empty)';
                console.log(`   ${idx + 1}. ${textPreview}`);
              });
            } else {
              console.log(`\n⚠️ [ASR Test] WARNING: No transcripts found in Redis`);
              console.log(`   Interaction ID checked: ${interactionId}`);
              console.log(`   Transcript key: ${transcriptListKey}`);
              console.log(`\n   Possible issues:`);
              console.log(`   1. ASR worker is not running (check: https://asr11labs.onrender.com)`);
              console.log(`   2. ASR worker is not consuming from audio_stream`);
              console.log(`   3. Audio was not published to Redis by ingest service`);
              console.log(`   4. ElevenLabs is not returning transcripts (check ASR worker logs)`);
              console.log(`   5. Audio format mismatch (sample rate, encoding)`);
              console.log(`\n   Next steps:`);
              console.log(`   - Check ASR worker logs on Render`);
              console.log(`   - Verify ingest service published audio (run: npx tsx scripts/check-audio-in-redis.ts)`);
              console.log(`   - Check if audio_stream has messages with interaction_id: ${interactionId}`);
            }
            
            // Close connection
            ws.close();
            if (checkInterval) {
              clearInterval(checkInterval);
            }
            await redis.quit();
            console.log(`\n✅ [ASR Test] Test completed\n`);
            resolve();
          }, 10000); // Wait 10 seconds for final transcripts
        }, 5000); // Wait 5 seconds after last chunk
      }
    }

    ws.on('message', (data: Buffer | string) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 [ASR Test] Received message from ingest:`, message);
      } catch (err) {
        const text = data.toString();
        if (text.length > 0) {
          console.log(`📨 [ASR Test] Received non-JSON message:`, text.substring(0, 200));
        }
      }
    });

    ws.on('error', (error) => {
      console.error(`❌ [ASR Test] WebSocket error:`, error);
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      redis.quit();
      reject(error);
    });

    ws.on('close', () => {
      console.log(`🔌 [ASR Test] WebSocket closed`);
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (checkInterval) {
        clearInterval(checkInterval);
      }
      if (!isConnected) {
        redis.quit();
        reject(new Error('Connection closed before completing'));
      }
    });
  });
}

// Run the test
if (require.main === module) {
  testASRFlow()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n❌ [ASR Test] Test failed:`, error);
      process.exit(1);
    });
}

export { testASRFlow };

