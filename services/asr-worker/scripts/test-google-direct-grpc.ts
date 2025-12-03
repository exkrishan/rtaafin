/**
 * Test using the underlying stream more directly
 * Maybe the SDK's write() method is doing something wrong
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testDirectGrpc() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  // Initialize client first
  await client.initialize();

  const stream = client.streamingRecognize();

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('Code:', error.code);
  });

  stream.on('data', (data) => {
    console.log('✅ Data received!');
  });

  // Try using the stream's internal write method directly
  // Check if stream has a _write or similar method
  console.log('Stream methods:', Object.getOwnPropertyNames(stream).filter(n => !n.startsWith('_')).slice(0, 10));

  // Create request as a plain object with ONLY streamingConfig
  const request: any = {};
  request.streamingConfig = {
    config: {
      encoding: 1, // LINEAR16
      sampleRateHertz: 8000,
      languageCode: 'en-US',
    },
    interimResults: true,
    singleUtterance: false,
  };

  // Explicitly do NOT set audioContent
  console.log('Request structure:', {
    hasStreamingConfig: 'streamingConfig' in request,
    hasAudioContent: 'audioContent' in request,
    keys: Object.keys(request),
  });

  console.log('📤 Writing request...');
  
  // Use write with explicit callback
  const written = stream.write(request, (error?: Error) => {
    if (error) {
      console.error('Write callback error:', error);
    } else {
      console.log('✅ Write callback success');
    }
  });

  console.log('Write returned:', written);

  if (!written) {
    console.log('Waiting for drain...');
    await new Promise(resolve => stream.once('drain', resolve));
  }

  // Wait a significant amount before sending audio
  console.log('Waiting 2 seconds before sending audio...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('📤 Sending audio...');
  const audioRequest: any = {};
  audioRequest.audioContent = Buffer.alloc(4000);
  
  stream.write(audioRequest);

  await new Promise(resolve => setTimeout(resolve, 3000));
  stream.end();
}

testDirectGrpc().catch(console.error);
