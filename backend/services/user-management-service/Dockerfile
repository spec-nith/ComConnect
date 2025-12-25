FROM node:18-slim

# Install wget and ping tools
RUN apt-get update && apt-get install -y wget iputils-ping && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY user-management-service/package*.json ./

# Install ALL dependencies (including dev)
RUN npm install

# Copy service files
COPY user-management-service/ .

# Copy shared directory
COPY shared /app/shared

# Install shared dependencies if package.json exists
RUN if [ -f /app/shared/package.json ]; then cd /app/shared && npm install; fi

EXPOSE 5009

CMD ["npm", "run", "dev"]

