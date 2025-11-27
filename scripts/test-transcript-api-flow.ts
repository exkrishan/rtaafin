
import Redis from 'ioredis';
import { NextRequest } from 'next/server';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local BEFORE importing route
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Mock the environment variables if not present
process.env.REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379';

const TEST_CALL_ID = `test-unit-${Date.now()}`;
const REDIS_URL = process.env.REDIS_URL;

// UI Expected Interface (from useRealtimeTranscript.ts)
interface TranscriptUtterance {
  id: string;
  text: string;
  speaker: 'agent' | 'customer';
  timestamp: string;
  seq?: number;
  confidence?: number;
}

interface ApiResponse {
  ok: boolean;
  callId: string;
  transcripts: TranscriptUtterance[];
  count: number;
}

async function runTest() {
  console.log('🧪 Starting Unit Test: Transcript Redis -> API Flow');
  console.log('==================================================');
  console.log(`🆔 Test Call ID: ${TEST_CALL_ID}`);

  if (!REDIS_URL) {
    throw new Error('REDIS_URL is not defined');
  }

  const redis = new Redis(REDIS_URL);

  try {
    // 1. CLEANUP (Ensure clean state)
    await redis.del(`transcripts:${TEST_CALL_ID}`);
    console.log('✅ Cleanup: Cleared existing Redis data');

    // 2. SIMULATE ASR WORKER (Push data to Redis)
    const mockTranscripts = [
      {
        interaction_id: TEST_CALL_ID,
        tenant_id: 'default',
        seq: 1,
        type: 'final',
        text: 'Hello, thanks for calling support.',
        confidence: 0.98,
        timestamp_ms: Date.now() - 5000
      },
      {
        interaction_id: TEST_CALL_ID,
        tenant_id: 'default',
        seq: 2,
        type: 'final',
        text: 'Hi, I am having trouble with my account.',
        confidence: 0.95,
        timestamp_ms: Date.now() - 2000
      }
    ];

    for (const t of mockTranscripts) {
      await redis.rpush(`transcripts:${TEST_CALL_ID}`, JSON.stringify(t));
    }
    console.log(`✅ Setup: Pushed ${mockTranscripts.length} mock transcripts to Redis List`);

    // 3. TEST API ENDPOINT
    // Dynamically import the route to ensure env vars are loaded first
    const { GET } = await import('../app/api/transcripts/latest/route');

    // Create a mock request
    const url = `http://localhost:3000/api/transcripts/latest?callId=${TEST_CALL_ID}`;
    const req = new NextRequest(url);

    console.log('🔄 Invoking API Handler...');
    const response = await GET(req);

    
    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data: ApiResponse = await response.json();
    console.log('✅ API Response received');

    // 4. VALIDATE RESPONSE FORMAT (UI Contract)
    console.log('\n🔍 Validating Response Format against UI expectations...');
    
    if (!data.ok) throw new Error('Response.ok should be true');
    if (data.callId !== TEST_CALL_ID) throw new Error(`Call ID mismatch. Expected ${TEST_CALL_ID}, got ${data.callId}`);
    if (data.count !== 2) throw new Error(`Count mismatch. Expected 2, got ${data.count}`);
    if (!Array.isArray(data.transcripts)) throw new Error('Transcripts should be an array');

    // Validate first utterance
    const u1 = data.transcripts[0];
    console.log('\nChecking Utterance 1:');
    validateField(u1, 'id', `${TEST_CALL_ID}-1`);
    validateField(u1, 'text', 'Hello, thanks for calling support.');
    // API currently alternates speaker: index 0 -> customer, index 1 -> agent
    validateField(u1, 'speaker', 'customer'); 
    validateField(u1, 'seq', 1);
    
    const u2 = data.transcripts[1];
    console.log('\nChecking Utterance 2:');
    validateField(u2, 'id', `${TEST_CALL_ID}-2`);
    validateField(u2, 'text', 'Hi, I am having trouble with my account.');
    validateField(u2, 'speaker', 'agent');
    validateField(u2, 'seq', 2);

    console.log('\n✅ Timestamp format check: ' + u1.timestamp);
    if (isNaN(Date.parse(u1.timestamp))) {
        throw new Error('Timestamp is not a valid ISO string');
    }

    console.log('\n🎉 SUCCESS: API correctly retrieves Redis data in UI-compatible format!');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await redis.del(`transcripts:${TEST_CALL_ID}`);
    redis.disconnect();
  }
}

function validateField(obj: any, field: string, expected: any) {
    if (obj[field] !== expected) {
        throw new Error(`Field mismatch for '${field}'. Expected: '${expected}', Got: '${obj[field]}'`);
    }
    console.log(`  ✓ ${field}: ${obj[field]}`);
}

runTest();

