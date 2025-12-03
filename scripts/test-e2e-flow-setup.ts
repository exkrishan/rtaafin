#!/usr/bin/env tsx
/**
 * End-to-End Flow Testing - Setup Verification Script
 * 
 * Verifies environment variables and service status before running tests
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  status: 'ok' | 'missing' | 'warning';
  message: string;
}

async function checkEnvironment(): Promise<void> {
  console.log('🔍 End-to-End Flow Testing - Environment Verification\n');
  console.log('='.repeat(60));
  console.log('');

  const checks: EnvCheck[] = [
    {
      name: 'REDIS_URL',
      value: process.env.REDIS_URL,
      required: true,
      status: process.env.REDIS_URL ? 'ok' : 'missing',
      message: process.env.REDIS_URL 
        ? `✅ Set: ${process.env.REDIS_URL.substring(0, 20)}...`
        : '❌ Missing - Required for transcript consumer',
    },
    {
      name: 'LLM_API_KEY',
      value: process.env.LLM_API_KEY,
      required: true,
      status: process.env.LLM_API_KEY ? 'ok' : 'missing',
      message: process.env.LLM_API_KEY
        ? `✅ Set: ${process.env.LLM_API_KEY.substring(0, 20)}...`
        : '❌ Missing - Required for intent detection',
    },
    {
      name: 'LLM_PROVIDER',
      value: process.env.LLM_PROVIDER,
      required: false,
      status: process.env.LLM_PROVIDER === 'gemini' ? 'ok' : (process.env.LLM_PROVIDER ? 'warning' : 'warning'),
      message: process.env.LLM_PROVIDER
        ? `⚠️  Set to: ${process.env.LLM_PROVIDER} (should be 'gemini' for Gemini)`
        : '⚠️  Not set (defaults to openai, should be gemini)',
    },
    {
      name: 'GEMINI_MODEL',
      value: process.env.GEMINI_MODEL,
      required: false,
      status: 'ok',
      message: process.env.GEMINI_MODEL
        ? `✅ Set: ${process.env.GEMINI_MODEL}`
        : 'ℹ️  Not set (defaults to gemini-2.0-flash)',
    },
    {
      name: 'PUBSUB_ADAPTER',
      value: process.env.PUBSUB_ADAPTER,
      required: false,
      status: 'ok',
      message: process.env.PUBSUB_ADAPTER
        ? `✅ Set: ${process.env.PUBSUB_ADAPTER}`
        : 'ℹ️  Not set (defaults to redis_streams)',
    },
    {
      name: 'NEXT_PUBLIC_BASE_URL',
      value: process.env.NEXT_PUBLIC_BASE_URL,
      required: false,
      status: 'ok',
      message: process.env.NEXT_PUBLIC_BASE_URL
        ? `✅ Set: ${process.env.NEXT_PUBLIC_BASE_URL}`
        : 'ℹ️  Not set (will use localhost:3000)',
    },
  ];

  console.log('📋 Environment Variables:\n');
  let hasErrors = false;
  let hasWarnings = false;

  for (const check of checks) {
    console.log(`${check.message}`);
    if (check.status === 'missing' && check.required) {
      hasErrors = true;
    }
    if (check.status === 'warning') {
      hasWarnings = true;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Check Next.js service
  console.log('🌐 Service Status:\n');
  
  const port = process.env.PORT || process.env.NEXT_PUBLIC_PORT || '3000';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:${port}`;
  
  try {
    const statusUrl = `${baseUrl}/api/transcripts/status`;
    console.log(`Checking: ${statusUrl}`);
    
    const response = await fetch(statusUrl);
    if (response.ok) {
      const status = await response.json();
      console.log('✅ Next.js service is running');
      console.log(`   Transcript Consumer Status: ${status.isRunning ? '✅ Running' : '❌ Not Running'}`);
      console.log(`   Active Subscriptions: ${status.subscriptionCount || 0}`);
      
      if (!status.isRunning) {
        console.log('\n⚠️  Transcript consumer is not running. Start it with:');
        console.log(`   curl -X POST ${baseUrl}/api/transcripts/start`);
        hasWarnings = true;
      }
    } else {
      const error = await response.text();
      console.log(`❌ Next.js service error: ${response.status}`);
      console.log(`   ${error}`);
      hasErrors = true;
    }
  } catch (error: any) {
    console.log(`❌ Next.js service not accessible: ${error.message}`);
    console.log(`   Make sure Next.js is running on ${baseUrl}`);
    hasErrors = true;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Summary
  if (hasErrors) {
    console.log('❌ Setup incomplete - Fix errors above before running tests');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  Setup has warnings - Review above before running tests');
    console.log('   Tests may still work, but some features may not function correctly');
  } else {
    console.log('✅ Environment setup looks good!');
    console.log('   You can proceed with testing');
  }

  console.log('');
}

checkEnvironment().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


