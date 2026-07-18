const { Client } = require("@opensearch-project/opensearch");

const enabled = () =>
  String(process.env.OPENSEARCH_ANALYTICS_ENABLED || "false").toLowerCase() ===
  "true";

const analyticsIndex = () =>
  process.env.OPENSEARCH_ANALYTICS_INDEX || "comconnect-analytics-events";

let client;
let indexReadyPromise;

const boolFromEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return String(value).toLowerCase() === "true";
};

const getClient = () => {
  if (!enabled()) return null;
  if (client) return client;

  const node =
    process.env.OPENSEARCH_ANALYTICS_NODE ||
    process.env.OPENSEARCH_ENDPOINT ||
    "http://localhost:9200";
  const username = process.env.OPENSEARCH_ANALYTICS_USERNAME;
  const password = process.env.OPENSEARCH_ANALYTICS_PASSWORD;

  client = new Client({
    node,
    auth:
      username && password
        ? {
            username,
            password,
          }
        : undefined,
    ssl: {
      rejectUnauthorized: boolFromEnv(
        "OPENSEARCH_ANALYTICS_SSL_REJECT_UNAUTHORIZED",
        false
      ),
    },
    requestTimeout: Number(process.env.OPENSEARCH_ANALYTICS_TIMEOUT_MS || 3000),
  });

  return client;
};

const ensureAnalyticsIndex = async () => {
  const osClient = getClient();
  if (!osClient) return false;
  if (indexReadyPromise) return indexReadyPromise;

  const index = analyticsIndex();
  indexReadyPromise = (async () => {
    const existsResponse = await osClient.indices.exists({ index });
    const exists =
      existsResponse === true ||
      existsResponse.body === true ||
      existsResponse.statusCode === 200;
    if (exists) return true;

    await osClient.indices.create({
      index,
      body: {
        settings: {
          "index.number_of_shards": 1,
          "index.number_of_replicas": 0,
        },
        mappings: {
          dynamic: true,
          properties: {
            "@timestamp": { type: "date" },
            event_type: { type: "keyword" },
            service: { type: "keyword" },
            environment: { type: "keyword" },
            request_id: { type: "keyword" },
            actor_user_id: { type: "keyword" },
            workspace_id: { type: "keyword" },
            chat_id: { type: "keyword" },
            message_id: { type: "keyword" },
            task_id: { type: "keyword" },
            status: { type: "keyword" },
            tags: { type: "keyword" },
            http: {
              properties: {
                method: { type: "keyword" },
                route: { type: "keyword" },
                status_code: { type: "integer" },
                duration_ms: { type: "float" },
              },
            },
          },
        },
      },
    });
    return true;
  })();

  try {
    return await indexReadyPromise;
  } catch (error) {
    indexReadyPromise = null;
    throw error;
  }
};

const toId = (value) => {
  if (!value) return undefined;
  if (value._id) return value._id.toString();
  return value.toString();
};

const recordAnalyticsEvent = async (eventType, payload = {}) => {
  const osClient = getClient();
  if (!osClient) return;

  try {
    await ensureAnalyticsIndex();
    await osClient.index({
      index: analyticsIndex(),
      body: {
        "@timestamp": new Date().toISOString(),
        event_type: eventType,
        service: process.env.SERVICE_NAME || payload.service || "comconnect",
        environment: process.env.NODE_ENV || "development",
        ...payload,
      },
      refresh:
        String(process.env.OPENSEARCH_ANALYTICS_REFRESH || "false").toLowerCase() ===
        "true",
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        service: process.env.SERVICE_NAME || "comconnect",
        message: "Unable to write OpenSearch analytics event",
        error: error.message,
      })
    );
  }
};

const createAnalyticsHttpMiddleware = (serviceName) => (req, res, next) => {
  if (!enabled()) return next();

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = req.baseUrl
      ? `${req.baseUrl}${req.route?.path || ""}`
      : req.originalUrl?.split("?")[0];

    recordAnalyticsEvent("http.request", {
      service: serviceName,
      request_id: req.requestId,
      actor_user_id: toId(req.user),
      http: {
        method: req.method,
        route,
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
      },
    });
  });

  return next();
};

const closeAnalytics = async () => {
  if (!client) return;
  await client.close();
  client = null;
  indexReadyPromise = null;
};

module.exports = {
  analyticsIndex,
  closeAnalytics,
  createAnalyticsHttpMiddleware,
  recordAnalyticsEvent,
  toId,
};
