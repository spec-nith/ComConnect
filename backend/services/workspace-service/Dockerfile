FROM node:18-slim

# Install wget and ping tools
RUN apt-get update && apt-get install -y wget iputils-ping && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy service files
COPY . .

EXPOSE 5004

CMD ["npm", "run", "dev"]

