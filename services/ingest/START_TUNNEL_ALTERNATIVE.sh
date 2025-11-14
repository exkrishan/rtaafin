#!/bin/bash
# Alternative tunnel options for Exotel

echo "🌐 Tunnel Setup Options"
echo ""
echo "Choose an option:"
echo ""
echo "1. ngrok (via npx - no install needed)"
echo "2. Cloudflare Tunnel (via npx - no install needed)"
echo "3. localtunnel (via npx - no install needed)"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
  1)
    echo ""
    echo "🚀 Starting ngrok..."
    echo "Look for the 'Forwarding' line with your public URL"
    echo ""
    npx --yes ngrok http 8443
    ;;
  2)
    echo ""
    echo "🚀 Starting Cloudflare Tunnel..."
    echo "Look for the 'https://' URL"
    echo ""
    npx --yes cloudflared tunnel --url http://localhost:8443
    ;;
  3)
    echo ""
    echo "🚀 Starting localtunnel..."
    echo "Look for the 'https://' URL"
    echo ""
    npx --yes localtunnel --port 8443
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

