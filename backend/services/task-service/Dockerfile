FROM node:18-slim

# Install wget and ping tools
RUN apt-get update && apt-get install -y wget iputils-ping && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY task-service/package*.json ./

# Install ALL dependencies (including dev)
RUN npm install

# Copy service files
COPY task-service/ .

# Copy shared directory
COPY shared /app/shared

EXPOSE 5005

CMD ["npm", "run", "dev"]

