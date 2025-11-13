/**
 * Try to understand what the SDK is actually sending by checking gRPC level
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testDirectGrpc() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json',
    projectId: 'gen-lang-client-0415704882',
  });

  await client.initialize();

  // Get the inner API call
  const innerApiCall = (client as any).innerApiCalls.streamingRecognize;
  
  // Try calling it directly
  const stream = innerApiCall();
  
  stream.on('error', (error: any) => {
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Details:', error.details);
  });

  stream.on('data', (data) => {
    console.log('✅ Data received!');
  });

  // Create request using protobuf message
  const StreamingRecognizeRequest = protos.google.cloud.speech.v1.StreamingRecognizeRequest;
  
  // Try creating message with only streamingConfig
  const request = StreamingRecognizeRequest.create({
    streamingConfig: {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  });

  // Check what fields are actually set
  console.log('Request fields:', Object.keys(request));
  console.log('Request.audioContent:', (request as any).audioContent);
  console.log('Request.$type:', (request as any).$type);
  
  // Try to explicitly unset audioContent
  if ((request as any).audioContent !== undefined) {
    (request as any).audioContent = undefined;
  }

  console.log('\nSending request...');
  stream.write(request);

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testDirectGrpc().catch(console.error);
