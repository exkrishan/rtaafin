#!/bin/bash
#
# Update Redis password in .env.local
#

if [ -z "$1" ]; then
    echo "Usage: ./scripts/update-redis-password.sh YOUR_PASSWORD"
    echo ""
    echo "Example:"
    echo "  ./scripts/update-redis-password.sh mySecretPassword123"
    exit 1
fi

PASSWORD="$1"
REDIS_HOST="redis-12304.c245.us-east-1-3.ec2.redns.redis-cloud.com:12304"

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
    echo "❌ .env.local not found"
    exit 1
fi

# Update REDIS_URL with password
sed -i.bak "s|^REDIS_URL=.*|REDIS_URL=redis://default:${PASSWORD}@${REDIS_HOST}|" .env.local

echo "✅ Updated REDIS_URL with password"
echo ""
echo "📋 Updated configuration:"
grep "^REDIS_URL" .env.local | sed 's/redis:\/\/default:[^@]*@/redis:\/\/default:***@/'

echo ""
echo "⚠️  Security Note: Password is stored in plain text in .env.local"
echo "   Make sure .env.local is in .gitignore (it should be)"

