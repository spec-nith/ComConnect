/**
 * Redis Pub/Sub Service for Message Service
 * Handles real-time message updates and notifications
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

// Create Redis publisher for sending messages
const publisher = new Redis(redisConfig);

// Event listeners
publisher.on('connect', () => {
  console.log('✅ Redis Publisher connected (Message Service)');
});

publisher.on('error', (err) => {
  console.error('❌ Redis Publisher Error (Message Service):', err.message);
});

/**
 * Publish message event to Redis channel
 */
const publishMessageEvent = async (channel, event, data) => {
  try {
    const message = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
      service: 'message-service'
    });
    
    await publisher.publish(channel, message);
    console.log(`📤 [Message Service] Published ${event} to channel: ${channel}`, {
      chatId: data.chatId || data.chat?._id,
      messageId: data.messageId || data._id,
      senderId: data.senderId || data.sender?._id
    });
    return true;
  } catch (error) {
    console.error(`❌ Error publishing to Redis channel ${channel}:`, error);
    return false;
  }
};

/**
 * Test Redis connection
 */
const testConnection = async () => {
  try {
    const result = await publisher.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('❌ Redis connection test failed:', error);
    return false;
  }
};

module.exports = {
  publisher,
  publishMessageEvent,
  testConnection
};

