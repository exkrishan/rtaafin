/**
 * Test script to ingest a credit card related transcript
 * Tests intent detection and KB article surfacing
 * 
 * Usage:
 *   npx tsx scripts/test-ingest-credit-card.ts
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
const CALL_ID = `test-credit-card-${Date.now()}`;
const TENANT_ID = 'default';

// Credit card related transcript
const creditCardTranscript = [
  {
    seq: 1,
    ts: new Date(Date.now() - 30000).toISOString(),
    text: "Customer: Hi, I'm calling about my Platinum Credit Card. I noticed a fraudulent transaction yesterday.",
  },
  {
    seq: 2,
    ts: new Date(Date.now() - 28000).toISOString(),
    text: "Agent: I understand your concern. Let me help you with that. Can you provide your card number ending in?",
  },
  {
    seq: 3,
    ts: new Date(Date.now() - 26000).toISOString(),
    text: "Customer: Yes, it's ending in 7792. The transaction was for $500 at a store I've never been to.",
  },
  {
    seq: 4,
    ts: new Date(Date.now() - 24000).toISOString(),
    text: "Agent: Thank you. I can see the unauthorized charge on your account. I'll help you dispute this transaction and issue a new card.",
  },
  {
    seq: 5,
    ts: new Date(Date.now() - 22000).toISOString(),
    text: "Customer: That would be great. How long will it take to get a replacement card?",
  },
  {
    seq: 6,
    ts: new Date(Date.now() - 20000).toISOString(),
    text: "Agent: Your replacement Platinum Credit Card will be shipped within 2-3 business days. You'll receive it within 7-10 business days via standard mail.",
  },
  {
    seq: 7,
    ts: new Date(Date.now() - 18000).toISOString(),
    text: "Customer: Okay, and what about the fraudulent charge? Will it be removed?",
  },
  {
    seq: 8,
    ts: new Date(Date.now() - 16000).toISOString(),
    text: "Agent: Yes, I've already initiated the dispute process. The charge will be temporarily credited to your account within 24 hours, and we'll investigate the matter.",
  },
  {
    seq: 9,
    ts: new Date(Date.now() - 14000).toISOString(),
    text: "Customer: That's perfect. Should I take any additional security measures?",
  },
  {
    seq: 10,
    ts: new Date(Date.now() - 12000).toISOString(),
    text: "Agent: I recommend enabling transaction alerts for all purchases above $100, and setting up two-factor authentication for your online account.",
  },
  {
    seq: 11,
    ts: new Date(Date.now() - 10000).toISOString(),
    text: "Customer: That sounds good. Can you help me set that up?",
  },
  {
    seq: 12,
    ts: new Date(Date.now() - 8000).toISOString(),
    text: "Agent: Absolutely. I've enabled transaction alerts for your account. You'll receive SMS notifications for all transactions above $100. I'm also sending you a link to set up two-factor authentication.",
  },
  {
    seq: 13,
    ts: new Date(Date.now() - 6000).toISOString(),
    text: "Customer: Thank you so much for your help. This has been very helpful.",
  },
  {
    seq: 14,
    ts: new Date(Date.now() - 4000).toISOString(),
    text: "Agent: You're most welcome. Is there anything else I can assist you with today?",
  },
  {
    seq: 15,
    ts: new Date(Date.now() - 2000).toISOString(),
    text: "Customer: No, that's all. Thanks again!",
  },
];

async function ingestTranscriptLine(line: typeof creditCardTranscript[0]) {
  try {
    const response = await fetch(`${BASE_URL}/api/calls/ingest-transcript`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
      },
      body: JSON.stringify({
        callId: CALL_ID,
        seq: line.seq,
        ts: line.ts,
        text: line.text,
      }),
    });

    const data = await response.json();
    
    if (response.ok && data.ok) {
      console.log(`✅ Line ${line.seq}: Intent="${data.intent}", Confidence=${data.confidence?.toFixed(2) || 'N/A'}, Articles=${data.articles?.length || 0}`);
      
      if (data.articles && data.articles.length > 0) {
        console.log(`   KB Articles found:`);
        data.articles.slice(0, 3).forEach((article: any, idx: number) => {
          console.log(`     ${idx + 1}. ${article.title || article.code || 'Unknown'}`);
        });
      }
      return data;
    } else {
      console.error(`❌ Line ${line.seq}: Error - ${data.error || 'Unknown error'}`);
      return null;
    }
  } catch (err: any) {
    console.error(`❌ Line ${line.seq}: Failed - ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Testing Credit Card Transcript Ingestion\n');
  console.log('='.repeat(60));
  console.log(`Call ID: ${CALL_ID}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Total lines: ${creditCardTranscript.length}\n`);
  console.log('='.repeat(60));
  console.log('');

  const results = [];
  
  for (const line of creditCardTranscript) {
    const result = await ingestTranscriptLine(line);
    results.push(result);
    
    // Wait a bit between lines to simulate real-time ingestion
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r !== null).length;
  const withIntent = results.filter(r => r && r.intent && r.intent !== 'unknown').length;
  const withArticles = results.filter(r => r && r.articles && r.articles.length > 0).length;
  
  console.log(`✅ Successful ingests: ${successful}/${creditCardTranscript.length}`);
  console.log(`🎯 Intent detected: ${withIntent}/${creditCardTranscript.length}`);
  console.log(`📚 KB articles found: ${withArticles}/${creditCardTranscript.length}`);
  
  // Group by intent
  const intentGroups = new Map<string, number>();
  results.forEach(r => {
    if (r && r.intent) {
      intentGroups.set(r.intent, (intentGroups.get(r.intent) || 0) + 1);
    }
  });
  
  if (intentGroups.size > 0) {
    console.log('\n📋 Intent Distribution:');
    Array.from(intentGroups.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([intent, count]) => {
        console.log(`   ${intent}: ${count} times`);
      });
  }
  
  // Collect all unique articles
  const allArticles = new Map<string, any>();
  results.forEach(r => {
    if (r && r.articles) {
      r.articles.forEach((article: any) => {
        const key = article.id || article.code || article.title;
        if (key && !allArticles.has(key)) {
          allArticles.set(key, article);
        }
      });
    }
  });
  
  if (allArticles.size > 0) {
    console.log(`\n📖 Unique KB Articles Found (${allArticles.size}):`);
    Array.from(allArticles.values()).slice(0, 10).forEach((article, idx) => {
      console.log(`   ${idx + 1}. ${article.title || article.code || 'Unknown'}`);
      if (article.snippet) {
        console.log(`      "${article.snippet.substring(0, 60)}..."`);
      }
    });
  }
  
  console.log('\n✅ Test complete!');
  console.log(`\n💡 Open your dashboard and connect to call: ${CALL_ID}`);
  console.log(`   You should see KB articles appearing in the right panel as intents are detected.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

