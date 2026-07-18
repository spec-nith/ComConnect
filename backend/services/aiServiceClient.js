const baseUrl = process.env.AI_SERVICE_URL || "http://ai-service:5001";

const requestAiService = async (path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.AI_SERVICE_TIMEOUT_MS || 120000)
  );

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": process.env.AI_SERVICE_TOKEN || "",
        ...options.headers,
      },
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(body.message || "AI service request failed");
      error.statusCode = response.status >= 500 ? 503 : response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const indexWorkspace = (workspaceId, documents) =>
  requestAiService(`/v1/workspaces/${workspaceId}/index`, {
    method: "POST",
    body: JSON.stringify({ documents }),
  });

const upsertWorkspaceDocuments = (workspaceId, documents) =>
  requestAiService(`/v1/workspaces/${workspaceId}/documents/upsert`, {
    method: "POST",
    body: JSON.stringify({ documents }),
  });

const resetWorkspaceDocuments = (workspaceId) =>
  requestAiService(`/v1/workspaces/${workspaceId}/documents/reset`, {
    method: "POST",
    body: JSON.stringify({}),
  });

const deleteWorkspaceDocuments = (workspaceId, ids) =>
  requestAiService(`/v1/workspaces/${workspaceId}/documents/delete`, {
    method: "POST",
    body: JSON.stringify({ ids }),
  });

const askWorkspace = (workspaceId, question) =>
  requestAiService(`/v1/workspaces/${workspaceId}/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });

const searchWorkspace = (workspaceId, query, tags = [], limit = 12) =>
  requestAiService(`/v1/workspaces/${workspaceId}/search`, {
    method: "POST",
    body: JSON.stringify({ query, tags, limit }),
  });

const planTasks = (workspaceId, request, members, tasks) =>
  requestAiService(`/v1/workspaces/${workspaceId}/task-plan`, {
    method: "POST",
    body: JSON.stringify({ request, members, tasks }),
  });

const coordinateEvent = (workspaceId, question, members, tasks) =>
  requestAiService(`/v1/workspaces/${workspaceId}/event-coordinator`, {
    method: "POST",
    body: JSON.stringify({ question, members, tasks }),
  });

const summarizeChat = (chatName, messages) =>
  requestAiService("/v1/chats/summary", {
    method: "POST",
    body: JSON.stringify({ chatName, messages }),
  });

const answerChat = (chatName, question, messages) =>
  requestAiService("/v1/chats/answer", {
    method: "POST",
    body: JSON.stringify({ chatName, question, messages }),
  });

module.exports = {
  answerChat,
  askWorkspace,
  coordinateEvent,
  deleteWorkspaceDocuments,
  indexWorkspace,
  planTasks,
  resetWorkspaceDocuments,
  searchWorkspace,
  summarizeChat,
  upsertWorkspaceDocuments,
};
