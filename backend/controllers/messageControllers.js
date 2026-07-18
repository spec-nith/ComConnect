const asyncHandler = require("express-async-handler");
const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const { getMessageStreamProducer } = require("../services/messageStreamService");
const { recordAnalyticsEvent } = require("../services/opensearchAnalyticsService");

const allMessages = asyncHandler(async (req, res) => {
  const chat = await Chat.findOne({
    _id: req.params.chatId,
    users: req.user._id,
  }).select("_id");
  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }

  const messages = await Message.find({ chat: req.params.chatId })
    .populate("sender", "name pic email")
    .populate("chat")
    .sort({ createdAt: 1 });
  res.json(messages);
});

const markMessagesRead = asyncHandler(async (req, res) => {
  const chat = await Chat.findOne({
    _id: req.params.chatId,
    users: req.user._id,
  }).select("_id");
  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }

  const unreadMessages = await Message.find({
    chat: req.params.chatId,
    sender: { $ne: req.user._id },
    readBy: { $ne: req.user._id },
  }).select("_id");
  const messageIds = unreadMessages.map((message) => message._id);

  if (messageIds.length > 0) {
    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $addToSet: { readBy: req.user._id } }
    );
    recordAnalyticsEvent("message.read", {
      request_id: req.requestId,
      actor_user_id: req.user._id.toString(),
      chat_id: req.params.chatId,
      message_count: messageIds.length,
    });
  }

  res.json({
    chatId: req.params.chatId,
    readBy: req.user._id,
    messageIds,
  });
});

const sendMessage = asyncHandler(async (req, res) => {
  const { content, chatId } = req.body;
  if (!content?.trim() || !chatId) {
    res.status(400);
    throw new Error("content and chatId are required");
  }

  const producer = await getMessageStreamProducer();
  const message = await producer.enqueue({
    senderId: req.user._id,
    content: content.trim(),
    chatId,
    requestId: req.requestId,
  });
  res.status(201).json(message);
});

module.exports = { allMessages, markMessagesRead, sendMessage };
