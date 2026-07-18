const { closeRedis, connectRedis, createRedisClient } = require("./redisClient");

const presenceTtlSeconds = Number(process.env.PRESENCE_TTL_SECONDS || 75);
const socketKey = (socketId) => `presence:socket:${socketId}`;
const userSocketsKey = (userId) => `presence:user:${userId}:sockets`;
const onlineUsersKey = "presence:online-users";
const lastSeenKey = (userId) => `presence:user:${userId}:last-seen`;
const presenceChannel = "presence:events";

class PresenceService {
  constructor() {
    this.redis = createRedisClient("chat-presence");
  }

  async connect() {
    await connectRedis(this.redis);
    return this;
  }

  async register({ userId, socketId, serverId }) {
    const now = new Date().toISOString();
    const payload = JSON.stringify({ userId, socketId, serverId, connectedAt: now });
    const pipeline = this.redis.multi();
    pipeline.set(socketKey(socketId), payload, "EX", presenceTtlSeconds);
    pipeline.sadd(userSocketsKey(userId), socketId);
    pipeline.sadd(onlineUsersKey, userId);
    pipeline.del(lastSeenKey(userId));
    pipeline.publish(
      presenceChannel,
      JSON.stringify({ userId, status: "online", serverId, timestamp: now })
    );
    await pipeline.exec();
    return { userId, online: true, lastSeen: null };
  }

  async refresh(socketId) {
    if (await this.redis.exists(socketKey(socketId))) {
      await this.redis.expire(socketKey(socketId), presenceTtlSeconds);
    }
  }

  async unregister(socketId) {
    const raw = await this.redis.get(socketKey(socketId));
    if (!raw) return;
    const { userId, serverId } = JSON.parse(raw);
    const now = new Date().toISOString();
    await this.redis.del(socketKey(socketId));
    await this.redis.srem(userSocketsKey(userId), socketId);
    const presence = await this.get(userId);
    if (!presence.online) {
      await this.redis
        .multi()
        .srem(onlineUsersKey, userId)
        .set(lastSeenKey(userId), now)
        .publish(
          presenceChannel,
          JSON.stringify({ userId, status: "offline", serverId, timestamp: now })
        )
        .exec();
      presence.lastSeen = now;
    }
    return presence;
  }

  async get(userId) {
    const socketIds = await this.redis.smembers(userSocketsKey(userId));
    if (socketIds.length === 0) {
      return {
        userId,
        online: false,
        connections: 0,
        lastSeen: await this.redis.get(lastSeenKey(userId)),
      };
    }

    const exists = await Promise.all(
      socketIds.map(async (socketId) => [socketId, await this.redis.exists(socketKey(socketId))])
    );
    const staleSocketIds = exists.filter(([, active]) => !active).map(([socketId]) => socketId);
    if (staleSocketIds.length > 0) {
      await this.redis.srem(userSocketsKey(userId), ...staleSocketIds);
    }
    const connections = exists.length - staleSocketIds.length;
    if (connections === 0) {
      await this.redis.srem(onlineUsersKey, userId);
    }
    return {
      userId,
      online: connections > 0,
      connections,
      lastSeen: connections > 0 ? null : await this.redis.get(lastSeenKey(userId)),
    };
  }

  async getMany(userIds) {
    return Promise.all([...new Set(userIds)].map((userId) => this.get(userId)));
  }

  async close() {
    await closeRedis(this.redis);
  }
}

let singleton;
const getPresenceService = async () => {
  if (!singleton) {
    singleton = await new PresenceService().connect();
  }
  return singleton;
};

module.exports = { PresenceService, getPresenceService, presenceTtlSeconds };
