#!/usr/bin/env ts-node

/**
 * Redis Cleanup Script
 * Cleans up old transcript streams, call metadata, and consumer groups
 * to free up Redis memory (currently at 33.8MB / 30MB = 112.7%)
 */

import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface KeyInfo {
  key: string;
  type: string;
  size: number;
  ttl: number;
  messageCount?: number;
}

async function getMemoryInfo(redis: Redis): Promise<any> {
  const info = await redis.info('memory');
  const lines = info.split('\r\n');
  const memory: any = {};
  
  for (const line of lines) {
    if (line.includes(':')) {
      const [key, value] = line.split(':');
      memory[key] = value;
    }
  }
  
  return memory;
}

async function getKeyInfo(redis: Redis, key: string): Promise<KeyInfo | null> {
  try {
    const type = await redis.type(key);
    const ttl = await redis.ttl(key);
    
    let size = 0;
    let messageCount = 0;
    
    if (type === 'stream') {
      // Get stream length (number of messages)
      messageCount = await redis.xlen(key);
      // Estimate size: ~500 bytes per message (rough estimate)
      size = messageCount * 500;
    } else if (type === 'string') {
      const value = await redis.get(key);
      size = value ? Buffer.byteLength(value, 'utf8') : 0;
    } else if (type === 'none') {
      return null; // Key doesn't exist
    }
    
    return {
      key,
      type,
      size,
      ttl,
      messageCount,
    };
  } catch (error: any) {
    console.error(`Error getting info for key ${key}:`, error.message);
    return null;
  }
}

async function listAllKeys(redis: Redis): Promise<KeyInfo[]> {
  console.log('🔍 Scanning Redis keys...\n');
  
  const keys: KeyInfo[] = [];
  let cursor = '0';
  let scanCount = 0;
  
  do {
    const result = await redis.scan(cursor, 'MATCH', '*', 'COUNT', '100');
    const [nextCursor, keyList] = result;
    cursor = nextCursor;
    scanCount++;
    
    console.log(`  Scanned ${scanCount} batches, found ${keys.length} keys so far...`);
    
    for (const key of keyList) {
      const info = await getKeyInfo(redis, key);
      if (info) {
        keys.push(info);
      }
    }
  } while (cursor !== '0');
  
  return keys;
}

async function deleteOldTranscriptStreams(redis: Redis, olderThanHours: number = 24): Promise<number> {
  console.log(`\n🗑️  Deleting transcript streams older than ${olderThanHours} hours...\n`);
  
  let cursor = '0';
  let deletedCount = 0;
  const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
  
  do {
    const result = await redis.scan(cursor, 'MATCH', 'transcript.*', 'COUNT', '100');
    const [nextCursor, keys] = result;
    cursor = nextCursor;
    
    for (const key of keys) {
      try {
        // Check stream creation time (first message timestamp)
        const messages = await redis.xrange(key, '-', '+', 'COUNT', 1);
        if (messages.length > 0) {
          const firstMessageId = messages[0][0];
          // Extract timestamp from message ID (format: timestamp-sequence)
          const timestamp = parseInt(firstMessageId.split('-')[0]);
          const streamAge = Date.now() - timestamp;
          
          if (streamAge > cutoffTime) {
            // Also delete consumer groups
            try {
              const groups = await redis.xinfo('GROUPS', key);
              for (const group of groups) {
                if (Array.isArray(group) && group.length >= 2) {
                  const groupName = group[1];
                  await redis.del(key); // Deleting stream also deletes groups
                }
              }
            } catch (e) {
              // Ignore errors (group might not exist)
            }
            
            await redis.del(key);
            deletedCount++;
            console.log(`  ✅ Deleted: ${key} (age: ${Math.round(streamAge / (60 * 60 * 1000))} hours)`);
          }
        }
      } catch (error: any) {
        console.error(`  ⚠️  Error deleting ${key}:`, error.message);
      }
    }
  } while (cursor !== '0');
  
  return deletedCount;
}

async function deleteOldCallMetadata(redis: Redis): Promise<number> {
  console.log(`\n🗑️  Deleting expired call metadata...\n`);
  
  let cursor = '0';
  let deletedCount = 0;
  
  do {
    const result = await redis.scan(cursor, 'MATCH', 'call:metadata:*', 'COUNT', '100');
    const [nextCursor, keys] = result;
    cursor = nextCursor;
    
    for (const key of keys) {
      try {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // Key has no TTL (shouldn't happen, but clean it up)
          await redis.del(key);
          deletedCount++;
          console.log(`  ✅ Deleted key without TTL: ${key}`);
        } else if (ttl === -2) {
          // Key already expired (shouldn't be in scan, but handle it)
          deletedCount++;
        }
        // Keys with TTL > 0 are still valid, keep them
      } catch (error: any) {
        console.error(`  ⚠️  Error checking ${key}:`, error.message);
      }
    }
  } while (cursor !== '0');
  
  return deletedCount;
}

async function trimTranscriptStreams(redis: Redis, maxMessages: number = 100): Promise<number> {
  console.log(`\n✂️  Trimming transcript streams to last ${maxMessages} messages...\n`);
  
  let cursor = '0';
  let trimmedCount = 0;
  
  do {
    const result = await redis.scan(cursor, 'MATCH', 'transcript.*', 'COUNT', '100');
    const [nextCursor, keys] = result;
    cursor = nextCursor;
    
    for (const key of keys) {
      try {
        const currentLength = await redis.xlen(key);
        if (currentLength > maxMessages) {
          // Trim to last maxMessages messages
          await redis.xtrim(key, 'MAXLEN', '~', maxMessages.toString());
          trimmedCount++;
          console.log(`  ✅ Trimmed: ${key} (was ${currentLength} messages, now ~${maxMessages})`);
        }
      } catch (error: any) {
        console.error(`  ⚠️  Error trimming ${key}:`, error.message);
      }
    }
  } while (cursor !== '0');
  
  return trimmedCount;
}

async function main() {
  console.log('🧹 Redis Cleanup Script');
  console.log('======================\n');
  console.log(`Redis URL: ${REDIS_URL.replace(/:[^:@]+@/, ':****@')}\n`);
  
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  
  try {
    await redis.ping();
    console.log('✅ Connected to Redis\n');
    
    // Step 1: Check memory before
    console.log('📊 Memory Usage (BEFORE):');
    const memoryBefore = await getMemoryInfo(redis);
    console.log(`  Used Memory: ${(parseInt(memoryBefore.used_memory) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Used Memory Human: ${memoryBefore.used_memory_human}`);
    console.log(`  Max Memory: ${memoryBefore.maxmemory_human || 'Not set'}`);
    console.log(`  Memory Usage %: ${memoryBefore.used_memory_peak_perc || 'N/A'}%\n`);
    
    // Step 2: List all keys
    const allKeys = await listAllKeys(redis);
    console.log(`\n📋 Found ${allKeys.length} total keys:\n`);
    
    // Group by type
    const byType: Record<string, KeyInfo[]> = {};
    for (const key of allKeys) {
      if (!byType[key.type]) {
        byType[key.type] = [];
      }
      byType[key.type].push(key);
    }
    
    for (const [type, keys] of Object.entries(byType)) {
      const totalSize = keys.reduce((sum, k) => sum + k.size, 0);
      console.log(`  ${type.toUpperCase()}: ${keys.length} keys (~${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
      
      if (type === 'stream') {
        const transcriptStreams = keys.filter(k => k.key.startsWith('transcript.'));
        const audioStreams = keys.filter(k => k.key.startsWith('audio'));
        console.log(`    - Transcript streams: ${transcriptStreams.length}`);
        console.log(`    - Audio streams: ${audioStreams.length}`);
        
        // Show top 10 largest streams
        const sorted = transcriptStreams.sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
        console.log(`    - Top 5 largest streams:`);
        for (const stream of sorted.slice(0, 5)) {
          console.log(`      • ${stream.key}: ${stream.messageCount} messages (~${(stream.size / 1024).toFixed(2)} KB)`);
        }
      }
    }
    
    // Step 3: Cleanup options
    console.log('\n\n🧹 Starting Cleanup (Option 4: All cleanup)...\n');
    
    let totalDeleted = 0;
    let totalTrimmed = 0;
    
    // Delete old transcript streams (older than 24 hours)
    const deleted = await deleteOldTranscriptStreams(redis, 24);
    totalDeleted += deleted;
    console.log(`\n✅ Deleted ${deleted} old transcript streams`);
    
    // Trim all streams to last 100 messages
    const trimmed = await trimTranscriptStreams(redis, 100);
    totalTrimmed += trimmed;
    console.log(`\n✅ Trimmed ${trimmed} transcript streams`);
    
    // Delete expired call metadata
    const deletedMetadata = await deleteOldCallMetadata(redis);
    totalDeleted += deletedMetadata;
    console.log(`\n✅ Deleted ${deletedMetadata} expired call metadata keys`);
    
    // Step 4: Check memory after
    console.log('\n\n📊 Memory Usage (AFTER):');
    const memoryAfter = await getMemoryInfo(redis);
    console.log(`  Used Memory: ${(parseInt(memoryAfter.used_memory) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Used Memory Human: ${memoryAfter.used_memory_human}`);
    const memorySaved = parseInt(memoryBefore.used_memory) - parseInt(memoryAfter.used_memory);
    console.log(`  Memory Saved: ${(memorySaved / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Memory Reduction: ${((memorySaved / parseInt(memoryBefore.used_memory)) * 100).toFixed(1)}%`);
    
    console.log('\n✅ Cleanup complete!\n');
    console.log(`Summary:`);
    console.log(`  - Deleted ${totalDeleted} keys`);
    console.log(`  - Trimmed ${totalTrimmed} streams`);
    console.log(`  - Memory freed: ${(memorySaved / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

