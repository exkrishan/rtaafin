#!/usr/bin/env ts-node
/**
 * Simulate Exotel Stream Applet WebSocket client
 * 
 * This script simulates an Exotel Stream Applet sending audio data
 * via WebSocket using the Exotel protocol format.
 * 
 * Usage:
 *   ts-node scripts/simulate-exotel-stream.ts [options]
 * 
 * Environment Variables:
 *   WS_URL - WebSocket URL (default: ws://localhost:8443/v1/ingest)
 *   CALL_SID - Call SID (default: auto-generated)
 *   STREAM_SID - Stream SID (default: auto-generated)
 *   DURATION_SEC - Duration to send audio (default: 10)
 *   SAMPLE_RATE - Audio sample rate (default: 8000)
 * 
 * Options:
 *   --help - Show this help message
 *   --duration <seconds> - Duration to send audio
 *   --sample-rate <rate> - Audio sample rate (8000, 16000, 24000)
 *   --file <path> - Path to PCM16 audio file (optional)
 */

import WebSocket from 'ws';
import { randomBytes } from 'crypto';

interface ExotelConnectedEvent {
  event: 'connected';
}

interface ExotelStartEvent {
  event: 'start';
  sequence_number: number;
  stream_sid: string;
  start: {
    stream_sid: string;
    call_sid: string;
    account_sid: string;
    from: string;
    to: string;
    media_format: {
      encoding: string;
      sample_rate: string;
    };
  };
}

interface ExotelMediaEvent {
  event: 'media';
  sequence_number: number;
  stream_sid: string;
  media: {
    chunk: number;
    timestamp: string;
    payload: string; // Base64 encoded PCM16 audio
  };
}

interface ExotelStopEvent {
  event: 'stop';
  sequence_number: number;
  stream_sid: string;
  stop: {
    call_sid: string;
    account_sid: string;
    reason: string; // "stopped" or "callended"
  };
}

type ExotelEvent = ExotelConnectedEvent | ExotelStartEvent | ExotelMediaEvent | ExotelStopEvent;

function generatePCM16Frame(sampleRate: number, durationMs: number = 20): Buffer {
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const buffer = Buffer.allocUnsafe(samples * 2); // 16-bit = 2 bytes per sample
  
  // Generate a simple sine wave (440Hz tone)
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000;
    buffer.writeInt16LE(Math.floor(sample), i * 2);
  }
  
  return buffer;
}

function base64Encode(buffer: Buffer): string {
  return buffer.toString('base64');
}

async function simulateExotelStream(options: {
  wsUrl: string;
  callSid: string;
  streamSid: string;
  durationSec: number;
  sampleRate: number;
  audioFile?: string;
}) {
  const { wsUrl, callSid, streamSid, durationSec, sampleRate, audioFile } = options;
  
  console.log('🚀 Starting Exotel Stream simulation...');
  console.log(`   WebSocket URL: ${wsUrl}`);
  console.log(`   Call SID: ${callSid}`);
  console.log(`   Stream SID: ${streamSid}`);
  console.log(`   Sample Rate: ${sampleRate} Hz`);
  console.log(`   Duration: ${durationSec} seconds`);
  console.log('');
  
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let seq = 0;
    let frameCount = 0;
    const framesPerSecond = sampleRate / 160; // 20ms frames (50 frames/sec at 8kHz)
    const totalFrames = Math.floor(durationSec * framesPerSecond);
    let audioData: Buffer | null = null;
    
    // Load audio file if provided
    if (audioFile) {
      try {
        const fs = require('fs');
        audioData = fs.readFileSync(audioFile);
        console.log(`📁 Loaded audio file: ${audioFile} (${audioData.length} bytes)`);
      } catch (error: any) {
        console.error(`❌ Failed to load audio file: ${error.message}`);
        reject(error);
        return;
      }
    }
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      
      // Send 'connected' event
      const connectedEvent: ExotelConnectedEvent = {
        event: 'connected',
      };
      ws.send(JSON.stringify(connectedEvent));
      console.log('📤 Sent: connected event');
      
      // Send 'start' event after short delay
      setTimeout(() => {
        seq++;
        const accountSid = process.env.ACCOUNT_SID || `account_${randomBytes(8).toString('hex')}`;
        const startEvent: ExotelStartEvent = {
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
        
        // Start sending audio frames
        const frameInterval = 20; // 20ms per frame
        let frameIndex = 0;
        
        const accountSid = process.env.ACCOUNT_SID || `account_${randomBytes(8).toString('hex')}`;
        let chunkNumber = 0;
        
        const sendFrame = () => {
          if (frameCount >= totalFrames) {
            // Send 'stop' event
            seq++;
            const stopEvent: ExotelStopEvent = {
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
            console.log(`✅ Completed: sent ${frameCount} audio frames`);
            
            // Close connection after short delay
            setTimeout(() => {
              ws.close();
              resolve();
            }, 100);
            return;
          }
          
          seq++;
          frameCount++;
          chunkNumber++;
          
          // Generate or read audio frame
          let frame: Buffer;
          if (audioData) {
            // Read from file (20ms chunks)
            const frameSize = (sampleRate * 20) / 1000 * 2; // 20ms at sample rate, 16-bit
            const offset = (frameIndex * frameSize) % audioData.length;
            if (offset + frameSize <= audioData.length) {
              frame = audioData.slice(offset, offset + frameSize);
            } else {
              // Wrap around or pad with zeros
              frame = Buffer.concat([
                audioData.slice(offset),
                Buffer.alloc(frameSize - (audioData.length - offset))
              ]);
            }
            frameIndex++;
          } else {
            // Generate synthetic audio
            frame = generatePCM16Frame(sampleRate, 20);
          }
          
          // Send 'media' event with base64-encoded audio
          const mediaEvent: ExotelMediaEvent = {
            event: 'media',
            sequence_number: seq,
            stream_sid: streamSid,
            media: {
              chunk: chunkNumber,
              timestamp: new Date().toISOString(),
              payload: base64Encode(frame),
            },
          };
          
          ws.send(JSON.stringify(mediaEvent));
          
          if (frameCount % 50 === 0) {
            console.log(`📤 Sent ${frameCount}/${totalFrames} frames (seq: ${seq})`);
          }
        };
        
        // Send frames at 20ms intervals
        const interval = setInterval(() => {
          sendFrame();
          if (frameCount >= totalFrames) {
            clearInterval(interval);
          }
        }, frameInterval);
      }, 100);
    });
    
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📥 Received:', JSON.stringify(message, null, 2));
      } catch (error) {
        console.log('📥 Received (non-JSON):', data.toString());
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      reject(error);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: code=${code}, reason=${reason.toString()}`);
    });
  });
}

// Parse command line arguments
function parseArgs(): {
  wsUrl: string;
  callSid: string;
  streamSid: string;
  durationSec: number;
  sampleRate: number;
  audioFile?: string;
} {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(require('fs').readFileSync(__filename, 'utf8').match(/\/\*\*[\s\S]*?\*\//)?.[0] || '');
    process.exit(0);
  }
  
  let durationSec = parseInt(process.env.DURATION_SEC || '10', 10);
  let sampleRate = parseInt(process.env.SAMPLE_RATE || '8000', 10);
  let audioFile: string | undefined = process.env.AUDIO_FILE;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--duration' && i + 1 < args.length) {
      durationSec = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--sample-rate' && i + 1 < args.length) {
      sampleRate = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--file' && i + 1 < args.length) {
      audioFile = args[i + 1];
      i++;
    }
  }
  
  const callSid = process.env.CALL_SID || `call_${randomBytes(8).toString('hex')}`;
  const streamSid = process.env.STREAM_SID || `stream_${randomBytes(8).toString('hex')}`;
  // Support both local (ws://) and Render (wss://) URLs
  const wsUrl = process.env.WS_URL || 'ws://localhost:8443/v1/ingest';
  
  return {
    wsUrl,
    callSid,
    streamSid,
    durationSec,
    sampleRate,
    audioFile,
  };
}

// Main
if (require.main === module) {
  const options = parseArgs();
  
  simulateExotelStream(options)
    .then(() => {
      console.log('✅ Simulation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Simulation failed:', error);
      process.exit(1);
    });
}

export { simulateExotelStream };


