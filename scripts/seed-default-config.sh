#!/bin/bash
#
# Seed Default Configuration Script
# Seeds global and default tenant configurations
#
# Usage:
#   ADMIN_KEY=your-admin-key bash scripts/seed-default-config.sh
#
# Or source from .env:
#   source .env.local && bash scripts/seed-default-config.sh
#

set -e

# Check required environment variables
if [ -z "$ADMIN_KEY" ]; then
  echo "Error: ADMIN_KEY is not set"
  exit 1
fi

API_URL="${API_URL:-http://localhost:3000}"

echo "🔧 Seeding default configurations..."
echo "API URL: $API_URL"
echo ""

# Seed global config
echo "📝 Creating global configuration..."
RESPONSE=$(curl -s -X PUT "$API_URL/api/config" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "global",
    "scopeId": null,
    "config": {
      "kb": {
        "provider": "db",
        "maxArticles": 10,
        "timeoutMs": 5000,
        "minConfidence": 0.5
      },
      "llm": {
        "model": "gpt-4o-mini",
        "temperature": 0.7,
        "maxTokens": 500,
        "timeoutMs": 10000
      },
      "autoNotes": {
        "enabled": true,
        "model": "gpt-4o-mini",
        "promptVersion": "v1"
      },
      "telemetry": {
        "enabled": true,
        "sampleRate": 1.0
      }
    },
    "actor": "seed-script"
  }')

# Check for errors in response
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Global config created successfully"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Error creating global config:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

echo ""

# Seed default tenant config
echo "📝 Creating 'default' tenant configuration..."
RESPONSE=$(curl -s -X PUT "$API_URL/api/config" \
  -H "x-admin-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "tenant",
    "scopeId": "default",
    "config": {
      "kb": {
        "maxArticles": 5
      },
      "llm": {
        "temperature": 0.8
      }
    },
    "actor": "seed-script"
  }')

# Check for errors in response
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Default tenant config created successfully"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
  echo "❌ Error creating default tenant config:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi

echo ""
echo "🎉 Configuration seeding completed!"
echo ""
echo "📊 Verify configurations:"
echo "  # List all configs"
echo "  curl '$API_URL/api/config' | jq ."
echo ""
echo "  # Get effective config for default tenant"
echo "  curl '$API_URL/api/config/effective?tenantId=default' | jq ."
echo ""
echo "  # Visit admin UI"
echo "  open $API_URL/admin/configs"
echo ""

# Optional: Seed demo tenant with custom config
if [ "$SEED_DEMO" = "true" ]; then
  echo "📝 Creating 'demo' tenant configuration..."
  RESPONSE=$(curl -s -X PUT "$API_URL/api/config" \
    -H "x-admin-key: $ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "scope": "tenant",
      "scopeId": "demo",
      "config": {
        "kb": {
          "provider": "db",
          "maxArticles": 3
        },
        "ui": {
          "theme": "dark"
        }
      },
      "actor": "seed-script"
    }')

  if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✅ Demo tenant config created successfully"
  else
    echo "⚠️  Demo tenant config creation failed (optional)"
  fi
  echo ""
fi
