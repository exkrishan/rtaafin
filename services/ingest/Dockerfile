FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy lib/pubsub - assumes build context is repo root
# For Render: Set Root Directory to repo root (.), Dockerfile Path to services/ingest/Dockerfile
COPY lib/pubsub ./lib/pubsub

# Copy source files
COPY src ./src

# Copy TypeScript config
COPY tsconfig.json ./

# Build TypeScript
RUN npm install typescript ts-node --save-dev && \
    npm run build && \
    npm uninstall typescript ts-node && \
    rm -rf node_modules && \
    npm ci --only=production

# Expose port
EXPOSE 5000

# Start service
CMD ["npm", "start"]
