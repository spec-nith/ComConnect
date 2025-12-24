/**
 * Kafka Service for Chat Service
 * Handles async chat events and notifications
 */

const { Kafka } = require('kafkajs');

// Kafka Configuration
const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || 'chat-service',
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
      console.log('🔄 Initializing Kafka Service...');
      
      // Initialize producer
      this.producer = kafka.producer();
      await this.producer.connect();
      console.log('✅ Kafka Producer connected');
      
      // Initialize consumer
      this.consumer = kafka.consumer({
        groupId: process.env.KAFKA_GROUP_ID || 'chat-service-group'
      });
      
      await this.consumer.connect();
      console.log('✅ Kafka Consumer connected');
      
      // Subscribe to topics
      await this.consumer.subscribe({
        topics: ['chat-events', 'chat-notifications']
      });
      console.log('✅ Subscribed to Kafka topics');
      
      // Start consuming messages
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const event = JSON.parse(message.value.toString());
            await this.handleMessage(topic, event);
          } catch (error) {
            console.error('❌ Error processing Kafka message:', error);
          }
        },
      });
      
      this.connected = true;
      console.log('✅ Kafka Service initialized successfully');
    } catch (error) {
      this.connected = false;
      console.warn('⚠️ Kafka Service initialization failed, continuing without Kafka:', error.message);
      // Set environment variable to silence KafkaJS partitioner warning
      process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';
      // Don't throw - allow service to continue without Kafka
    }
  }

  /**
   * Handle incoming Kafka messages
   */
  async handleMessage(topic, event) {
    try {
      console.log(`📨 Received message on topic ${topic}:`, event.type);
      
      switch (topic) {
        case 'chat-events':
          await this.handleChatEvent(event);
          break;
        case 'chat-notifications':
          await this.handleChatNotification(event);
          break;
        default:
          console.warn(`⚠️ Unknown topic: ${topic}`);
      }
    } catch (error) {
      console.error('❌ Error handling Kafka message:', error);
    }
  }

  /**
   * Handle chat events
   */
  async handleChatEvent(event) {
    // Process chat events (analytics, logging, etc.)
    console.log('📊 Processing chat event:', event.type);
    // Add your event processing logic here
  }

  /**
   * Handle chat notifications
   */
  async handleChatNotification(event) {
    // Process chat notifications
    console.log('🔔 Processing chat notification:', event.type);
    // Add your notification processing logic here
  }

  /**
   * Publish chat event to Kafka
   */
  async publishChatEvent(topic, eventType, data) {
    try {
      if (!this.connected || !this.producer) {
        console.warn('⚠️ Kafka producer not connected, skipping event');
        return false;
      }

      const message = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        service: 'chat-service',
        requestId: data.requestId || null
      };

      await this.producer.send({
        topic,
        messages: [{
          key: data.chatId || data.userId || 'default',
          value: JSON.stringify(message)
        }]
      });

      console.log(`📤 Published ${eventType} to Kafka topic: ${topic}`);
      return true;
    } catch (error) {
      console.error(`❌ Error publishing to Kafka topic ${topic}:`, error);
      return false;
    }
  }

  /**
   * Publish chat created event
   */
  async publishChatCreated(chatData, requestId) {
    return this.publishChatEvent('chat-events', 'chat.created', {
      ...chatData,
      requestId
    });
  }

  /**
   * Publish chat updated event
   */
  async publishChatUpdated(chatData, requestId) {
    return this.publishChatEvent('chat-events', 'chat.updated', {
      ...chatData,
      requestId
    });
  }

  /**
   * Publish group chat created event
   */
  async publishGroupChatCreated(chatData, requestId) {
    return this.publishChatEvent('chat-events', 'group-chat.created', {
      ...chatData,
      requestId
    });
  }

  /**
   * Publish user added to group event
   */
  async publishUserAddedToGroup(chatId, userId, addedBy, requestId) {
    return this.publishChatEvent('chat-events', 'user.added-to-group', {
      chatId,
      userId,
      addedBy,
      requestId
    });
  }

  /**
   * Publish user removed from group event
   */
  async publishUserRemovedFromGroup(chatId, userId, removedBy, requestId) {
    return this.publishChatEvent('chat-events', 'user.removed-from-group', {
      chatId,
      userId,
      removedBy,
      requestId
    });
  }

  /**
   * Publish group renamed event
   */
  async publishGroupRenamed(chatId, oldName, newName, requestId) {
    return this.publishChatEvent('chat-events', 'group.renamed', {
      chatId,
      oldName,
      newName,
      requestId
    });
  }

  /**
   * Test Kafka connection
   */
  async testConnection() {
    try {
      if (!this.producer) {
        return false;
      }
      await this.producer.send({
        topic: 'chat-events',
        messages: [{
          key: 'test',
          value: JSON.stringify({ type: 'test', timestamp: new Date().toISOString() })
        }]
      });
      return true;
    } catch (error) {
      console.error('❌ Kafka connection test failed:', error);
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      if (this.producer) {
        await this.producer.disconnect();
        console.log('✅ Kafka Producer disconnected');
      }
      if (this.consumer) {
        await this.consumer.disconnect();
        console.log('✅ Kafka Consumer disconnected');
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

