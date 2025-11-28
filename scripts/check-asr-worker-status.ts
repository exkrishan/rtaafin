/**
 * Check ASR worker status and recent activity
 */

import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const REDIS_URL = process.env.REDIS_URL || 'redis://default:UC0l9DYDSnkd2Ko468JaHAg7h35GieDm@redis-13289.c84.us-east-1-2.ec2.cloud.redislabs.com:13289';

async function checkASRWorkerStatus() {
  const redis = new Redis(REDIS_URL);
  
  try {
    console.log(`\n🔍 Checking ASR Worker Status\n`);
    
    // Check audio_stream for recent messages
    const audioStreamKey = 'audio_stream';
    const messages = await redis.xrevrange(audioStreamKey, '+', '-', 'COUNT', 20);
    
    console.log(`📊 Audio Stream (last 20 messages):`);
    if (messages.length > 0) {
      const testCallMessages = messages.filter((msg) => {
        const [id, fields] = msg;
        const data: any = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        if (data.data) {
          try {
            const audioData = JSON.parse(data.data);
            return audioData.interaction_id?.includes('test-call-');
          } catch (e) {
            return false;
          }
        }
        return false;
      });
      
      if (testCallMessages.length > 0) {
        console.log(`   ✅ Found ${testCallMessages.length} messages from test calls`);
        testCallMessages.slice(0, 5).forEach((msg) => {
          const [id, fields] = msg;
          const data: any = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }
          try {
            const audioData = JSON.parse(data.data);
            console.log(`   - ID: ${id}, interaction_id: ${audioData.interaction_id}, seq: ${audioData.seq}`);
          } catch (e) {
            console.log(`   - ID: ${id}, (parse error)`);
          }
        });
      } else {
        console.log(`   ⚠️ No messages from test calls found`);
        console.log(`   Showing 3 most recent messages:`);
        messages.slice(0, 3).forEach((msg) => {
          const [id, fields] = msg;
          const data: any = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }
          if (data.data) {
            try {
              const audioData = JSON.parse(data.data);
              console.log(`   - ID: ${id}, interaction_id: ${audioData.interaction_id}, seq: ${audioData.seq}`);
            } catch (e) {
              console.log(`   - ID: ${id}, (parse error)`);
            }
          }
        });
      }
    } else {
      console.log(`   ⚠️ No messages in audio_stream`);
    }
    
    // Check consumer groups (to see if ASR worker is consuming)
    try {
      const consumerGroups = await redis.xinfo('GROUPS', audioStreamKey);
      console.log(`\n👥 Consumer Groups for audio_stream:`);
      if (consumerGroups && consumerGroups.length > 0) {
        // Consumer groups info is in a specific format
        for (let i = 0; i < consumerGroups.length; i += 2) {
          const key = consumerGroups[i];
          const value = consumerGroups[i + 1];
          if (typeof key === 'string' && key.includes('name')) {
            console.log(`   - ${value}`);
          }
        }
      } else {
        console.log(`   ⚠️ No consumer groups found (ASR worker may not be consuming)`);
      }
    } catch (err: any) {
      console.log(`   ⚠️ Could not check consumer groups: ${err.message}`);
    }
    
    // Check for transcripts
    const transcriptKeys = await redis.keys('transcripts:*');
    console.log(`\n📝 Transcript Lists: ${transcriptKeys.length} found`);
    if (transcriptKeys.length > 0) {
      // Check the most recent ones
      for (const key of transcriptKeys.slice(-5)) {
        const transcripts = await redis.lrange(key, 0, -1);
        const interactionId = key.replace('transcripts:', '');
        console.log(`   ${key}: ${transcripts.length} transcript(s)`);
        if (transcripts.length > 0 && interactionId.includes('test-call-')) {
          console.log(`     ✅ Found transcripts for test call!`);
          transcripts.slice(-3).forEach((t, idx) => {
            try {
              const transcript = JSON.parse(t);
              console.log(`       ${transcripts.length - idx}. ${transcript.text?.substring(0, 100) || '(empty)'}`);
            } catch (e) {
              console.log(`       ${transcripts.length - idx}. (parse error)`);
            }
          });
        }
      }
    }
    
  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
  } finally {
    await redis.quit();
  }
}

checkASRWorkerStatus();

