#!/bin/bash
# Start ngrok tunnel for Exotel (no installation needed - uses npx)

echo "🌐 Starting ngrok tunnel..."
echo ""
echo "This will create a public URL that Exotel can access"
echo "Your local service on port 8443 will be accessible via this URL"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""

# Use npx to run ngrok without installation
npx --yes ngrok http 8443

