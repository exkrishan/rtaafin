/**
 * Test using explicit protobuf message types
 */
import { SpeechClient, protos } from '@google-cloud/speech';

async function testProtobuf() {
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json'
  });

  const stream = client.streamingRecognize();

  stream.on('error', (error: any) => {
    console.error('❌ Error:', error.message);
  });

  stream.on('data', (data) => {
    console.log('✅ Data received');
  });

  // Create request using protobuf message type
  const request = protos.google.cloud.speech.v1.StreamingRecognizeRequest.create({
    streamingConfig: {
      config: {
        encoding: protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sampleRateHertz: 8000,
        languageCode: 'en-US',
      },
      interimResults: true,
    },
  });

  console.log('Request type:', request.constructor.name);
  console.log('Request has audioContent?', 'audioContent' in request);
  console.log('Request.audioContent value:', (request as any).audioContent);
  console.log('Request keys:', Object.keys(request));
  
  // Check the actual protobuf structure
  const requestObj = request.toJSON();
  console.log('Request JSON:', JSON.stringify(requestObj, null, 2));

  console.log('📤 Sending protobuf request...');
  stream.write(request);

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testProtobuf().catch(console.error);
