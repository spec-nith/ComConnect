const fs = require('fs');
const path = require('path');

const services = [
  { name: 'user-service', port: 5001 },
  { name: 'chat-service', port: 5002 },
  { name: 'message-service', port: 5003 },
  { name: 'workspace-service', port: 5004 },
  { name: 'task-service', port: 5005 },
  { name: 'notification-service', port: 5006 }
];

const dockerfileTemplate = (serviceName, port) => `# Production Dockerfile - Multi-stage build
# Stage 1: Build dependencies
FROM node:18-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production image
FROM node:18-slim

# Install only runtime dependencies
RUN apt-get update && \\
    apt-get install -y --no-install-recommends wget curl && \\
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Create non-root user for security
RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser && \\
    chown -R nodeuser:nodeuser /app

USER nodeuser

EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/health || exit 1

# Use production start command
CMD ["npm", "start"]
`;

services.forEach(service => {
  const dockerfilePath = path.join(__dirname, service.name, 'Dockerfile.prod');
  const content = dockerfileTemplate(service.name, service.port);
  fs.writeFileSync(dockerfilePath, content);
  console.log(`✅ Created ${dockerfilePath}`);
});

console.log('\n✅ All production Dockerfiles generated!');

