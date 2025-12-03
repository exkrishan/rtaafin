#!/bin/bash
# Check if Exotel is connecting to the service

echo "🔍 Checking Exotel Connection Status..."
echo ""

# Check if service is running
if pgrep -f "ts-node src/server.ts" > /dev/null; then
    echo "✅ Ingest service is running"
    PID=$(pgrep -f "ts-node src/server.ts" | head -1)
    echo "   Process ID: $PID"
else
    echo "❌ Ingest service is NOT running"
    echo "   Start it with: ./START_WITH_AUDIO_DUMP.sh"
    exit 1
fi

echo ""

# Check if tunnel is running
if pgrep -f "cloudflared tunnel" > /dev/null; then
    echo "✅ Cloudflare tunnel is running"
    TUNNEL_URL=$(ps aux | grep "cloudflared tunnel" | grep -o "https://[^ ]*\.trycloudflare\.com" | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        echo "   Tunnel URL: $TUNNEL_URL"
        echo "   Exotel should use: wss://$(echo $TUNNEL_URL | sed 's|https://||')/v1/ingest"
    fi
else
    echo "⚠️  Cloudflare tunnel is NOT running"
    echo "   Start it with: npx cloudflared tunnel --url http://localhost:8443"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Check service logs for these messages:"
echo "   - [audio-dumper] Audio dumping enabled"
echo "   - [exotel] New Exotel WebSocket connection"
echo "   - [audio-dumper] 💾 Dumped audio chunk"
echo ""
echo "2. Verify Exotel configuration:"
echo "   - WebSocket URL: wss://YOUR-TUNNEL-URL/v1/ingest"
echo "   - Protocol: Exotel"
echo "   - Sample Rate: 8000 or 16000"
echo ""
echo "3. Make sure:"
echo "   - Call is active"
echo "   - You're speaking during the call"
echo "   - Tunnel is still running"
echo ""
echo "💡 To see service logs, check the terminal where you ran:"
echo "   ./START_WITH_AUDIO_DUMP.sh"

