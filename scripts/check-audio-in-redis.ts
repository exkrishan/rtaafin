/**
 * Quick script to check if audio was published to Redis
 */

import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const REDIS_URL = process.env.REDIS_URL || 'redis://default:UC0l9DYDSnkd2Ko468JaHAg7h35GieDm@redis-13289.c84.us-east-1-2.ec2.cloud.redislabs.com:13289';

async function checkAudioStream() {
  const redis = new Redis(REDIS_URL);
  
  try {
    // Check audio_stream topic
    const audioStreamKey = 'audio_stream';
    
    // Get latest messages from the stream (check last 50 to find our test)
    const messages = await redis.xrevrange(audioStreamKey, '+', '-', 'COUNT', 50);
    
    console.log(`\n📊 Audio Stream Check:`);
    console.log(`   Found ${messages.length} recent messages in audio_stream\n`);
    
    if (messages.length > 0) {
      // Parse messages and look for our test call
      const parsedMessages: any[] = [];
      let testCallFound = false;
      
      messages.forEach((msg) => {
        const [id, fields] = msg;
        const data: any = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        
        // Parse the data field if it exists
        let audioData: any = {};
        if (data.data) {
          try {
            audioData = JSON.parse(data.data);
          } catch (e) {
            // Not JSON, use as-is
          }
        }
        
        const interactionId = audioData.interaction_id || data.interaction_id || 'N/A';
        const isTestCall = interactionId.includes('test-call-');
        
        if (isTestCall) {
          testCallFound = true;
        }
        
        parsedMessages.push({
          id,
          interactionId,
          seq: audioData.seq || data.seq || 'N/A',
          timestamp: audioData.timestamp_ms || data.timestamp_ms || 'N/A',
          audioSize: audioData.audio ? Buffer.from(audioData.audio, 'base64').length : 0,
          isTestCall,
        });
      });
      
      // Show test call messages first
      const testMessages = parsedMessages.filter(m => m.isTestCall);
      const otherMessages = parsedMessages.filter(m => !m.isTestCall).slice(0, 5);
      
      if (testMessages.length > 0) {
        console.log(`   ✅ Found ${testMessages.length} messages from our test call:\n`);
        testMessages.slice(0, 10).forEach((msg, idx) => {
          console.log(`   Test Message ${idx + 1} (ID: ${msg.id}):`);
          console.log(`     interaction_id: ${msg.interactionId}`);
          console.log(`     seq: ${msg.seq}`);
          console.log(`     timestamp: ${msg.timestamp}`);
          console.log(`     audio_size: ${msg.audioSize} bytes`);
          console.log('');
        });
      } else {
        console.log(`   ⚠️ No messages found from our test call`);
        console.log(`   Showing 5 recent messages from other calls:\n`);
        otherMessages.forEach((msg, idx) => {
          console.log(`   Message ${idx + 1} (ID: ${msg.id}):`);
          console.log(`     interaction_id: ${msg.interactionId}`);
          console.log(`     seq: ${msg.seq}`);
          console.log(`     timestamp: ${msg.timestamp}`);
          console.log(`     audio_size: ${msg.audioSize} bytes`);
          console.log('');
        });
      }
    } else {
      console.log(`   ⚠️ No messages found in audio_stream`);
      console.log(`   This means the ingest service may not be publishing to Redis\n`);
    }
    
    // Check for any transcript lists
    const transcriptKeys = await redis.keys('transcripts:*');
    console.log(`\n📝 Transcript Lists Found: ${transcriptKeys.length}`);
    if (transcriptKeys.length > 0) {
      transcriptKeys.slice(0, 5).forEach(key => {
        console.log(`   ${key}`);
      });
    }
    
  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
  } finally {
    await redis.quit();
  }
}

checkAudioStream();

