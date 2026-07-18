const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const { extractTags } = require("./tagService");
const User = require("../models/userModel");
const { queueChatNotifications } = require("./notificationClient");
const { queueKnowledgeUpsert } = require("./knowledgeIndexService");
const { buildMessageDocument } = require("./workspaceKnowledgeService");
const { recordAnalyticsEvent } = require("./opensearchAnalyticsService");

const persistMessage = async ({ eventId, senderId, content, chatId }) => {
  const existing = await Message.findOne({ streamEventId: eventId });
  if (existing) {
    await existing.populate("sender", "name pic email");
    await existing.populate("chat");
    await User.populate(existing, {
      path: "chat.users",
      select: "name pic email",
    });
    return existing;
  }

  const chat = await Chat.findById(chatId).select("users chatName isGroupChat");
  if (!chat) {
    const error = new Error("Chat not found");
    error.statusCode = 404;
    throw error;
  }
  if (!chat.users.some((userId) => userId.toString() === senderId.toString())) {
    const error = new Error("You are not a member of this chat");
    error.statusCode = 403;
    throw error;
  }

  let message = await Message.create({
    sender: senderId,
    content,
    chat: chatId,
    readBy: [senderId],
    tags: extractTags(content),
    streamEventId: eventId,
  });
  message = await message.populate("sender", "name pic email");
  message = await message.populate("chat");
  message = await User.populate(message, {
    path: "chat.users",
    select: "name pic email",
  });
  await Chat.findByIdAndUpdate(chatId, { latestMessage: message._id });

  const recipients = message.chat.users
    .filter((user) => user._id.toString() !== senderId.toString())
    .map((user) => user._id.toString());

  queueChatNotifications({
    recipients,
    title: message.chat.isGroupChat
      ? `New message in ${message.chat.chatName}`
      : `New message from ${message.sender.name}`,
    body: message.content,
    data: {
      type: "new_message",
      chatId: chatId.toString(),
      messageId: message._id.toString(),
      senderId: message.sender._id.toString(),
      senderName: message.sender.name,
      isGroupChat: message.chat.isGroupChat.toString(),
      chatName: message.chat.chatName || "",
      timestamp: message.createdAt.toISOString(),
    },
  }).catch((error) => {
    console.error("Unable to queue chat notifications:", error.message);
  });
  if (message.chat.workspace) {
    queueKnowledgeUpsert(message.chat.workspace, [buildMessageDocument(message)]).catch(
      (error) => {
        console.error("Unable to queue message indexing:", error.message);
      }
    );
  }
  recordAnalyticsEvent("message.sent", {
    actor_user_id: senderId.toString(),
    workspace_id: message.chat.workspace?.toString(),
    chat_id: chatId.toString(),
    message_id: message._id.toString(),
    is_group_chat: Boolean(message.chat.isGroupChat),
    message_length: message.content.length,
    tags: message.tags || [],
  });

  return message;
};

module.exports = { persistMessage };
