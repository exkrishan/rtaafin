/**
 * Try to bypass SDK's transformation by using gRPC directly
 */
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import * as fs from 'fs';

async function testBypassSDK() {
  // Load protos directly
  const PROTO_PATH = path.join(__dirname, '../../node_modules/@google-cloud/speech/protos/google/cloud/speech/v1/cloud_speech.proto');
  
  if (!fs.existsSync(PROTO_PATH)) {
    console.error('Proto file not found:', PROTO_PATH);
    return;
  }

  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const speechProto = grpc.loadPackageDefinition(packageDefinition) as any;
  const speech = speechProto.google.cloud.speech.v1;

  // Create credentials
  const keyFile = '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json';
  const keyData = JSON.parse(fs.readFileSync(keyFile, 'utf8'));

  // Create gRPC channel
  const sslCreds = grpc.credentials.createSsl();
  const callCreds = grpc.credentials.createFromMetadataGenerator((params, callback) => {
    // This is complex - let's try a different approach
    callback(null, new grpc.Metadata());
  });

  const combinedCreds = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);

  const client = new speech.Speech('speech.googleapis.com:443', combinedCreds);

  console.log('Created gRPC client directly');
  // This approach is too complex - let's try something else
}

// Actually, let's try checking if maybe the issue is with the model parameter
// Some models might not be available or might require different config
async function testDifferentModel() {
  const { SpeechClient, protos } = require('@google-cloud/speech');
  
  const client = new SpeechClient({
    keyFilename: '/Users/kirti.krishnan/Downloads/gen-lang-client-0415704882-df806bf42475.json',
    projectId: 'gen-lang-client-0415704882',
  });

  const stream = client.streamingRecognize();

  stream.on('error', (error: any) => {
    console.error('Error:', error.message);
  });

  stream.on('data', (data) => {
    console.log('✅ SUCCESS!');
  });

  // Try without model parameter - maybe model is causing issues
  const request = {
    streamingConfig: {
      config: {
        encoding: 1, // LINEAR16 enum value
        sampleRateHertz: 8000,
        languageCode: 'en-US',
        // NO model field
      },
      interimResults: true,
    },
  };

  console.log('Testing without model parameter...');
  stream.write(request);

  await new Promise(resolve => setTimeout(resolve, 2000));
  stream.end();
}

testDifferentModel().catch(console.error);
