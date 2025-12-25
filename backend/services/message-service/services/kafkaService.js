/**
 * Kafka Service for Message Service
 * Handles async message events and analytics
 * Messages are persisted to Cassandra via Kafka
 */

const { Kafka } = require('kafkajs');
const cassandraService = require('./cassandraService');
const elasticsearchService = require('../../shared/services/elasticsearchService');

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
      process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
      return false;
    }
  }

  /**
   * Handle message persistence from Kafka
   * This is where messages are actually saved to Cassandra
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

      // Save message to Cassandra
      const savedMessage = await cassandraService.saveMessage({
        chatId: messageData.chatId,
        senderId: messageData.senderId,
        content: messageData.content,
        mediaUrl: messageData.mediaUrl,
        mediaType: messageData.mediaType,
        mediaThumbnail: messageData.mediaThumbnail,
        readBy: []
      });

      // Update chat's latest message in Cassandra
      await cassandraService.updateChatLatestMessage(
        messageData.chatId,
        savedMessage.id
      );

      console.log('✅ [Kafka Consumer] Message saved to Cassandra:', {
        messageId: savedMessage.id,
        chatId: messageData.chatId
      });

      // Index message in Elasticsearch (async, don't block)
      try {
        await elasticsearchService.indexMessage({
          messageId: savedMessage.id,
          chatId: messageData.chatId,
          senderId: messageData.senderId,
          content: messageData.content,
          createdAt: savedMessage.createdAt || new Date().toISOString(),
          updatedAt: savedMessage.updatedAt || new Date().toISOString(),
          workspaceId: messageData.workspaceId
        });
        console.log('✅ [Kafka Consumer] Message indexed in Elasticsearch:', {
          messageId: savedMessage.id
        });
      } catch (error) {
        console.error('❌ [Kafka Consumer] Failed to index message in Elasticsearch:', error.message);
        // Don't throw - Elasticsearch indexing failure shouldn't block message persistence
      }

      // Publish to Redis for real-time updates
      const redisService = require('./redisService');
      await redisService.publishMessageEvent('chat:updates', 'message.sent', {
        messageId: savedMessage.id,
        chatId: messageData.chatId,
        senderId: messageData.senderId,
        senderName: messageData.senderName || '',
        content: messageData.content.substring(0, 100),
        isGroupChat: messageData.isGroupChat || false,
        chatName: messageData.chatName || '',
        users: messageData.users?.map(u => u._id || u.id) || [],
        requestId: messageData.requestId
      });

      // Send notifications (async, don't block)
      const { makeRequest } = require('../shared/utils/circuitBreaker');
      const users = messageData.users || [];
      users.forEach(async (user) => {
        const userId = user._id || user.id;
        if (userId !== messageData.senderId) {
          try {
            const notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:5006';
            await makeRequest(
              `${notificationServiceUrl}/api/notification/send`,
              {
                method: 'POST',
                data: {
                  userId: userId,
                  title: messageData.isGroupChat 
                    ? `New message in ${messageData.chatName}`
                    : `New message from ${messageData.senderName}`,
                  body: messageData.content,
                  data: {
                    type: 'new_message',
                    chatId: messageData.chatId,
                    messageId: savedMessage.id,
                    senderId: messageData.senderId,
                    senderName: messageData.senderName || '',
                    isGroupChat: messageData.isGroupChat.toString(),
                    chatName: messageData.chatName || '',
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
            console.error(`❌ Notification failed for user ${userId}:`, error.message);
          }
        }
      });

      // Publish to analytics topic
      await this.publishMessageEvent('chat-events', 'message.sent', {
        messageId: savedMessage.id,
        chatId: messageData.chatId,
        senderId: messageData.senderId,
        senderName: messageData.senderName || '',
        content: messageData.content,
        isGroupChat: messageData.isGroupChat || false,
        chatName: messageData.chatName || '',
        users: users.map(u => u._id || u.id),
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
