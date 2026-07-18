# Workspace AI Assistant

ComConnect uses a separate Flask and LangChain service for workspace-scoped
hybrid RAG and controlled tool-using agents.

The canonical beginner-friendly guide is
`docs/workspace-ai-workflows.md`. It covers RAG, tools, approval-gated
execution, AWS, tradeoffs, failure modes, and MLOps.

## Security boundary

- Express authenticates the user and verifies workspace membership.
- Express collects only that workspace's chat messages, tasks, and members.
- The Flask service is internal and requires `X-Service-Token`.
- Local development uses a separate Chroma collection per workspace.
- AWS production uses a private OpenSearch Serverless collection with mandatory
  `workspace_id` filters.
- A generated task plan cannot create tasks directly. Express signs the proposal
  for 30 minutes and creates tasks only after the user explicitly approves it.

## Run with Docker

Set `OPENAI_API_KEY`, `OPENAI_MODEL`, and a strong `AI_SERVICE_TOKEN` in `.env`.
Use `.env.example` as a starting point.

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Express API: `http://localhost:5000`
- AI health check: `http://localhost:5001/health`

## Express endpoints

```text
POST /api/ai/workspaces/:workspaceId/sync
POST /api/ai/workspaces/:workspaceId/ask
POST /api/ai/workspaces/:workspaceId/task-plan
POST /api/ai/workspaces/:workspaceId/task-plan/apply
```

The first AI request ensures that an initial workspace backfill exists.
Afterward, workspace, message, and task changes are incrementally indexed
through a Redis Stream and a dedicated knowledge-indexer service.
