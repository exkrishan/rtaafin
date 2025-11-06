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

# Build TypeScript
# prebuild script will skip if lib/pubsub already exists
RUN npm run build && \
    rm -rf node_modules && \
    npm ci --only=production

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run server
CMD ["node", "dist/server.js"]
