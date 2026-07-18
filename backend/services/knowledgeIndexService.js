const crypto = require("crypto");

const {
  deleteWorkspaceDocuments,
  upsertWorkspaceDocuments,
} = require("./aiServiceClient");
const { closeRedis, connectRedis, createRedisClient } = require("./redisClient");

const streamKey = process.env.KNOWLEDGE_STREAM_KEY || "workspace:knowledge";
const deadLetterStreamKey =
  process.env.KNOWLEDGE_DLQ_STREAM_KEY || "workspace:knowledge:dead-letter";
const consumerGroup =
  process.env.KNOWLEDGE_STREAM_CONSUMER_GROUP || "knowledge-indexing";

const fieldsToObject = (fields) => {
  const result = {};
  for (let index = 0; index < fields.length; index += 2) {
    result[fields[index]] = fields[index + 1];
  }
  return result;
};

class KnowledgeIndexProducer {
  constructor() {
    this.redis = createRedisClient("knowledge-index-producer");
  }

  async connect() {
    await connectRedis(this.redis);
    return this;
  }

  async enqueue({ operation, workspaceId, documents = [], ids = [] }) {
    await this.redis.xadd(
      streamKey,
      "MAXLEN",
      "~",
      Number(process.env.KNOWLEDGE_STREAM_MAX_LENGTH || 200000),
      "*",
      "eventId",
      crypto.randomUUID(),
      "operation",
      operation,
      "workspaceId",
      workspaceId.toString(),
      "documents",
      JSON.stringify(documents),
      "ids",
      JSON.stringify(ids),
      "createdAt",
      new Date().toISOString()
    );
  }

  async close() {
    await closeRedis(this.redis);
  }
}

class KnowledgeIndexWorker {
  constructor() {
    this.redis = createRedisClient("knowledge-index-worker");
    this.running = false;
    this.consumerName =
      process.env.KNOWLEDGE_STREAM_CONSUMER_NAME ||
      `worker-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
  }

  async start() {
    await connectRedis(this.redis);
    try {
      await this.redis.xgroup(
        "CREATE",
        streamKey,
        consumerGroup,
        "0",
        "MKSTREAM"
      );
    } catch (error) {
      if (!error.message.includes("BUSYGROUP")) throw error;
    }
    this.running = true;
    this.consume().catch((error) => {
      console.error(
        JSON.stringify({
          level: "error",
          service: "knowledge-indexer",
          message: error.message,
        })
      );
      process.exitCode = 1;
    });
    return this;
  }

  async consume() {
    while (this.running) {
      const batches = await this.redis.xreadgroup(
        "GROUP",
        consumerGroup,
        this.consumerName,
        "COUNT",
        20,
        "BLOCK",
        5000,
        "STREAMS",
        streamKey,
        ">"
      );
      if (!batches) continue;
      for (const [, entries] of batches) {
        for (const [streamId, fields] of entries) {
          await this.process(streamId, fieldsToObject(fields));
        }
      }
    }
  }

  async process(streamId, event) {
    try {
      if (event.operation === "upsert") {
        await upsertWorkspaceDocuments(
          event.workspaceId,
          JSON.parse(event.documents || "[]")
        );
      } else if (event.operation === "delete") {
        await deleteWorkspaceDocuments(
          event.workspaceId,
          JSON.parse(event.ids || "[]")
        );
      } else {
        throw new Error(`Unknown knowledge operation: ${event.operation}`);
      }
      await this.redis.xack(streamKey, consumerGroup, streamId);
    } catch (error) {
      await this.redis
        .multi()
        .xadd(
          deadLetterStreamKey,
          "MAXLEN",
          "~",
          10000,
          "*",
          "sourceStreamId",
          streamId,
          "payload",
          JSON.stringify(event),
          "error",
          error.message,
          "failedAt",
          new Date().toISOString()
        )
        .xack(streamKey, consumerGroup, streamId)
        .exec();
    }
  }

  async status() {
    return {
      stream: streamKey,
      group: consumerGroup,
      consumer: this.consumerName,
      groups: await this.redis.xinfo("GROUPS", streamKey),
    };
  }

  async close() {
    this.running = false;
    await closeRedis(this.redis);
  }
}

let producer;
const getKnowledgeIndexProducer = async () => {
  if (!producer) {
    producer = await new KnowledgeIndexProducer().connect();
  }
  return producer;
};

const queueKnowledgeUpsert = async (workspaceId, documents) => {
  const indexProducer = await getKnowledgeIndexProducer();
  await indexProducer.enqueue({
    operation: "upsert",
    workspaceId,
    documents,
  });
};

const queueKnowledgeDelete = async (workspaceId, ids) => {
  const indexProducer = await getKnowledgeIndexProducer();
  await indexProducer.enqueue({
    operation: "delete",
    workspaceId,
    ids,
  });
};

module.exports = {
  KnowledgeIndexWorker,
  queueKnowledgeDelete,
  queueKnowledgeUpsert,
  streamKey,
};
