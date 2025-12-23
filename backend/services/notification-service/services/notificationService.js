const admin = require('../config/firebase');
const { Kafka } = require('kafkajs');
const Redis = require('ioredis');

console.log('Starting NotificationService with config:', {
  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT,
  kafkaBroker: process.env.KAFKA_BROKER
});

// Redis Configuration
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 2000, 10000);
    console.log(`⏳ Redis connection attempt ${times}, retrying in ${delay}ms`);
    return delay;
  }
};

console.log('Initializing Redis with config:', redisConfig);
const redis = new Redis(redisConfig);

// Enhanced Redis event listeners
redis.on('connect', () => {
  console.log('✅ Redis connecting to:', redisConfig.host);
});

redis.on('ready', () => {
  console.log('✅ Redis connection established');
});

redis.on('error', (err) => {
  console.error('❌ Redis Error:', err.message);
  console.error('Redis Config:', redisConfig);
});

redis.on('close', () => {
  console.log('❌ Redis connection closed');
});

redis.on('reconnecting', (ms) => {
  console.log(`🔄 Redis reconnecting in ${ms}ms`);
});

// Test connection function
async function testRedisConnection() {
  try {
    console.log('🔄 Testing Redis connection...');
    const result = await redis.ping();
    console.log('Redis ping result:', result);
    return result === 'PONG';
  } catch (error) {
    console.error('❌ Redis connection test failed:', error.message);
    return false;
  }
}

// Kafka Configuration
const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  connectionTimeout: 30000,
  retry: {
    initialRetryTime: 100,
    maxRetryTime: 30000,
    retries: 8
  }
};

console.log('Initializing Kafka with config:', kafkaConfig);
const kafka = new Kafka(kafkaConfig);

class NotificationService {
  constructor() {
    this.redis = redis;
    this.producer = null;
    this.consumer = null;
    this.kafkaConnected = false;
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔄 Initializing NotificationService...');
      
      // Initialize Kafka clients
      this.producer = kafka.producer();
      this.consumer = kafka.consumer({ 
        groupId: process.env.KAFKA_GROUP_ID || 'notification-group' 
      });

      // Connect to Kafka
      await this.producer.connect();
      this.kafkaConnected = true;
      console.log('✅ Kafka Producer connected');
      
      await this.consumer.connect();
      console.log('✅ Kafka Consumer connected');
      
      // Subscribe to topics
      await this.consumer.subscribe({ 
        topics: ['notifications', 'chat-notifications'] 
      });
      console.log('✅ Subscribed to Kafka topics');

      // Start consuming messages
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const notification = JSON.parse(message.value.toString());
            console.log('Received notification from Kafka:', notification);
            await this.sendNotification(notification);
          } catch (error) {
            console.error('Error processing Kafka message:', error);
          }
        },
      });

      console.log('✅ NotificationService initialized successfully');
    } catch (error) {
      this.kafkaConnected = false;
      console.error('❌ Error initializing NotificationService:', error);
      console.error('Connection details:', {
        redisConfig,
        kafkaConfig,
        error: error.message
      });
    }
  }

  async testConnections() {
    try {
      const redisPing = await this.redis.ping();
      
      return {
        redis: redisPing === 'PONG',
        kafka: this.kafkaConnected,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Connection test error:', error);
      return {
        redis: false,
        kafka: this.kafkaConnected,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async sendNotification(notification) {
    const { userId, title, body, data } = notification;
    const fcmToken = await this.getFCMToken(userId);

    console.log('📤 Sending notification to user:', userId);
    console.log('📱 FCM Token:', fcmToken);

    if (!fcmToken) {
      console.log('❌ No FCM token found for user:', userId);
      return;
    }

    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        chatId: (data?.chatId || '').toString(),
        messageId: (data?.messageId || '').toString(),
        type: (data?.type || 'message').toString(),
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        notification: {
          title,
          body,
          icon: '/icon.png',
          badge: '/badge.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          actions: [
            {
              action: 'open',
              title: 'Open Chat'
            }
          ]
        },
        fcm_options: {
          link: data?.chatId ? `/chat/${data.chatId}` : '/'
        }
      },
      android: {
        priority: 'high'
      },
    };

    try {
      console.log('📤 Sending FCM message:', message);
      const response = await admin.messaging().send(message);
      console.log('✅ FCM notification sent successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Error sending FCM notification:', error);
      if (error.code === 'messaging/invalid-registration-token' || 
          error.code === 'messaging/registration-token-not-registered') {
        console.log('🔄 Removing invalid token for user:', userId);
        await this.redis.del(`user:${userId}:fcmToken`);
      }
      throw error;
    }
  }

  async queueNotification(notification) {
    try {
      console.log('📤 Queuing notification:', notification);

      // Verify Kafka connection first
      try {
        await this.producer.send({
          topic: 'test-topic',
          messages: [{ value: 'test message' }],
        });
      } catch (error) {
        console.log('❌ Kafka producer not connected. Reconnecting...');
        await this.producer.connect();
      }

      // Send notification to Kafka
      await this.producer.send({
        topic: 'chat-notifications',
        messages: [
          {
            key: notification.userId,
            value: JSON.stringify(notification),
            headers: {
              timestamp: Date.now().toString()
            }
          },
        ],
      });

      console.log('✅ Notification queued successfully');
    } catch (error) {
      console.error('❌ Failed to queue notification:', error);
      // If Kafka fails, try sending directly
      await this.sendNotification(notification);
    }
  }

  async cacheUserToken(userId, fcmToken) {
    await this.redis.set(`user:${userId}:fcmToken`, fcmToken);
  }

  async getFCMToken(userId) {
    return await this.redis.get(`user:${userId}:fcmToken`);
  }

  async testKafkaConnection() {
    return this.kafkaConnected;
  }

  async testRedisConnection() {
    return await testRedisConnection();
  }
}

// Export a single instance
const notificationService = new NotificationService();
module.exports = notificationService;

