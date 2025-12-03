#!/bin/bash
# Quick diagnostic script to check what's happening with ElevenLabs

echo "=========================================="
echo "🔍 ElevenLabs Empty Transcripts Diagnostic"
echo "=========================================="
echo ""

echo "1. Check if fixes are deployed:"
echo "   Look for these in ASR worker logs:"
echo "   ✅ 'Creating new connection' with sampleRate: 8000"
echo "   ✅ 'Session started' with sample_rate: 8000 (NOT 16000)"
echo "   ✅ '📤 Sent audio chunk' with sampleRateMatch: true"
echo ""

echo "2. Check if transcript events are being received:"
echo "   Look for:"
echo "   ✅ '📨 Received PARTIAL_TRANSCRIPT event'"
echo "   ✅ '📨 Received COMMITTED_TRANSCRIPT event'"
echo "   ✅ '🔍 RAW WebSocket message received'"
echo ""

echo "3. Check sample rate matching:"
echo "   Look for:"
echo "   ❌ '⚠️ Sample rate mismatch' (BAD - means connection wrong rate)"
echo "   ❌ '❌ CRITICAL: Sample rate mismatch when sending audio' (BAD)"
echo "   ✅ 'sampleRateMatch: true' (GOOD)"
echo ""

echo "4. Check if audio is being sent:"
echo "   Look for:"
echo "   ✅ '📤 Sent audio chunk to ElevenLabs' with size > 0"
echo ""

echo "5. Check if events have transcript data:"
echo "   Look for:"
echo "   ✅ 'transcriptLength: X' where X > 0"
echo "   ❌ 'transcriptLength: 0' (BAD - means empty events)"
echo ""

echo "=========================================="
echo "Most likely issues if still getting empty:"
echo "=========================================="
echo ""
echo "1. Render hasn't rebuilt yet - check build logs"
echo "2. ElevenLabs not sending events - check for '📨 Received' logs"
echo "3. Audio is silence - VAD filtering it out"
echo "4. Sample rate still mismatched - check connection vs audio rates"
echo ""

