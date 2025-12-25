const asyncHandler = require("express-async-handler");
const cassandraService = require("../services/cassandraService");
const redisService = require("../services/redisService");
const kafkaService = require("../services/kafkaService");
const { createSpan, addSpanAttribute, recordSpanError } = require("../shared/middleware/tracing");
const { trackDbOperation } = require("../shared/middleware/metrics");
const { makeRequest } = require("../shared/utils/circuitBreaker");

// Helper function to fetch user details from user-service
async function fetchUserDetails(userId) {
  try {
    const userServiceUrl = process.env.USER_SERVICE_URL || 'http://user-service:5001';
    const response = await makeRequest(
      `${userServiceUrl}/api/user/${userId}`,
      {
        method: 'GET',
        timeout: 5000
      },
      'userService'
    );
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch user ${userId}:`, error.message);
    return { id: userId, _id: userId };
  }
}

// Helper function to populate users in chat
async function populateChatUsers(chat) {
  if (!chat.users || chat.users.length === 0) {
    return chat;
  }

  const userPromises = chat.users.map(userId => fetchUserDetails(userId));
  const users = await Promise.all(userPromises);
  
  return {
    ...chat,
    users: users
  };
}

//@description     Create or fetch One to One Chat
//@route           POST /api/chat/
//@access          Protected
const accessChat = asyncHandler(async (req, res) => {
  const { userId, workspaceId } = req.body;

  if (!userId || !workspaceId) {
    console.log("UserId or WorkspaceId param not sent with request");
    return res.sendStatus(400);
  }

  const currentUserId = req.user.id || req.user._id;

  // Try to get from cache first
  const cacheKey = `chat:${currentUserId}:${userId}:${workspaceId}`;
  let cachedChat = await redisService.getCachedChat(cacheKey);
  
  if (cachedChat) {
    console.log('📦 Returning cached chat');
    return res.send(cachedChat);
  }
  
  const dbSpan = createSpan('database.find_chat', req.span);
  const endDbTimer = trackDbOperation('find', 'chats', 'chat-service');
  
  // Find existing one-on-one chat
  const existingChats = await cassandraService.findChats({
    workspace: workspaceId,
    isGroupChat: false,
    users: [currentUserId, userId]
  });
  
  endDbTimer();
  dbSpan.end();

  // Filter to find chat with both users
  let isChat = existingChats.filter(chat => {
    const chatUsers = chat.users || [];
    return chatUsers.includes(currentUserId) && chatUsers.includes(userId);
  });

  if (isChat.length > 0) {
    let chat = isChat[0];
    chat = await populateChatUsers(chat);
    
    // Cache the chat
    await redisService.cacheChat(chat._id || chat.id, chat);
    res.send(chat);
  } else {
    // Create new chat
    const chatId = require('uuid').v4();
    var chatData = {
      chatId: chatId,
      chatName: "sender",
      isGroupChat: false,
      users: [currentUserId, userId],
      workspaceId: workspaceId,
    };

    try {
      const dbSpan = createSpan('database.create_chat', req.span);
      const endDbTimer = trackDbOperation('create', 'chats', 'chat-service');
      
      const createdChat = await cassandraService.saveChat(chatData);
      endDbTimer();
      dbSpan.end();
      
      const fullChat = await populateChatUsers(createdChat);
      
      // Cache chat in Redis
      await redisService.cacheChat(createdChat._id || createdChat.id, fullChat);
      
      // Invalidate user chats cache for both users
      await redisService.invalidateUserChatsCache(currentUserId, workspaceId);
      await redisService.invalidateUserChatsCache(userId, workspaceId);
      
      // Publish to Redis pub/sub for real-time updates
      await redisService.publishChatEvent('chat:updates', 'chat.created', {
        chatId: createdChat._id || createdChat.id,
        chat: fullChat,
        requestId: req.id
      });
      
      // Publish to Kafka for async processing
      await kafkaService.publishChatCreated({
        chatId: createdChat._id || createdChat.id,
        chat: fullChat,
        requestId: req.id
      }, req.id);
      
      addSpanAttribute('chat.id', createdChat._id || createdChat.id);
      
      res.status(200).json(fullChat);
    } catch (error) {
      recordSpanError(error);
      res.status(400);
      throw new Error(error.message);
    }
  }
});

//@description     Fetch all chats for a user based upon workspace
//@route           GET /api/chat/
//@access          Protected
const fetchChats = asyncHandler(async (req, res) => {
  const { workspaceId } = req.params;
  const userId = req.user.id || req.user._id;

  try {
    // Try to get from cache first
    const cachedChats = await redisService.getCachedUserChats(userId, workspaceId);
    
    if (cachedChats) {
      console.log('📦 Returning cached chats');
      return res.status(200).send(cachedChats);
    }
    
    // If not in cache, fetch from database
    const dbSpan = createSpan('database.fetch_chats', req.span);
    const endDbTimer = trackDbOperation('find', 'chats', 'chat-service');
    
    const chats = await cassandraService.getChatsByWorkspaceAndUser(workspaceId, userId);
    
    endDbTimer();
    dbSpan.end();
    
    // Populate users for each chat
    const populatedChats = await Promise.all(
      chats.map(chat => populateChatUsers(chat))
    );
    
    // Cache the results
    await redisService.cacheUserChats(userId, workspaceId, populatedChats);
    
    res.status(200).send(populatedChats);
  } catch (error) {
    recordSpanError(error);
    res.status(400);
    throw new Error(error.message);
  }
});

//@description     Create New Group Chat
//@route           POST /api/chat/group
//@access          Protected
const createGroupChat = asyncHandler(async (req, res) => {
  const { users: usersJSON, name, workspaceId } = req.body;  

  if (!usersJSON || !name || !workspaceId) {
    return res.status(400).send({ message: "Please fill all the fields" });
  }

  const users = JSON.parse(usersJSON);
  const currentUserId = req.user.id || req.user._id;

  if (users.length < 2) {
    return res
      .status(400)
      .send("More than 2 users are required to form a group chat");
  }

  const allUserIds = [...users.map(u => u._id || u.id || u), currentUserId];

  try {
    const dbSpan = createSpan('database.create_group_chat', req.span);
    const endDbTimer = trackDbOperation('create', 'chats', 'chat-service');
    
    const chatId = require('uuid').v4();
    const groupChat = await cassandraService.saveChat({
      chatId: chatId,
      chatName: name,
      users: allUserIds,
      isGroupChat: true,
      groupAdmin: currentUserId,
      workspaceId: workspaceId,
    });
    
    endDbTimer();
    dbSpan.end();

    const fullGroupChat = await populateChatUsers(groupChat);
    
    // Cache group chat
    await redisService.cacheChat(groupChat._id || groupChat.id, fullGroupChat);
    
    // Invalidate user chats cache for all users
    for (const userId of allUserIds) {
      await redisService.invalidateUserChatsCache(userId, workspaceId);
    }
    
    // Publish to Redis pub/sub
    await redisService.publishChatEvent('chat:updates', 'group-chat.created', {
      chatId: groupChat._id || groupChat.id,
      chat: fullGroupChat,
      requestId: req.id
    });
    
    // Publish to Kafka
    await kafkaService.publishGroupChatCreated({
      chatId: groupChat._id || groupChat.id,
      chat: fullGroupChat,
      requestId: req.id
    }, req.id);
    
    addSpanAttribute('chat.id', groupChat._id || groupChat.id);
    addSpanAttribute('chat.type', 'group');

    res.status(200).json(fullGroupChat);
  } catch (error) {
    recordSpanError(error);
    res.status(400).send(error.message);
  }
});

// @desc    Rename Group
// @route   PUT /api/chat/rename
// @access  Protected
const renameGroup = asyncHandler(async (req, res) => {
  const { chatId, chatName } = req.body;

  const chat = await cassandraService.getChatById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const predefinedGroupPattern = /^[0-9]+(\+[0-9]+)*$/;
  if (predefinedGroupPattern.test(chat.chatName || chat.chat_name)) {
    res.status(400);
    throw new Error("Cannot rename predefined groups created during workspace creation.");
  }

  const oldName = chat.chatName || chat.chat_name;
  
  const dbSpan = createSpan('database.update_chat', req.span);
  const endDbTimer = trackDbOperation('update', 'chats', 'chat-service');
  const updatedChat = await cassandraService.updateChat(chatId, {
    chatName: chatName
  });
  endDbTimer();
  dbSpan.end();

  const fullChat = await populateChatUsers(updatedChat);
  
  // Invalidate cache
  await redisService.invalidateChatCache(chatId);
  await redisService.cacheChat(chatId, fullChat);
  
  // Invalidate user chats cache for all users
  for (const userId of fullChat.users || []) {
    const userIdStr = userId._id || userId.id || userId;
    await redisService.invalidateUserChatsCache(userIdStr, fullChat.workspace || fullChat.workspace_id);
  }
  
  // Publish to Redis pub/sub
  await redisService.publishChatEvent('chat:updates', 'group.renamed', {
    chatId,
    oldName,
    newName: chatName,
    chat: fullChat,
    requestId: req.id
  });
  
  // Publish to Kafka
  await kafkaService.publishGroupRenamed(chatId, oldName, chatName, req.id);

  res.json(fullChat);
});

// @desc    Remove user from Group
// @route   PUT /api/chat/groupremove
// @access  Protected
const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;
  const currentUserId = req.user.id || req.user._id;

  const chat = await cassandraService.getChatById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const groupAdminId = chat.groupAdmin || chat.group_admin;
  if (groupAdminId !== currentUserId) {
    res.status(403);
    throw new Error("Only admins can remove users from the group");
  }

  const dbSpan = createSpan('database.remove_user_from_group', req.span);
  const endDbTimer = trackDbOperation('update', 'chats', 'chat-service');
  
  const users = (chat.users || []).filter(u => {
    const uId = u._id || u.id || u;
    return uId !== userId;
  });
  
  const removed = await cassandraService.updateChat(chatId, {
    users: users
  });
  
  endDbTimer();
  dbSpan.end();

  const fullChat = await populateChatUsers(removed);
  
  // Invalidate cache
  await redisService.invalidateChatCache(chatId);
  await redisService.cacheChat(chatId, fullChat);
  await redisService.invalidateUserChatsCache(userId, removed.workspace || removed.workspace_id);
  
  // Publish to Redis pub/sub
  await redisService.publishChatEvent('chat:updates', 'user.removed-from-group', {
    chatId,
    userId,
    removedBy: currentUserId,
    chat: fullChat,
    requestId: req.id
  });
  
  // Publish to Kafka
  await kafkaService.publishUserRemovedFromGroup(chatId, userId, currentUserId, req.id);
  
  res.json(fullChat);
});

// @desc    Add user to Group / Leave
// @route   PUT /api/chat/groupadd
// @access  Protected
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;
  const currentUserId = req.user.id || req.user._id;

  const dbSpan = createSpan('database.add_user_to_group', req.span);
  const endDbTimer = trackDbOperation('update', 'chats', 'chat-service');
  
  const chat = await cassandraService.getChatById(chatId);
  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const users = [...(chat.users || []), userId];
  const added = await cassandraService.updateChat(chatId, {
    users: users
  });
  
  endDbTimer();
  dbSpan.end();

  const fullChat = await populateChatUsers(added);
  
  // Invalidate cache
  await redisService.invalidateChatCache(chatId);
  await redisService.cacheChat(chatId, fullChat);
  await redisService.invalidateUserChatsCache(userId, added.workspace || added.workspace_id);
  
  // Publish to Redis pub/sub
  await redisService.publishChatEvent('chat:updates', 'user.added-to-group', {
    chatId,
    userId,
    addedBy: currentUserId,
    chat: fullChat,
    requestId: req.id
  });
  
  // Publish to Kafka
  await kafkaService.publishUserAddedToGroup(chatId, userId, currentUserId, req.id);
  
  res.json(fullChat);
});

const deleteAllChats = asyncHandler(async (req, res) => {
  try {
    // Note: Cassandra doesn't support DELETE ALL efficiently
    res.status(200).json({ message: 'Bulk delete not supported. Delete chats individually.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete chats', error: error.message });
  }
});

module.exports = {
  accessChat,
  fetchChats,
  createGroupChat,
  renameGroup,
  addToGroup,
  removeFromGroup,
  deleteAllChats
};
