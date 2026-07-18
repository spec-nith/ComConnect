FROM node:20-alpine

WORKDIR /app/backend

LABEL org.opencontainers.image.title="ComConnect Knowledge Indexer"

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ .

ENV SERVICE_NAME=knowledge-indexer
EXPOSE 5107

USER node
CMD ["node", "microservices/knowledgeIndexerServer.js"]
