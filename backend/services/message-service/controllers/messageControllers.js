const asyncHandler = require("express-async-handler");
const cassandraService = require("../services/cassandraService");
const kafkaService = require("../services/kafkaService");
const { createSpan, addSpanAttribute, recordSpanError } = require("../shared/middleware/tracing");
const { trackDbOperation } = require("../shared/middleware/metrics");

//@description     Get all Messages
//@route           GET /api/Message/:chatId
//@access          Protected
const allMessages = asyncHandler(async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const messages = await cassandraService.getMessagesByChatId(chatId);
    
    // Note: User information needs to be fetched from user-service
    // For now, return messages with sender IDs
    res.json(messages);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

//@description     Create New Message
//@route           POST /api/Message/
//@access          Protected
const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId, mediaUrl, mediaType, mediaThumbnail } = req.body;

  if ((!content && !mediaUrl) || !chatId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  try {
    // Get chat info from Cassandra
    const chat = await cassandraService.getChatById(chatId);
    if (!chat) {
      res.status(404);
      throw new Error("Chat not found");
    }

    // KAFKA-FIRST ARCHITECTURE: Publish to Kafka instead of saving directly to DB
    // The Kafka consumer will handle persistence to Cassandra
    const kafkaSpan = createSpan('kafka.publish_message', req.span);
    const endKafkaTimer = trackDbOperation('publish', 'kafka', 'message-service');
    
    // Generate temporary message ID for response
    const { v4: uuidv4 } = require('uuid');
    const tempMessageId = uuidv4();
    
    // Publish message to Kafka for persistence
    const published = await kafkaService.publishMessageForPersistence({
      tempMessageId: tempMessageId,
      senderId: req.user.id || req.user._id,
      senderName: req.user.name,
      content: content,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      mediaThumbnail: mediaThumbnail,
      chatId: chatId,
      isGroupChat: chat.isGroupChat || chat.is_group_chat,
      chatName: chat.chatName || chat.chat_name || '',
      users: chat.users || [],
      timestamp: new Date().toISOString(),
      requestId: req.id
    }, req.id);
    
    endKafkaTimer();
    kafkaSpan.end();
    
    if (!published) {
      // Fallback: If Kafka fails, save directly to Cassandra (graceful degradation)
      console.warn('⚠️ Kafka publish failed, falling back to direct DB save');
      const dbSpan = createSpan('database.create_message_fallback', req.span);
      const savedMessage = await cassandraService.saveMessage({
        chatId: chatId,
        senderId: req.user.id || req.user._id,
        content: content,
        readBy: []
      });
      
      await cassandraService.updateChatLatestMessage(chatId, savedMessage.id);
      
      dbSpan.end();
      return res.json(savedMessage);
    }

    // Return response immediately (async processing)
    // The actual message will be saved by Kafka consumer
    // Frontend will receive updates via Socket.IO/Redis
    const responseMessage = {
      _id: tempMessageId,
      id: tempMessageId,
      sender: {
        _id: req.user.id || req.user._id,
        id: req.user.id || req.user._id,
        name: req.user.name,
        pic: req.user.pic
      },
      content: content,
      chat: {
        _id: chatId,
        id: chatId,
        users: chat.users || [],
        isGroupChat: chat.isGroupChat || chat.is_group_chat,
        chatName: chat.chatName || chat.chat_name
      },
      createdAt: new Date(),
      pending: true // Indicates message is being processed
    };

    addSpanAttribute('message.tempId', tempMessageId);
    addSpanAttribute('chat.id', chatId);
    addSpanAttribute('kafka.published', 'true');

    console.log(`📤 [Message Service] Message published to Kafka for persistence - Chat: ${chatId}, Temp ID: ${tempMessageId}`);
    console.log(`✅ Message queued for persistence via Kafka`);

    res.json(responseMessage);
  } catch (error) {
    console.error('❌ Error in sendMessage:', error);
    res.status(400);
    throw new Error(error.message);
  }
});

const deleteAllMessages = asyncHandler(async (req, res) => {
  try {
    // Note: Cassandra doesn't support DELETE ALL efficiently
    // This would require deleting by partition keys
    res.status(200).json({ message: 'Bulk delete not supported. Delete messages by chat ID.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete messages', error: error.message });
  }
});

module.exports = { allMessages, sendMessage, deleteAllMessages };
