# Development Dockerfile
FROM node:18-slim

# Install wget and ping tools
RUN apt-get update && apt-get install -y wget iputils-ping && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY user-service/package*.json ./

# Install ALL dependencies (including dev)
RUN npm install

# Copy service files
COPY user-service/ .

# Copy shared directory
COPY shared /app/shared

EXPOSE 5001

CMD ["npm", "run", "dev"]
