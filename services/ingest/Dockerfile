FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm install typescript ts-node --save-dev && \
    npm run build && \
    npm uninstall typescript ts-node && \
    rm -rf node_modules && \
    npm ci --only=production

# Expose port
EXPOSE 8443

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8443/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run server
CMD ["node", "dist/server.js"]

