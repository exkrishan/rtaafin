/**
 * Deep debug - check what's actually being sent to the API
 */
import { SpeechClient, protos } from '@google-cloud/speech';
import * as util from 'util';

async function testDeepDebug() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  // Intercept the write method to see what's being sent
  const originalWrite = stream.write.bind(stream);
  (stream as any).write = function(chunk: any, encoding?: any, cb?: any) {
    console.log('\n=== WRITE CALLED ===');
    console.log('Chunk type:', typeof chunk);
    console.log('Chunk keys:', chunk ? Object.keys(chunk) : 'null');
    console.log('Full chunk:', util.inspect(chunk, { depth: 5, colors: true }));
    
    // Check if audioContent exists
    if (chunk && 'audioContent' in chunk) {
      console.log('⚠️  WARNING: audioContent found in chunk!');
      console.log('audioContent value:', chunk.audioContent);
      console.log('audioContent type:', typeof chunk.audioContent);
      console.log('audioContent is Buffer:', Buffer.isBuffer(chunk.audioContent));
      if (Buffer.isBuffer(chunk.audioContent)) {
        console.log('audioContent length:', chunk.audioContent.length);
      }
    }
    
    if (chunk && 'streamingConfig' in chunk) {
      console.log('✅ streamingConfig found');
      console.log('streamingConfig keys:', Object.keys(chunk.streamingConfig || {}));
    }
    
    console.log('===================\n');
    
    return originalWrite(chunk, encoding, cb);
  };

  stream.on('error', (error: any) => {
    console.error('❌ Stream error:', error.message);
    console.error('Error code:', error.code);
  });

  // Test 1: Send config
  console.log('TEST 1: Sending config only...');
  const configRequest = {
    streamingConfig: {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  };
  
  // Explicitly check before sending
  console.log('Before write - configRequest has audioContent?', 'audioContent' in configRequest);
  console.log('Before write - configRequest keys:', Object.keys(configRequest));
  
  stream.write(configRequest);

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testDeepDebug().catch(console.error);
