#!/usr/bin/env node
/**
 * Quick diagnostic script to check transcript flow
 * Run this in the browser console to diagnose transcript issues
 */

console.log('=== TRANSCRIPT DIAGNOSTIC ===\n');

// 1. Check if we're on the correct page
console.log('1. Current URL:', window.location.href);
const params = new URLSearchParams(window.location.search);
const urlCallId = params.get('callId');
console.log('   CallId from URL:', urlCallId || '(none)');

// 2. Check local storage for any stored callIds
console.log('\n2. Local Storage:');
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.toLowerCase().includes('call')) {
    console.log(`   ${key}:`, localStorage.getItem(key));
  }
}

// 3. Test the /api/calls/active endpoint
console.log('\n3. Testing /api/calls/active endpoint...');
fetch('/api/calls/active?limit=5')
  .then(res => res.json())
  .then(data => {
    console.log('   Active calls:', data);
    if (data.calls && data.calls.length > 0) {
      const latestCall = data.calls[0];
      console.log('   Latest call:', latestCall);
      
      // 4. Test /api/transcripts/latest for the latest call
      if (latestCall.interactionId) {
        console.log('\n4. Testing /api/transcripts/latest for callId:', latestCall.interactionId);
        return fetch(`/api/transcripts/latest?callId=${encodeURIComponent(latestCall.interactionId)}`);
      }
    } else {
      console.log('   ⚠️  No active calls found!');
      console.log('   This means there are no calls in the database.');
      console.log('   You need to start a call first for transcripts to appear.');
    }
  })
  .then(res => res ? res.json() : null)
  .then(data => {
    if (data) {
      console.log('   Transcripts response:', data);
      console.log('   Number of transcripts:', data.transcripts?.length || 0);
      if (data.transcripts && data.transcripts.length > 0) {
        console.log('   First transcript:', data.transcripts[0]);
        console.log('\n✅ Transcripts are available in the database!');
        console.log('   If not showing in UI, check the React component state.');
      } else {
        console.log('\n⚠️  No transcripts found for this call!');
        console.log('   Check if ASR worker is running and sending transcripts.');
      }
    }
  })
  .catch(err => {
    console.error('   ❌ Error:', err);
  });

// 5. Check if React DevTools is available
console.log('\n5. Checking React state...');
setTimeout(() => {
  // Try to find the transcript state in React DevTools
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    console.log('   React DevTools available - check Components tab for useRealtimeTranscript state');
  } else {
    console.log('   Install React DevTools to inspect component state');
  }
}, 100);

console.log('\n=== END DIAGNOSTIC ===');
console.log('\nNext steps:');
console.log('1. Check the output above for errors');
console.log('2. If no active calls, start a call first');
console.log('3. If no transcripts, check ASR worker logs');
console.log('4. If transcripts exist but not showing, check React component state');

