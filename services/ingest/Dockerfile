FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy lib/pubsub - REQUIRED: Build context must be repo root (.)
# If Render Root Directory is services/ingest, this will fail
# Solution: Set Render Root Directory to . (repo root) and Dockerfile Path to services/ingest/Dockerfile
COPY lib/pubsub ./lib/pubsub

# Copy source files
COPY src ./src

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
