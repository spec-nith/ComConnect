# Testing And Verification

This document records the verification performed for the current ComConnect AI
assistant implementation.

## Verified Commands

```powershell
docker compose config --quiet
docker compose build ai-service backend frontend
docker compose run --rm --no-deps frontend npm run build
docker compose run --rm --no-deps -e AI_SERVICE_TOKEN=test-token ai-service python tests/smoke_check.py
docker compose up -d mongodb redis zookeeper kafka ai-service backend frontend
```

## Runtime Health

Observed running services:

```text
ai-service: up on 5001
backend: up on 5000
frontend: up and healthy on 3000
kafka: up on 9092 and 29092
mongodb: up on 27017
redis: up and healthy on 6379
zookeeper: up on 2181
```

HTTP checks:

```text
GET http://127.0.0.1:5001/health -> {"status":"ok"}
GET http://127.0.0.1:5000/health -> {"status":"ok"}
GET http://127.0.0.1:3000 -> 200
```

## Build Result

The frontend production build completed successfully. It still reports several
pre-existing ESLint warnings in older files, but no compile failure.

## AI Service Checks

The AI service smoke test verified:

- `/health` returns `200`.
- `/v1` routes reject missing `X-Service-Token`.
- empty AI questions are rejected with `400` after valid service-token auth.
- empty chat-summary requests are rejected with `400`.
- empty task-plan requests are rejected with `400`.

The public Express AI routes also reject unauthenticated requests:

```text
POST /api/ai/chats/:chatId/summary -> 401 without JWT
POST /api/ai/workspaces/:workspaceId/task-plan -> 401 without JWT
```

## Limitations

Full RAG and task-agent semantic tests require a real `OPENAI_API_KEY`, because
LangChain must call OpenAI for embeddings and model output. The service is
configured and ready, but OpenAI-dependent flows cannot complete until the key
is set in `.env`.

The in-app browser automation tool crashed in this local Windows session while
trying to inspect the rendered page. The frontend was still verified through
HTTP `200`, Docker health status, and production build.
