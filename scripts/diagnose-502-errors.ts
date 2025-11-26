#!/usr/bin/env tsx
/**
 * Diagnose 502 Bad Gateway Errors
 * 
 * Checks service health and identifies potential causes of 502 errors
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend-8jdd.onrender.com';

interface HealthCheck {
  endpoint: string;
  status: number;
  responseTime: number;
  error?: string;
  body?: any;
}

async function checkEndpoint(url: string, timeout = 10000): Promise<HealthCheck> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Diagnostic-Script/1.0',
      },
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    
    let body: any = null;
    try {
      const text = await response.text();
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { raw: text.substring(0, 200) };
        }
      }
    } catch {
      // Ignore body parsing errors
    }
    
    return {
      endpoint: url,
      status: response.status,
      responseTime,
      body,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      endpoint: url,
      status: 0,
      responseTime,
      error: error.message || String(error),
    };
  }
}

async function diagnose502Errors() {
  console.log('🔍 Diagnosing 502 Bad Gateway Errors\n');
  console.log('='.repeat(60));
  console.log(`Frontend URL: ${FRONTEND_URL}\n`);
  
  const checks: HealthCheck[] = [];
  
  // Check 1: Health endpoint
  console.log('1️⃣ Checking health endpoint...');
  const healthCheck = await checkEndpoint(`${FRONTEND_URL}/api/health`);
  checks.push(healthCheck);
  if (healthCheck.status === 200) {
    console.log(`   ✅ Health check passed (${healthCheck.responseTime}ms)`);
    if (healthCheck.body) {
      console.log(`   Status: ${healthCheck.body.status || 'unknown'}`);
      if (healthCheck.body.transcriptConsumer) {
        console.log(`   Transcript Consumer: ${healthCheck.body.transcriptConsumer.isRunning ? '✅ Running' : '❌ Not Running'}`);
        console.log(`   Subscriptions: ${healthCheck.body.transcriptConsumer.subscriptionsCount || 0}`);
      }
    }
  } else if (healthCheck.status === 502) {
    console.log(`   ❌ 502 Bad Gateway (${healthCheck.responseTime}ms)`);
    console.log(`   Error: ${healthCheck.error || 'Service unavailable'}`);
  } else {
    console.log(`   ⚠️  Status ${healthCheck.status} (${healthCheck.responseTime}ms)`);
    if (healthCheck.error) {
      console.log(`   Error: ${healthCheck.error}`);
    }
  }
  console.log('');
  
  // Check 2: Active calls endpoint
  console.log('2️⃣ Checking active calls endpoint...');
  const activeCallsCheck = await checkEndpoint(`${FRONTEND_URL}/api/calls/active?limit=10`);
  checks.push(activeCallsCheck);
  if (activeCallsCheck.status === 200) {
    console.log(`   ✅ Active calls endpoint working (${activeCallsCheck.responseTime}ms)`);
    if (activeCallsCheck.body) {
      console.log(`   Active calls: ${activeCallsCheck.body.count || 0}`);
    }
  } else if (activeCallsCheck.status === 502) {
    console.log(`   ❌ 502 Bad Gateway (${activeCallsCheck.responseTime}ms)`);
    console.log(`   This is the endpoint failing in your browser!`);
  } else {
    console.log(`   ⚠️  Status ${activeCallsCheck.status} (${activeCallsCheck.responseTime}ms)`);
  }
  console.log('');
  
  // Check 3: SSE endpoint (with timeout)
  console.log('3️⃣ Checking SSE endpoint (will timeout after 5s)...');
  const sseCheck = await checkEndpoint(`${FRONTEND_URL}/api/events/stream?callId=test`, 5000);
  checks.push(sseCheck);
  if (sseCheck.status === 200 || sseCheck.status === 0) {
    // SSE endpoints may timeout, that's ok
    if (sseCheck.error?.includes('aborted')) {
      console.log(`   ⚠️  SSE endpoint timeout (expected for long-running connections)`);
    } else {
      console.log(`   ✅ SSE endpoint accessible (${sseCheck.responseTime}ms)`);
    }
  } else if (sseCheck.status === 502) {
    console.log(`   ❌ 502 Bad Gateway (${sseCheck.responseTime}ms)`);
    console.log(`   This is the endpoint failing in your browser!`);
  } else {
    console.log(`   ⚠️  Status ${sseCheck.status} (${sseCheck.responseTime}ms)`);
  }
  console.log('');
  
  // Check 4: Root endpoint
  console.log('4️⃣ Checking root endpoint...');
  const rootCheck = await checkEndpoint(`${FRONTEND_URL}/`, 5000);
  checks.push(rootCheck);
  if (rootCheck.status === 200) {
    console.log(`   ✅ Root endpoint working (${rootCheck.responseTime}ms)`);
  } else if (rootCheck.status === 502) {
    console.log(`   ❌ 502 Bad Gateway (${rootCheck.responseTime}ms)`);
    console.log(`   Service is completely down!`);
  } else {
    console.log(`   ⚠️  Status ${rootCheck.status} (${rootCheck.responseTime}ms)`);
  }
  console.log('');
  
  // Summary
  console.log('='.repeat(60));
  console.log('📊 Diagnosis Summary\n');
  
  const has502 = checks.some(c => c.status === 502);
  const hasTimeout = checks.some(c => c.error?.includes('aborted') || c.responseTime > 10000);
  const allFailed = checks.every(c => c.status !== 200 && c.status !== 0);
  
  if (has502) {
    console.log('❌ 502 Bad Gateway Detected\n');
    console.log('Possible Causes:');
    console.log('1. Service is sleeping (Render free tier)');
    console.log('   → Solution: Wait 30-60 seconds, then refresh');
    console.log('   → Long-term: Set up keep-alive service\n');
    
    console.log('2. Service is crashing/restarting');
    console.log('   → Check Render dashboard for:');
    console.log('     - Memory usage (should be < 512MB)');
    console.log('     - Crash/restart logs');
    console.log('     - Error messages\n');
    
    console.log('3. Service is out of memory');
    console.log('   → Check Render dashboard metrics');
    console.log('   → Look for OOM (Out of Memory) errors\n');
    
    console.log('4. Too many active connections');
    console.log('   → Check transcript consumer subscriptions');
    console.log('   → Current subscriptions:', healthCheck.body?.transcriptConsumer?.subscriptionsCount || 'unknown');
    console.log('   → Solution: Clean up old subscriptions\n');
  } else if (hasTimeout) {
    console.log('⚠️  Timeout Issues Detected\n');
    console.log('Service is responding but very slowly.');
    console.log('This may indicate:');
    console.log('- High memory usage');
    console.log('- Too many active subscriptions');
    console.log('- Slow Redis connections\n');
  } else if (allFailed) {
    console.log('❌ All Endpoints Failed\n');
    console.log('Service appears to be completely down.');
    console.log('Check Render dashboard for service status.\n');
  } else {
    console.log('✅ All Endpoints Working\n');
    console.log('No 502 errors detected. Service is healthy.\n');
  }
  
  // Recommendations
  console.log('='.repeat(60));
  console.log('💡 Recommendations\n');
  
  if (healthCheck.body?.transcriptConsumer?.subscriptionsCount > 10) {
    console.log('⚠️  High subscription count detected!');
    console.log(`   Current: ${healthCheck.body.transcriptConsumer.subscriptionsCount} subscriptions`);
    console.log('   This may cause memory issues.');
    console.log('   → Consider cleaning up old subscriptions\n');
  }
  
  console.log('Next Steps:');
  console.log('1. Check Render Dashboard → frontend-8jdd → Logs');
  console.log('   Look for:');
  console.log('   - "Out of memory" errors');
  console.log('   - Crash/restart messages');
  console.log('   - High memory usage warnings');
  console.log('   - Next.js startup errors\n');
  
  console.log('2. Check Render Dashboard → Metrics');
  console.log('   - Memory usage (should be < 512MB)');
  console.log('   - CPU usage');
  console.log('   - Request count\n');
  
  console.log('3. If service is sleeping:');
  console.log('   - Set up a keep-alive service');
  console.log('   - Or upgrade to paid Render plan\n');
  
  console.log('4. If memory is high:');
  console.log('   - Clean up old transcript subscriptions');
  console.log('   - Reduce subscription count\n');
}

diagnose502Errors().catch(error => {
  console.error('❌ Diagnostic failed:', error);
  process.exit(1);
});

