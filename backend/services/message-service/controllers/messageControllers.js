const asyncHandler = require("express-async-handler");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const { makeRequest } = require("../../shared/utils/circuitBreaker");
const { createSpan, addSpanAttribute, recordSpanError } = require("../../shared/middleware/tracing");
const { trackDbOperation } = require("../../shared/middleware/metrics");

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

  var newMessage = {
    sender: req.user._id,
    content: content,
    chat: chatId,
  };

  try {
    // Create span for database operations
    const dbSpan = createSpan('database.create_message', req.span);
    const endDbTimer = trackDbOperation('create', 'messages', 'message-service');
    
    var message = await Message.create(newMessage);
    endDbTimer();
    dbSpan.end();
    
    // Populate message
    const populateSpan = createSpan('database.populate_message', req.span);
    message = await message.populate("sender", "name pic");
    message = await message.populate("chat");
    message = await User.populate(message, {
      path: "chat.users",
      select: "name pic email",
    });
    populateSpan.end();

    // Update chat
    const updateSpan = createSpan('database.update_chat', req.span);
    await Chat.findByIdAndUpdate(req.body.chatId, {
      latestMessage: message,
    });
    updateSpan.end();
    
    addSpanAttribute('message.id', message._id.toString());
    addSpanAttribute('chat.id', chatId);

    // Send notifications via notification service with circuit breaker and tracing
    const notificationSpan = createSpan('notifications.send', req.span);
    addSpanAttribute('notification.recipients.count', message.chat.users.length - 1);
    
    const notificationPromises = message.chat.users.map(async (user) => {
      if (user._id.toString() !== req.user._id.toString()) {
        const userSpan = createSpan(`notification.send_to_user.${user._id}`, notificationSpan);
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
                body: content,
                data: {
                  type: 'new_message',
                  chatId: chatId.toString(),
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
                'X-Request-ID': req.id || ''
              },
              requestId: req.id,
              timeout: 5000
            },
            'notificationService'
          );
          userSpan.setAttribute('notification.status', 'success');
          userSpan.end();
        } catch (error) {
          console.error(`❌ Notification failed for user ${user._id}:`, error.message);
          recordSpanError(error);
          userSpan.setAttribute('notification.status', 'failed');
          userSpan.end();
        }
      }
    });
    
    await Promise.all(notificationPromises);
    notificationSpan.end();

    await Promise.all(notificationPromises);
    console.log('✅ All notifications processed');

    res.json(message);
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

