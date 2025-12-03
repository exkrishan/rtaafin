#!/usr/bin/env tsx
/**
 * Complete End-to-End Test with WAV Audio Files
 * 
 * Streams multiple WAV files sequentially in ONE continuous call:
 * 1. Reads all WAV files from directory
 * 2. Streams them sequentially in the same interaction
 * 3. Call is auto-registered by ingest service
 * 4. UI auto-discovers the interaction ID
 * 
 * Usage:
 *   npx tsx scripts/test-e2e-with-wav-file.ts --dir /path/to/wav/files [options]
 * 
 * Options:
 *   --dir <path> - Directory with WAV files (required)
 *   --url <ws_url> - WebSocket URL (default: wss://rtaa-ingest-service.onrender.com/v1/ingest)
 *   --ui-url <url> - Frontend UI URL (default: https://frontend-8jdd.onrender.com)
 */

import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
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
    reason: string;
  };
}

// Read PCM16 audio from WAV file
function readWavFile(wavPath: string): { audio: Buffer; sampleRate: number } {
  if (!fs.existsSync(wavPath)) {
    throw new Error(`WAV file not found: ${wavPath}`);
  }
  
  const buffer = fs.readFileSync(wavPath);
  
  // Validate WAV header
  if (buffer.length < 44) {
    throw new Error('File too small to be a valid WAV file');
  }
  
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Not a valid WAV file (missing RIFF/WAVE header)');
  }
  
  // Parse WAV header
  const audioFormat = buffer.readUInt16LE(20); // Should be 1 for PCM
  const numChannels = buffer.readUInt16LE(22); // Should be 1 for mono
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34); // Should be 16 for PCM16
  
  if (audioFormat !== 1) {
    throw new Error(`Unsupported audio format: ${audioFormat} (expected PCM=1)`);
  }
  
  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bit depth: ${bitsPerSample} (expected 16-bit)`);
  }
  
  // Find data chunk
  let dataOffset = 44; // Start after standard header
  let dataSize = 0;
  
  // Search for 'data' chunk (might not be at offset 36)
  let offset = 12; // After 'WAVE'
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    
    offset += 8 + chunkSize;
  }
  
  if (dataOffset === 44 && buffer.length < 44) {
    // Fallback: assume standard WAV structure
    dataOffset = 44;
    dataSize = buffer.length - 44;
  }
  
  const audioData = buffer.slice(dataOffset, dataOffset + dataSize);
  
  return { audio: audioData, sampleRate };
}

// Load all WAV files from directory
function loadAllWavFiles(wavDir: string): Array<{ audio: Buffer; sampleRate: number; filename: string }> {
  const files = fs.readdirSync(wavDir)
    .filter(f => f.toLowerCase().endsWith('.wav'))
    .sort(); // Sort to stream in order
  
  if (files.length === 0) {
    throw new Error(`No WAV files found in directory: ${wavDir}`);
  }
  
  console.log(`📁 Found ${files.length} WAV files in directory`);
  
  const audioFiles: Array<{ audio: Buffer; sampleRate: number; filename: string }> = [];
  let sampleRate: number | null = null;
  
  for (const file of files) {
    const filePath = path.join(wavDir, file);
    const { audio, sampleRate: fileSampleRate } = readWavFile(filePath);
    
    if (sampleRate === null) {
      sampleRate = fileSampleRate;
    } else if (sampleRate !== fileSampleRate) {
      console.warn(`⚠️  Sample rate mismatch: ${file} has ${fileSampleRate}Hz (expected ${sampleRate}Hz)`);
      // Continue anyway - we'll use the first file's sample rate
    }
    
    const duration = (audio.length / (sampleRate! * 2)).toFixed(2);
    audioFiles.push({ audio, sampleRate: fileSampleRate, filename: file });
    console.log(`   ✅ Loaded: ${file} (${duration}s at ${fileSampleRate}Hz)`);
  }
  
  const totalDuration = audioFiles.reduce((sum, f) => sum + (f.audio.length / (f.sampleRate * 2)), 0);
  console.log(`✅ Loaded ${files.length} files: ${totalDuration.toFixed(2)}s total`);
  
  return audioFiles;
}

// Stream all audio files sequentially in one continuous call
async function streamAllFilesSequentially(
  wsUrl: string,
  audioFiles: Array<{ audio: Buffer; sampleRate: number; filename: string }>,
  targetSampleRate: number
): Promise<{ interactionId: string; framesSent: number }> {
  const callSid = `call_${randomBytes(8).toString('hex')}`;
  const streamSid = `stream_${randomBytes(8).toString('hex')}`;
  const accountSid = `account_${randomBytes(8).toString('hex')}`;
  
  console.log('');
  console.log('🚀 Starting continuous audio stream...');
  console.log(`   Interaction ID: ${callSid}`);
  console.log(`   Sample Rate: ${targetSampleRate} Hz`);
  console.log(`   Total Files: ${audioFiles.length}`);
  console.log(`   WebSocket URL: ${wsUrl}`);
  console.log('');
  console.log('💡 The UI will auto-discover this interaction ID');
  console.log('');
  
  // Wake up the service first
  const serviceUrl = wsUrl.replace('wss://', 'https://').replace('/v1/ingest', '/health');
  console.log(`🔔 Waking up service: ${serviceUrl}`);
  try {
    await fetch(serviceUrl);
    console.log('✅ Service is awake');
    // Wait a moment for service to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error: any) {
    console.warn(`⚠️  Could not wake up service: ${error.message}`);
    console.log('   Continuing anyway...');
  }
  
  return new Promise((resolve, reject) => {
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 3000; // 3 seconds
    
    // Shared state across retries
    let seq = 0;
    let frameCount = 0;
    const frameSizeMs = 20; // 20ms frames
    const frameSizeBytes = Math.floor((targetSampleRate * frameSizeMs) / 1000 * 2); // 16-bit = 2 bytes
    
    let currentFileIndex = 0;
    let currentFileAudioOffset = 0;
    let streamingComplete = false;
    
    const connect = () => {
      console.log(`🔌 Attempting WebSocket connection (attempt ${retryCount + 1}/${maxRetries})...`);
      const ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false, // For self-signed certs
      });
    
      // Reset connection state for this attempt
      let connected = false;
      let started = false;
    
    const timeout = setTimeout(() => {
      if (!connected || !started) {
        ws.close();
        reject(new Error(`Timeout: connected=${connected}, started=${started}. Check if service is awake and WebSocket URL is correct: ${wsUrl}`));
      }
    }, 30000);
    
    ws.on('open', () => {
      connected = true;
      console.log('✅ WebSocket connected');
      
      // Send connected event
      const connectedEvent: ExotelConnectedEvent = { event: 'connected' };
      ws.send(JSON.stringify(connectedEvent));
      console.log('📤 Sent: connected event');
      
      // Send start event (this will register the call in the call registry)
      setTimeout(() => {
        seq++;
        const startEvent: ExotelStartEvent = {
          event: 'start',
          sequence_number: seq,
          stream_sid: streamSid,
          start: {
            stream_sid: streamSid,
            call_sid: callSid, // This is the interactionId
            account_sid: accountSid,
            from: '+1234567890',
            to: '+0987654321',
            media_format: {
              encoding: 'pcm16',
              sample_rate: targetSampleRate.toString(),
            },
          },
        };
        ws.send(JSON.stringify(startEvent));
        console.log('📤 Sent: start event');
        console.log(`   Interaction ID: ${callSid}`);
        console.log(`   ⏳ Waiting 3 seconds for call registry registration to complete...`);
        
        // CRITICAL: Wait for call registry registration to complete
        // The ingest service registers calls asynchronously, so we need to give it time
        // This ensures the UI can discover the call before we start streaming
        setTimeout(() => {
          started = true;
          console.log(`   ✅ Call should now be registered - UI can auto-discover interaction ID: ${callSid}`);
          
          // Start streaming audio frames
        let chunkNumber = 0;
        const sendFrame = () => {
          // Check if we've finished all files
          if (currentFileIndex >= audioFiles.length) {
            if (!streamingComplete) {
              streamingComplete = true;
              // Send stop event
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
              console.log(`✅ Streaming complete: ${frameCount} frames sent across ${audioFiles.length} files`);
              
              clearTimeout(timeout);
              setTimeout(() => {
                ws.close();
                resolve({ interactionId: callSid, framesSent: frameCount });
              }, 100);
            }
            return;
          }
          
          // Get current file
          const currentFile = audioFiles[currentFileIndex];
          const currentFileAudio = currentFile.audio;
          
          // Check if we've finished current file
          if (currentFileAudioOffset >= currentFileAudio.length) {
            // Move to next file
            currentFileIndex++;
            currentFileAudioOffset = 0;
            
            if (currentFileIndex < audioFiles.length) {
              console.log(`📁 Starting file ${currentFileIndex + 1}/${audioFiles.length}: ${audioFiles[currentFileIndex].filename}`);
            }
            
            // Continue to next iteration to send frame from next file
            sendFrame();
            return;
          }
          
          seq++;
          frameCount++;
          chunkNumber++;
          
          // Extract frame from current file
          const offset = currentFileAudioOffset;
          const frame = currentFileAudio.slice(offset, offset + frameSizeBytes);
          
          // Pad if last frame is short
          const paddedFrame = frame.length < frameSizeBytes
            ? Buffer.concat([frame, Buffer.alloc(frameSizeBytes - frame.length)])
            : frame;
          
          // Send media event
          const mediaEvent: ExotelMediaEvent = {
            event: 'media',
            sequence_number: seq,
            stream_sid: streamSid,
            media: {
              chunk: chunkNumber,
              timestamp: new Date().toISOString(),
              payload: paddedFrame.toString('base64'),
            },
          };
          
          ws.send(JSON.stringify(mediaEvent));
          currentFileAudioOffset += frameSizeBytes;
          
          if (frameCount % 50 === 0) {
            const progress = ((currentFileIndex + 1) / audioFiles.length * 100).toFixed(1);
            console.log(`📤 Sent ${frameCount} frames | File ${currentFileIndex + 1}/${audioFiles.length} (${progress}%)`);
          }
        };
        
        // Send frames at 20ms intervals
        const interval = setInterval(() => {
          sendFrame();
          if (streamingComplete) {
            clearInterval(interval);
          }
        }, frameSizeMs);
        }, 3000); // Wait 3 seconds for registration
      }, 100);
    });
    
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.event) {
          console.log(`📥 Received: ${message.event} event`);
        }
      } catch {
        // Ignore non-JSON messages
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      console.error('❌ WebSocket error:', error);
      console.error(`   URL: ${wsUrl}`);
      console.error(`   Error message: ${error.message}`);
      
      // Retry if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`   🔄 Retrying in ${retryDelay / 1000} seconds... (${retryCount}/${maxRetries})`);
        setTimeout(() => {
          connect();
        }, retryDelay);
      } else {
        reject(new Error(`Failed to connect after ${maxRetries} attempts: ${error.message}`));
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed (code: ${code}, reason: ${reason?.toString() || 'none'})`);
      if (!connected) {
        console.error('   ⚠️  Connection closed before establishing. Service may be sleeping or URL incorrect.');
        
        // Retry if we haven't exceeded max retries
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`   🔄 Retrying in ${retryDelay / 1000} seconds... (${retryCount}/${maxRetries})`);
          setTimeout(() => {
            connect();
          }, retryDelay);
        } else {
          reject(new Error(`Failed to connect after ${maxRetries} attempts. Service may be down or URL incorrect: ${wsUrl}`));
        }
      }
    });
    };
    
    // Start first connection attempt
    connect();
  });
}

// Monitor UI auto-discovery
async function monitorUI(interactionId: string, uiUrl: string): Promise<void> {
  console.log('');
  console.log('📊 UI Auto-Discovery Monitoring');
  console.log('='.repeat(60));
  console.log(`   Interaction ID: ${interactionId}`);
  console.log(`   UI URL: ${uiUrl}/test-agent-assist`);
  console.log('');
  console.log('💡 The UI should auto-discover this interaction ID within 5 seconds');
  console.log(`   Open: ${uiUrl}/test-agent-assist`);
  console.log('');
  
  // Wait a moment for registration to complete, then check
  console.log('📡 Waiting 3 seconds for call registry registration, then checking...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Check if call is registered (with retries and better error handling)
  let registered = false;
  let lastError: string | null = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`   Checking call registry (attempt ${attempt}/3)...`);
      
      // Add timeout to fetch to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        const response = await fetch(`${uiUrl}/api/calls/active?limit=10`, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.ok && data.latestCall === interactionId) {
            console.log('   ✅ Call is registered and is the latest call!');
            console.log('   ✅ UI should auto-discover it now');
            registered = true;
            break;
          } else if (data.calls && data.calls.some((c: any) => c.interactionId === interactionId)) {
            console.log('   ✅ Call is registered (but not latest)');
            console.log(`   Latest call: ${data.latestCall || 'none'}`);
            console.log(`   Your call: ${interactionId}`);
            registered = true;
            break;
          } else {
            console.log(`   ⚠️  Call not yet registered (attempt ${attempt}/3)`);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
            }
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          lastError = `HTTP ${response.status}: ${errorText}`;
          console.log(`   ⚠️  Could not check registry (HTTP ${response.status})`);
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          lastError = 'Request timeout (5s)';
          console.log(`   ⚠️  Request timeout (attempt ${attempt}/3)`);
        } else {
          lastError = fetchError.message || String(fetchError);
          throw fetchError; // Re-throw to be caught by outer catch
        }
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
        }
      }
    } catch (error: any) {
      lastError = error.message || String(error);
      
      // Provide more helpful error messages
      if (error.message?.includes('fetch failed') || error.message?.includes('ECONNREFUSED')) {
        console.log(`   ⚠️  Network error (attempt ${attempt}/3): Cannot reach ${uiUrl}`);
        console.log(`      This is likely a network/connectivity issue, not a code bug.`);
        console.log(`      Check if the frontend service is running and accessible.`);
      } else if (error.message?.includes('timeout')) {
        console.log(`   ⚠️  Request timeout (attempt ${attempt}/3)`);
      } else {
        console.log(`   ⚠️  Could not check registry (attempt ${attempt}/3): ${error.message}`);
      }
      
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
      }
    }
  }
  
  if (!registered) {
    console.log('');
    console.log('   ⚠️  WARNING: Could not verify call registration');
    if (lastError) {
      console.log(`   Last error: ${lastError}`);
    }
    console.log('');
    console.log('   Possible causes:');
    if (lastError?.includes('fetch failed') || lastError?.includes('ECONNREFUSED')) {
      console.log('   - Network connectivity issue (cannot reach frontend service)');
      console.log(`   - Frontend service may not be running at: ${uiUrl}`);
      console.log('   - Check firewall/network settings');
    } else {
      console.log('   - Redis connection issue in ingest service');
      console.log('   - Call registry module not loaded correctly');
      console.log('   - Registration failed silently');
    }
    console.log('');
    console.log('   The UI may still work if you manually enter the interaction ID:');
    console.log(`   ${interactionId}`);
    console.log('');
    console.log('   To verify call registry health, check:');
    console.log(`   ${uiUrl}/api/health`);
    console.log('');
    console.log('   Check ingest service logs for registration errors.');
  }
  
  console.log('');
  console.log('⏳ Waiting 60 seconds for transcripts to appear...');
  console.log('   (You can stop this script with Ctrl+C)');
  console.log('');
  
  await new Promise(resolve => setTimeout(resolve, 60000));
  
  console.log('');
  console.log('✅ Monitoring complete');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  let wavDir: string | undefined;
  let wsUrl = process.env.WS_URL || 'wss://ingestservice.onrender.com/v1/ingest';
  let uiUrl = process.env.UI_URL || 'https://frontend-8jdd.onrender.com';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && i + 1 < args.length) {
      wavDir = args[i + 1];
      i++;
    } else if (args[i] === '--url' && i + 1 < args.length) {
      wsUrl = args[i + 1];
      i++;
    } else if (args[i] === '--ui-url' && i + 1 < args.length) {
      uiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Complete End-to-End Test with WAV Audio Files

Streams all WAV files sequentially in ONE continuous call.
The UI will auto-discover the interaction ID.

Usage:
  npx tsx scripts/test-e2e-with-wav-file.ts --dir <path> [options]

Options:
  --dir <path>        Directory with WAV files (required)
  --url <ws_url>      WebSocket URL (default: wss://ingestservice.onrender.com/v1/ingest)
  --ui-url <url>      Frontend UI URL (default: https://frontend-8jdd.onrender.com)

Examples:
  # Stream all WAV files from directory
  npx tsx scripts/test-e2e-with-wav-file.ts --dir /path/to/wav/files

  # Use local services
  npx tsx scripts/test-e2e-with-wav-file.ts --dir /path/to/wav/files \\
    --url ws://localhost:8443/v1/ingest \\
    --ui-url http://localhost:3000
`);
      process.exit(0);
    }
  }
  
  if (!wavDir) {
    console.error('❌ Error: --dir is required');
    console.error('');
    console.error('Usage:');
    console.error('  npx tsx scripts/test-e2e-with-wav-file.ts --dir <path>');
    process.exit(1);
  }
  
  try {
    console.log('🧪 Complete End-to-End Test with WAV Audio Files');
    console.log('='.repeat(60));
    
    // Step 1: Load all WAV files
    console.log('📁 Step 1: Loading all WAV files...');
    const audioFiles = loadAllWavFiles(wavDir);
    const targetSampleRate = audioFiles[0].sampleRate; // Use first file's sample rate
    
    console.log('');
    
    // Step 2: Stream all files sequentially
    console.log('📤 Step 2: Streaming all files sequentially in one continuous call...');
    const { interactionId, framesSent } = await streamAllFilesSequentially(
      wsUrl,
      audioFiles,
      targetSampleRate
    );
    console.log(`✅ Streaming complete: ${framesSent} frames sent`);
    
    // Step 3: Monitor UI
    await monitorUI(interactionId, uiUrl);
    
    console.log('');
    console.log('🎉 Test Complete!');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   Interaction ID: ${interactionId}`);
    console.log(`   Files Streamed: ${audioFiles.length}`);
    console.log(`   Frames Sent: ${framesSent}`);
    console.log(`   Check UI: ${uiUrl}/test-agent-assist`);
    console.log(`   (UI should auto-discover interaction ID: ${interactionId})`);
    console.log('');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

