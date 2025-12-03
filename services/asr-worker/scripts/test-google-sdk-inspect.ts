/**
 * Inspect what the SDK is actually sending
 */
import { SpeechClient, protos } from '@google-cloud/speech';
import * as util from 'util';

async function inspectSDK() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  await client.initialize();

  // Get the actual gRPC stub to see what's happening
  const stub = await (client as any).speechStub;
  console.log('Stub type:', stub.constructor.name);
  
  // Try calling streamingRecognize directly on stub
  const stream = stub.streamingRecognize();
  console.log('Stream type:', stream.constructor.name);
  console.log('Stream methods:', Object.getOwnPropertyNames(stream).filter(n => !n.startsWith('_')).slice(0, 10));
  
  // Try using the SDK's method but with explicit options
  console.log('\nTrying SDK streamingRecognize with explicit options...');
  const sdkStream = client.streamingRecognize();
  
  // Intercept the underlying write
  const originalWrite = sdkStream.write.bind(sdkStream);
  sdkStream.write = function(chunk: any, encoding?: any, cb?: any) {
    console.log('\n=== INTERCEPTED WRITE ===');
    console.log('Chunk:', util.inspect(chunk, { depth: 3 }));
    
    // Check if this is being transformed
    const result = originalWrite(chunk, encoding, cb);
    return result;
  };
  
  sdkStream.on('error', (error: any) => {
    console.error('Error:', error.message);
  });
  
  // Try sending config
  const request = {
    streamingConfig: {
      config: {
        encoding: 1, // LINEAR16 enum
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  };
  
  console.log('\nSending request:', util.inspect(request, { depth: 3 }));
  sdkStream.write(request);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  sdkStream.end();
}

inspectSDK().catch(console.error);
