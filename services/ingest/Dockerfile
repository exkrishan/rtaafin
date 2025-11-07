FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY services/ingest/package*.json ./
COPY services/ingest/tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy lib/pubsub from repo root
COPY lib/pubsub ./lib/pubsub

# Copy source files from services/ingest
COPY services/ingest/src ./src

# Build TypeScript with validation
# prebuild script validates environment (non-blocking)
# postbuild script verifies dist/server.js exists
RUN npm run build || (echo "❌ Build failed" && exit 1) && \
    if [ ! -f "dist/server.js" ]; then \
        echo "❌ Build output validation failed: dist/server.js not found"; \
        exit 1; \
    fi && \
    echo "✅ Build successful: dist/server.js exists" && \
    rm -rf node_modules && \
    npm ci --only=production

# Expose port (default 5000, but should use PORT env var)
EXPOSE 5000

# Health check with timeout and retries
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-5000}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))" || exit 1

# Run server
CMD ["node", "dist/server.js"]
