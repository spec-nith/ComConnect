/**
 * Kafka Service for Message Service
 * Handles async message events and analytics
 */

const { Kafka } = require('kafkajs');

// Load models at module level to ensure they're registered with mongoose
const Message = require('../models/messageModel');
const Chat = require('../models/chatModel');
const User = require('../models/userModel');

// Kafka Configuration
const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || 'message-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
  connectionTimeout: 30000,
  retry: {
    initialRetryTime: 100,
    maxRetryTime: 30000,
    retries: 8
  }
};

const kafka = new Kafka(kafkaConfig);

class KafkaService {
  constructor() {
    this.producer = null;
    this.consumer = null;
    this.connected = false;
  }

  /**
   * Initialize Kafka producer and consumer
   */
  async initialize() {
    try {
      console.log('🔄 Initializing Kafka Service (Message Service)...');
      
      // Initialize producer
      this.producer = kafka.producer({
        createPartitioner: () => {
          // Use default partitioner to avoid warnings
          const { Partitioners } = require('kafkajs');
          return Partitioners.DefaultPartitioner;
        },
        idempotent: true, // Ensure exactly-once semantics
        maxInFlightRequests: 1,
        retry: {
          retries: 8
        }
      });
      
      await this.producer.connect();
      console.log('✅ Kafka Producer connected (Message Service)');
      
      // Initialize consumer for message persistence
      // Use a unique group ID for message persistence (hardcoded to avoid conflicts)
      const groupId = 'message-persistence-group';
      console.log(`📋 Using Kafka Consumer Group ID: ${groupId}`);
      this.consumer = kafka.consumer({
        groupId: groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000
      });
      
      await this.consumer.connect();
      console.log('✅ Kafka Consumer connected (Message Service)');
      
      // Subscribe to message persistence topic
      await this.consumer.subscribe({
        topics: ['message-persistence'],
        fromBeginning: false
      });
      console.log('✅ Subscribed to Kafka topic: message-persistence');
      
      // Start consuming messages for persistence
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const event = JSON.parse(message.value.toString());
            await this.handleMessagePersistence(topic, event);
          } catch (error) {
            console.error('❌ Error processing Kafka message for persistence:', error);
          }
        },
      });
      
      this.connected = true;
      console.log('✅ Kafka Service initialized successfully (Message Service)');
      return true;
    } catch (error) {
      this.connected = false;
      console.warn('⚠️ Kafka Service initialization failed, continuing without Kafka:', error.message);
      // Set environment variable to silence KafkaJS partitioner warning
      process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
      return false;
    }
  }

  /**
   * Handle message persistence from Kafka
   * This is where messages are actually saved to MongoDB
   */
  async handleMessagePersistence(topic, event) {
    try {
      if (event.type !== 'message.create') {
        return; // Only handle message creation events
      }

      const messageData = event.data;

      console.log('💾 [Kafka Consumer] Processing message for persistence:', {
        chatId: messageData.chatId,
        senderId: messageData.senderId,
        contentPreview: messageData.content?.substring(0, 50)
      });

      // Create message in MongoDB
      const newMessage = await Message.create({
        sender: messageData.senderId,
        content: messageData.content,
        chat: messageData.chatId
      });

      // Populate message
      let message = await newMessage.populate("sender", "name pic");
      message = await message.populate("chat");
      message = await User.populate(message, {
        path: "chat.users",
        select: "name pic email",
      });

      // Update chat with latest message
      await Chat.findByIdAndUpdate(messageData.chatId, {
        latestMessage: message,
      });

      console.log('✅ [Kafka Consumer] Message saved to MongoDB:', {
        messageId: message._id.toString(),
        chatId: messageData.chatId
      });

      // Publish to Redis for real-time updates
      const redisService = require('./redisService');
      await redisService.publishMessageEvent('chat:updates', 'message.sent', {
        messageId: message._id.toString(),
        chatId: messageData.chatId,
        senderId: message.sender._id.toString(),
        senderName: message.sender.name,
        content: messageData.content.substring(0, 100),
        isGroupChat: message.chat.isGroupChat,
        chatName: message.chat.chatName || '',
        users: message.chat.users.map(u => u._id.toString()),
        requestId: messageData.requestId
      });

      // Send notifications (async, don't block)
      const { makeRequest } = require('../shared/utils/circuitBreaker');
      message.chat.users.forEach(async (user) => {
        if (user._id.toString() !== messageData.senderId) {
          try {
            const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:5006';
            await makeRequest(
              `${notificationServiceUrl}/api/notification/send`,
              {
                method: 'POST',
                data: {
                  userId: user._id.toString(),
                  title: message.chat.isGroupChat 
                    ? `New message in ${message.chat.chatName}`
                    : `New message from ${message.sender.name}`,
                  body: messageData.content,
                  data: {
                    type: 'new_message',
                    chatId: messageData.chatId,
                    messageId: message._id.toString(),
                    senderId: message.sender._id.toString(),
                    senderName: message.sender.name,
                    isGroupChat: message.chat.isGroupChat.toString(),
                    chatName: message.chat.chatName || '',
                    timestamp: new Date().toISOString()
                  }
                },
                headers: {
                  'Content-Type': 'application/json',
                  'X-Request-ID': messageData.requestId || ''
                },
                requestId: messageData.requestId,
                timeout: 5000
              },
              'notificationService'
            );
          } catch (error) {
            console.error(`❌ Notification failed for user ${user._id}:`, error.message);
          }
        }
      });

      // Publish to analytics topic
      await this.publishMessageEvent('chat-events', 'message.sent', {
        messageId: message._id.toString(),
        chatId: messageData.chatId,
        senderId: message.sender._id.toString(),
        senderName: message.sender.name,
        content: messageData.content,
        isGroupChat: message.chat.isGroupChat,
        chatName: message.chat.chatName || '',
        users: message.chat.users.map(u => u._id.toString()),
        timestamp: new Date().toISOString(),
        requestId: messageData.requestId
      });

    } catch (error) {
      console.error('❌ Error persisting message from Kafka:', error);
      throw error; // Re-throw to trigger Kafka retry mechanism
    }
  }

  /**
   * Publish message event to Kafka
   */
  async publishMessageEvent(topic, eventType, data) {
    try {
      if (!this.connected || !this.producer) {
        console.warn('⚠️ Kafka producer not connected, skipping event');
        return false;
      }

      const message = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        service: 'message-service',
        requestId: data.requestId || null
      };

      await this.producer.send({
        topic,
        messages: [{
          key: data.chatId || data.messageId || 'default',
          value: JSON.stringify(message)
        }]
      });

      console.log(`📤 [Kafka] Published ${eventType} to topic: ${topic}`, {
        messageId: data.messageId,
        chatId: data.chatId
      });
      return true;
    } catch (error) {
      console.error(`❌ Error publishing to Kafka topic ${topic}:`, error.message);
      return false;
    }
  }

  /**
   * Publish message for persistence (Kafka-first architecture)
   * This is the primary way messages are saved to DB
   */
  async publishMessageForPersistence(messageData, requestId) {
    return this.publishMessageEvent('message-persistence', 'message.create', {
      ...messageData,
      requestId
    });
  }

  /**
   * Publish message sent event (for analytics)
   */
  async publishMessageSent(messageData, requestId) {
    return this.publishMessageEvent('chat-events', 'message.sent', {
      ...messageData,
      requestId
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
        console.log('✅ Kafka Consumer disconnected (Message Service)');
      }
      if (this.producer) {
        await this.producer.disconnect();
        console.log('✅ Kafka Producer disconnected (Message Service)');
      }
      this.connected = false;
    } catch (error) {
      console.error('❌ Error shutting down Kafka Service:', error);
    }
  }
}

// Create singleton instance
const kafkaService = new KafkaService();

module.exports = kafkaService;

