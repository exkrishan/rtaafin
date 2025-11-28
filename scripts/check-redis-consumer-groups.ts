/**
 * Check Redis consumer groups and pending messages
 */

import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const REDIS_URL = process.env.REDIS_URL || 'redis://default:UC0l9DYDSnkd2Ko468JaHAg7h35GieDm@redis-13289.c84.us-east-1-2.ec2.cloud.redislabs.com:13289';

async function checkConsumerGroups() {
  const redis = new Redis(REDIS_URL);
  const audioStreamKey = 'audio_stream';
  
  try {
    console.log(`\n🔍 Checking Redis Consumer Groups for ${audioStreamKey}\n`);
    
    // Get consumer groups
    try {
      const groups = await redis.xinfo('GROUPS', audioStreamKey);
      console.log(`📊 Consumer Groups:`);
      
      if (groups && groups.length > 0) {
        // Parse groups info (Redis returns array of [key, value, key, value, ...])
        for (let i = 0; i < groups.length; i += 2) {
          const key = groups[i];
          const value = groups[i + 1];
          
          if (typeof key === 'string' && key === 'name') {
            const groupName = value as string;
            console.log(`\n   Group: ${groupName}`);
            
            // Get consumers in this group
            try {
              const consumers = await redis.xinfo('CONSUMERS', audioStreamKey, groupName);
              console.log(`   Consumers: ${consumers ? 'Found' : 'None'}`);
              
              // Get pending messages for this group
              try {
                const pending = await redis.xpending(audioStreamKey, groupName, '-', '+', 10);
                if (pending && pending.length > 0) {
                  console.log(`   Pending messages: ${pending.length}`);
                  pending.slice(0, 5).forEach((msg: any) => {
                    console.log(`     - ID: ${msg[0]}, Consumer: ${msg[1]}, Idle: ${msg[2]}ms`);
                  });
                } else {
                  console.log(`   Pending messages: 0 (all consumed)`);
                }
              } catch (err: any) {
                console.log(`   Pending check error: ${err.message}`);
              }
            } catch (err: any) {
              console.log(`   Consumers check error: ${err.message}`);
            }
          }
        }
      } else {
        console.log(`   ⚠️ No consumer groups found`);
      }
    } catch (err: any) {
      if (err.message?.includes('no such key')) {
        console.log(`   ⚠️ Stream ${audioStreamKey} does not exist`);
      } else {
        console.error(`   ❌ Error: ${err.message}`);
      }
    }
    
    // Check for messages around our test call time
    console.log(`\n🔍 Checking for test call messages (test-call-*)...`);
    const messages = await redis.xrevrange(audioStreamKey, '+', '-', 'COUNT', 100);
    
    let testCallMessages = 0;
    messages.forEach((msg) => {
      const [id, fields] = msg;
      const data: any = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }
      
      if (data.data) {
        try {
          const audioData = JSON.parse(data.data);
          if (audioData.interaction_id?.includes('test-call-')) {
            testCallMessages++;
            if (testCallMessages <= 3) {
              console.log(`   ✅ Found test call message:`, {
                id,
                interaction_id: audioData.interaction_id,
                seq: audioData.seq,
                timestamp: audioData.timestamp_ms,
              });
            }
          }
        } catch (e) {
          // Not JSON
        }
      }
    });
    
    if (testCallMessages > 0) {
      console.log(`\n   ✅ Found ${testCallMessages} messages from test calls`);
    } else {
      console.log(`\n   ⚠️ No messages found from test calls`);
      console.log(`   This means either:`);
      console.log(`   1. Messages were never published to Redis`);
      console.log(`   2. Messages were consumed and ACKed immediately`);
      console.log(`   3. Messages expired (if TTL is set)`);
    }
    
  } catch (error: any) {
    console.error(`❌ Error:`, error.message);
  } finally {
    await redis.quit();
  }
}

checkConsumerGroups();

