/**
 * Redis Pub/Sub Service for Chat Service
 * Handles real-time chat updates and notifications
 */

const Redis = require('ioredis');

// Redis Configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 2000, 10000);
    console.log(`⏳ Redis connection attempt ${times}, retrying in ${delay}ms`);
    return delay;
  }
};

// Create Redis clients
// Publisher for sending messages
const publisher = new Redis(redisConfig);

// Subscriber for receiving messages
const subscriber = new Redis(redisConfig);

// Regular client for cache operations
const redisClient = new Redis(redisConfig);

// Event listeners
publisher.on('connect', () => {
  console.log('✅ Redis Publisher connected');
});

publisher.on('error', (err) => {
  console.error('❌ Redis Publisher Error:', err.message);
});

subscriber.on('connect', () => {
  console.log('✅ Redis Subscriber connected');
});

subscriber.on('error', (err) => {
  console.error('❌ Redis Subscriber Error:', err.message);
});

redisClient.on('connect', () => {
  console.log('✅ Redis Client connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis Client Error:', err.message);
});

/**
 * Publish chat event to Redis channel
 */
const publishChatEvent = async (channel, event, data) => {
  try {
    const message = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
      service: 'chat-service'
    });
    
    await publisher.publish(channel, message);
    console.log(`📤 Published ${event} to channel: ${channel}`);
    return true;
  } catch (error) {
    console.error(`❌ Error publishing to Redis channel ${channel}:`, error);
    return false;
  }
};

/**
 * Subscribe to Redis channel
 */
const subscribeToChannel = async (channel, callback) => {
  try {
    await subscriber.subscribe(channel);
    console.log(`✅ Subscribed to Redis channel: ${channel}`);
    
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('❌ Error parsing Redis message:', error);
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Error subscribing to Redis channel ${channel}:`, error);
    return false;
  }
};

/**
 * Cache chat data in Redis
 */
const cacheChat = async (chatId, chatData, ttl = 3600) => {
  try {
    const key = `chat:${chatId}`;
    await redisClient.setex(key, ttl, JSON.stringify(chatData));
    return true;
  } catch (error) {
    console.error(`❌ Error caching chat ${chatId}:`, error);
    return false;
  }
};

/**
 * Get cached chat from Redis
 */
const getCachedChat = async (chatId) => {
  try {
    const key = `chat:${chatId}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`❌ Error getting cached chat ${chatId}:`, error);
    return null;
  }
};

/**
 * Invalidate chat cache
 */
const invalidateChatCache = async (chatId) => {
  try {
    const key = `chat:${chatId}`;
    await redisClient.del(key);
    console.log(`🗑️ Invalidated cache for chat: ${chatId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error invalidating chat cache ${chatId}:`, error);
    return false;
  }
};

/**
 * Cache user's chat list
 */
const cacheUserChats = async (userId, workspaceId, chats, ttl = 1800) => {
  try {
    const key = `user:${userId}:workspace:${workspaceId}:chats`;
    await redisClient.setex(key, ttl, JSON.stringify(chats));
    return true;
  } catch (error) {
    console.error(`❌ Error caching user chats:`, error);
    return false;
  }
};

/**
 * Get cached user chats
 */
const getCachedUserChats = async (userId, workspaceId) => {
  try {
    const key = `user:${userId}:workspace:${workspaceId}:chats`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error(`❌ Error getting cached user chats:`, error);
    return null;
  }
};

/**
 * Invalidate user's chat list cache
 */
const invalidateUserChatsCache = async (userId, workspaceId) => {
  try {
    const key = `user:${userId}:workspace:${workspaceId}:chats`;
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error(`❌ Error invalidating user chats cache:`, error);
    return false;
  }
};

/**
 * Test Redis connection
 */
const testConnection = async () => {
  try {
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    return false;
  }
};

module.exports = {
  publisher,
  subscriber,
  redisClient,
  publishChatEvent,
  subscribeToChannel,
  cacheChat,
  getCachedChat,
  invalidateChatCache,
  cacheUserChats,
  getCachedUserChats,
  invalidateUserChatsCache,
  testConnection
};

