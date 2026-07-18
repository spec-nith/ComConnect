# ComConnect

ComConnect is a real-time event collaboration platform for workspace chat,
tasks, notifications, and AI-assisted planning.

## Features

- Workspace registration with one channel per role
- Direct and group chat with horizontally scalable Socket.IO
- Redis TTL presence registry for online/offline and last-seen state
- Redis Streams message ingestion with a dedicated MongoDB persistence worker
- Workspace task allocation, status, and comments
- Kafka, Redis, and Firebase notification pipeline
- Workspace-scoped RAG over chats, tasks, and workspace metadata
- Approval-gated LangChain task planning agent
- Group chat summarizer
- Event coordinator agent
- Swagger API documentation
- Docker Compose, Render/Vercel, and AWS ECS deployment paths

## Architecture

ComConnect uses a monorepo microservices structure: shared backend modules live
in one repo, but identity, chat, message-worker, knowledge-indexer, tasks,
notifications, and AI
orchestrator are separate Docker images and deployment units. Redis provides the
Socket.IO adapter, presence registry, and durable-in-flight message stream. The
Flask/LangChain AI engine is internal-only. Local development uses Chroma; AWS
production uses private OpenSearch Serverless hybrid retrieval. Tool-using
agents keep business writes behind signed human approval.

See:

- [Production architecture](docs/architecture-guide.md)
- [AI workflows](docs/workspace-ai-workflows.md)
- [OpenSearch analytics integration](docs/opensearch-integration.md)
- [Deployment guide](docs/deployment-guide.md)
- [Testing guide](docs/testing-and-verification.md)

## Run Locally

1. Copy `.env.example` to `.env`.
2. Add `OPENAI_API_KEY` and Firebase values when those integrations are needed.
3. Start the stack:

```bash
docker compose up --build
```

Open:

- App: `http://localhost:3000`
- Analytics: `http://localhost:3000/analytics`
- OpenSearch Dashboards: `http://localhost:5601`
- Swagger: `http://localhost:5000/api-docs`
- Service health: `http://localhost:5000/health/services`

## Repository Layout

```text
frontend/       React application
gateway/        Public API and WebSocket gateway
backend/        Node services, models, controllers, and service entry points
ai-service/     Flask, LangChain, Chroma/OpenSearch, agents, and AI tests
infra/aws/      ECS, OpenSearch, ECR, ALB, CloudFront, S3, Redis, and secrets
docs/           Architecture, AI, deployment, and verification guides
render.yaml     Render Blueprint
vercel.json     Vercel frontend build
```
