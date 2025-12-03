#!/bin/bash

# Progressive Transcript Experience Test
# Demonstrates the smooth, live update flow: Transcripts → Intent → KB → Disposition

set -e

FRONTEND_URL="${FRONTEND_URL:-https://frontend-8jdd.onrender.com}"
CALL_ID="progressive-demo-$(date +%s)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 Progressive Transcript Experience Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📞 CallID: $CALL_ID"
echo "🌐 Frontend: $FRONTEND_URL"
echo ""
echo "✨ Expected Experience:"
echo "   1. Transcripts appear progressively (no reload)"
echo "   2. Intent detection updates as conversation develops"
echo "   3. KB suggestions surface relevant articles"
echo "   4. Disposition recommendations appear when call ends"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Open this URL NOW to watch live updates:"
echo "   $FRONTEND_URL/live?callId=$CALL_ID"
echo ""
echo "   (Auto-discovery will find it in 2 seconds)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Press ENTER when you have the page open..." 

echo ""
echo "🎬 Starting progressive transcript flow..."
echo ""

# Transcript 1: Customer greeting
echo "📝 [00:00] Sending: Customer greeting..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: Hi, I need to speak with someone about my account.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent - should appear in UI within 5 seconds (polling)"
sleep 3

# Transcript 2: Agent response
echo "📝 [00:03] Sending: Agent greeting..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Agent: Hello! I'd be happy to help you today. What can I assist you with?\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent - progressively updating (no reload)"
sleep 3

# Transcript 3: Customer describes issue (triggers intent detection)
echo "📝 [00:06] Sending: Customer describes issue (fraud keywords)..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: I've noticed some fraudulent charges on my credit card statement that I didn't authorize.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent - should trigger intent detection (credit_card_fraud)"
echo "   🎯 Watch for intent and KB articles to appear!"
sleep 4

# Transcript 4: Agent acknowledges
echo "📝 [00:10] Sending: Agent acknowledges..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Agent: I understand your concern about these unauthorized charges. Let me help you resolve this right away.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent - conversation continues smoothly"
sleep 3

# Transcript 5: Customer provides details
echo "📝 [00:13] Sending: Customer provides details..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: There are three charges totaling 500 dollars that I didn't make. I want to block my card immediately.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent - more context for intent/KB (block card keyword)"
sleep 3

# Transcript 6: Agent takes action
echo "📝 [00:16] Sending: Agent takes action..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Agent: I've blocked your card immediately to prevent any further unauthorized charges. I'm also initiating a fraud investigation for those three transactions.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent"
sleep 3

# Transcript 7: Agent provides resolution
echo "📝 [00:19] Sending: Agent provides resolution..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Agent: A new card will be sent to your address within 5-7 business days, and you'll receive provisional credit for the fraudulent charges within 24 hours.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent"
sleep 3

# Transcript 8: Customer satisfied
echo "📝 [00:22] Sending: Customer satisfaction..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: Thank you so much for your help. I feel much better knowing it's being handled.\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent"
sleep 2

# Transcript 9: Agent closes
echo "📝 [00:24] Sending: Call closing..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Agent: You're very welcome! Is there anything else I can help you with today?\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent"
sleep 2

# Transcript 10: Final customer response
echo "📝 [00:26] Sending: Final response..."
curl -s -X POST "$FRONTEND_URL/api/transcripts/receive" \
  -H "Content-Type: application/json" \
  -d "{
    \"callId\": \"$CALL_ID\",
    \"transcript\": \"Customer: No, that's all. Thank you!\",
    \"asr_service\": \"Azure\",
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"isFinal\": true
  }" > /dev/null 2>&1
echo "   ✅ Sent"
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Progressive Transcript Flow Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 What you should see in the UI:"
echo ""
echo "   ✅ All 10 transcripts appeared progressively (NO reload)"
echo "   ✅ Intent detected: credit_card_fraud"
echo "   ✅ KB articles suggested (fraud, card blocking, replacement)"
echo "   ✅ Disposition button available (click to see auto-generated notes)"
echo ""
echo "🎯 Next Steps:"
echo "   1. Click the 'Dispose' button in the UI"
echo "   2. See recommended disposition categories"
echo "   3. See auto-generated call notes/summary"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📺 View URL: $FRONTEND_URL/live?callId=$CALL_ID"
echo ""

