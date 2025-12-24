FROM node:18-slim

# Install wget for healthcheck
RUN apt-get update && apt-get install -y wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app/frontend

# Copy package files first
COPY frontend/package*.json ./

# Install dependencies in a single layer to reduce image size
RUN npm install --legacy-peer-deps

# Now copy the rest of the application
COPY frontend/ .

# Create a directory for node_modules and ensure it exists
RUN mkdir -p node_modules && \
    chmod -R 777 node_modules

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --spider http://localhost:3000 || exit 1 

EXPOSE 3000

# For development, use npm start
# Use npx to ensure react-scripts is found
CMD ["npx", "react-scripts", "start"] 