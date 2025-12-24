const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const { makeRequest } = require("../shared/utils/circuitBreaker");
const { createSpan, addSpanAttribute, recordSpanError } = require("../shared/middleware/tracing");
const { trackDbOperation } = require("../shared/middleware/metrics");
const redisService = require("../services/redisService");
const kafkaService = require("../services/kafkaService");

//@description     Get all Messages
//@route           GET /api/Message/:chatId
//@access          Protected
const allMessages = asyncHandler(async (req, res) => {
  try {
    const messages = await Message.find({ chat: req.params.chatId })
      .populate("sender", "name pic email")
      .populate("chat");
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
  const { content, chatId } = req.body;

  if (!content || !chatId) {
    console.log("Invalid data passed into request");
    return res.sendStatus(400);
  }

  try {
    // Get chat info for response
    const chat = await Chat.findById(chatId).populate("users", "name pic email");
    if (!chat) {
      res.status(404);
      throw new Error("Chat not found");
    }

    // KAFKA-FIRST ARCHITECTURE: Publish to Kafka instead of saving directly to DB
    // The Kafka consumer will handle persistence to MongoDB
    const kafkaSpan = createSpan('kafka.publish_message', req.span);
    const endKafkaTimer = trackDbOperation('publish', 'kafka', 'message-service');
    
    // Generate temporary message ID for response
    const mongoose = require('mongoose');
    const tempMessageId = new mongoose.Types.ObjectId().toString();
    
    // Publish message to Kafka for persistence
    const published = await kafkaService.publishMessageForPersistence({
      tempMessageId: tempMessageId,
      senderId: req.user._id.toString(),
      senderName: req.user.name,
      content: content,
      chatId: chatId.toString(),
      isGroupChat: chat.isGroupChat,
      chatName: chat.chatName || '',
      users: chat.users.map(u => ({
        _id: u._id.toString(),
        name: u.name,
        pic: u.pic,
        email: u.email
      })),
      timestamp: new Date().toISOString(),
      requestId: req.id
    }, req.id);
    
    endKafkaTimer();
    kafkaSpan.end();
    
    if (!published) {
      // Fallback: If Kafka fails, save directly to DB (graceful degradation)
      console.warn('⚠️ Kafka publish failed, falling back to direct DB save');
      const dbSpan = createSpan('database.create_message_fallback', req.span);
      const message = await Message.create({
        sender: req.user._id,
        content: content,
        chat: chatId,
      });
      
      let populatedMessage = await message.populate("sender", "name pic");
      populatedMessage = await populatedMessage.populate("chat");
      populatedMessage = await User.populate(populatedMessage, {
        path: "chat.users",
        select: "name pic email",
      });
      
      await Chat.findByIdAndUpdate(chatId, {
        latestMessage: populatedMessage,
      });
      
      dbSpan.end();
      return res.json(populatedMessage);
    }

    // Return response immediately (async processing)
    // The actual message will be saved by Kafka consumer
    // Frontend will receive updates via Socket.IO/Redis
    const responseMessage = {
      _id: tempMessageId,
      sender: {
        _id: req.user._id,
        name: req.user.name,
        pic: req.user.pic
      },
      content: content,
      chat: {
        _id: chatId,
        users: chat.users,
        isGroupChat: chat.isGroupChat,
        chatName: chat.chatName
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
    await Message.deleteMany({});
    res.status(200).json({ message: 'All messages have been deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete messages', error: error.message });
  }
});

module.exports = { allMessages, sendMessage, deleteAllMessages };

