const asyncHandler = require("express-async-handler");
const Chat = require("../models/chatModel");
const User = require("../models/userModel");
const Workspace = require("../models/workspaceModel");
const redisService = require("../services/redisService");
const kafkaService = require("../services/kafkaService");
const { createSpan, addSpanAttribute, recordSpanError } = require("../shared/middleware/tracing");
const { trackDbOperation } = require("../shared/middleware/metrics");

//@description     Create or fetch One to One Chat
//@route           POST /api/chat/
//@access          Protected
const accessChat = asyncHandler(async (req, res) => {
  const { userId, workspaceId } = req.body;

  if (!userId || !workspaceId) {
    console.log("UserId or WorkspaceId param not sent with request");
    return res.sendStatus(400);
  }

  // Try to get from cache first
  const cacheKey = `chat:${req.user._id}:${userId}:${workspaceId}`;
  let cachedChat = await redisService.getCachedChat(cacheKey);
  
  if (cachedChat) {
    console.log('📦 Returning cached chat');
    return res.send(cachedChat);
  }
  
  const dbSpan = createSpan('database.find_chat', req.span);
  const endDbTimer = trackDbOperation('find', 'chats', 'chat-service');
  
  var isChat = await Chat.find({
    isGroupChat: false,
    workspace: workspaceId,
    $and: [
      { users: { $elemMatch: { $eq: req.user._id } } },
      { users: { $elemMatch: { $eq: userId } } },
    ],
  })
    .populate("users", "-password")
    .populate("latestMessage");
  
  endDbTimer();
  dbSpan.end();

  isChat = await User.populate(isChat, {
    path: "latestMessage.sender",
    select: "name pic email",
  });

  if (isChat.length > 0) {
    // Cache the chat
    await redisService.cacheChat(isChat[0]._id.toString(), isChat[0]);
    res.send(isChat[0]);
  } else {
    var chatData = {
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
      workspace: workspaceId,
    };

    try {
      const dbSpan = createSpan('database.create_chat', req.span);
      const endDbTimer = trackDbOperation('create', 'chats', 'chat-service');
      
      const createdChat = await Chat.create(chatData);
      endDbTimer();
      dbSpan.end();
      
      const populateSpan = createSpan('database.populate_chat', req.span);
      const FullChat = await Chat.findOne({ _id: createdChat._id })
        .populate("users", "-password")
        .populate("workspace");
      populateSpan.end();
      
      // Cache chat in Redis
      await redisService.cacheChat(createdChat._id.toString(), FullChat);
      
      // Invalidate user chats cache for both users
      await redisService.invalidateUserChatsCache(req.user._id.toString(), workspaceId);
      await redisService.invalidateUserChatsCache(userId, workspaceId);
      
      // Publish to Redis pub/sub for real-time updates
      await redisService.publishChatEvent('chat:updates', 'chat.created', {
        chatId: createdChat._id.toString(),
        chat: FullChat,
        requestId: req.id
      });
      
      // Publish to Kafka for async processing
      await kafkaService.publishChatCreated({
        chatId: createdChat._id.toString(),
        chat: FullChat,
        requestId: req.id
      }, req.id);
      
      addSpanAttribute('chat.id', createdChat._id.toString());
      
      res.status(200).json(FullChat);
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

  try {
    // Try to get from cache first
    const cacheKey = `user:${req.user._id}:workspace:${workspaceId}:chats`;
    const cachedChats = await redisService.getCachedUserChats(req.user._id.toString(), workspaceId);
    
    if (cachedChats) {
      console.log('📦 Returning cached chats');
      return res.status(200).send(cachedChats);
    }
    
    // If not in cache, fetch from database
    const dbSpan = createSpan('database.fetch_chats', req.span);
    const endDbTimer = trackDbOperation('find', 'chats', 'chat-service');
    
    Chat.find({ 
        users: { $elemMatch: { $eq: req.user._id } },
        workspace: workspaceId
      })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        endDbTimer();
        dbSpan.end();
        
        results = await User.populate(results, {
          path: "latestMessage.sender",
          select: "name pic email",
        });
        
        // Cache the results
        await redisService.cacheUserChats(req.user._id.toString(), workspaceId, results);
        
        res.status(200).send(results);
      });
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

  if (users.length < 2) {
    return res
      .status(400)
      .send("More than 2 users are required to form a group chat");
  }

  users.push(req.user);

  try {
    const dbSpan = createSpan('database.create_group_chat', req.span);
    const endDbTimer = trackDbOperation('create', 'chats', 'chat-service');
    
    const groupChat = await Chat.create({
      chatName: name,
      users: users,
      isGroupChat: true,
      groupAdmin: req.user,
      workspace: workspaceId,
    });
    endDbTimer();
    dbSpan.end();

    const populateSpan = createSpan('database.populate_group_chat', req.span);
    const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
      .populate("users", "-password")
      .populate("groupAdmin", "-password");
    populateSpan.end();

    // Update workspace with the new group chat
    const updateSpan = createSpan('database.update_workspace', req.span);
    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: { groups: groupChat._id }
    });
    updateSpan.end();
    
    // Cache group chat
    await redisService.cacheChat(groupChat._id.toString(), fullGroupChat);
    
    // Invalidate user chats cache for all users
    for (const user of users) {
      await redisService.invalidateUserChatsCache(user._id.toString(), workspaceId);
    }
    
    // Publish to Redis pub/sub
    await redisService.publishChatEvent('chat:updates', 'group-chat.created', {
      chatId: groupChat._id.toString(),
      chat: fullGroupChat,
      requestId: req.id
    });
    
    // Publish to Kafka
    await kafkaService.publishGroupChatCreated({
      chatId: groupChat._id.toString(),
      chat: fullGroupChat,
      requestId: req.id
    }, req.id);
    
    addSpanAttribute('chat.id', groupChat._id.toString());
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

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  const predefinedGroupPattern = /^[0-9]+(\+[0-9]+)*$/;
  if (predefinedGroupPattern.test(chat.chatName)) {
    res.status(400);
    throw new Error("Cannot rename predefined groups created during workspace creation.");
  }

  const oldName = chat.chatName;
  chat.chatName = chatName;
  
  const dbSpan = createSpan('database.update_chat', req.span);
  const endDbTimer = trackDbOperation('update', 'chats', 'chat-service');
  const updatedChat = await chat.save();
  endDbTimer();
  dbSpan.end();

  await updatedChat.populate("users", "-password").populate("groupAdmin", "-password").execPopulate();
  
  // Invalidate cache
  await redisService.invalidateChatCache(chatId);
  await redisService.cacheChat(chatId, updatedChat);
  
  // Invalidate user chats cache for all users
  for (const user of updatedChat.users) {
    await redisService.invalidateUserChatsCache(user._id.toString(), updatedChat.workspace.toString());
  }
  
  // Publish to Redis pub/sub
  await redisService.publishChatEvent('chat:updates', 'group.renamed', {
    chatId,
    oldName,
    newName: chatName,
    chat: updatedChat,
    requestId: req.id
  });
  
  // Publish to Kafka
  await kafkaService.publishGroupRenamed(chatId, oldName, chatName, req.id);

  res.json(updatedChat);
});

// @desc    Remove user from Group
// @route   PUT /api/chat/groupremove
// @access  Protected
const removeFromGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const chat = await Chat.findById(chatId);

  if (!chat) {
    res.status(404);
    throw new Error("Chat Not Found");
  }

  if (chat.groupAdmin.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only admins can remove users from the group");
  }

  const dbSpan = createSpan('database.remove_user_from_group', req.span);
  const endDbTimer = trackDbOperation('update', 'chats', 'chat-service');
  
  const removed = await Chat.findByIdAndUpdate(
    chatId,
    {
      $pull: { users: userId },
    },
    {
      new: true,
    }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");
  
  endDbTimer();
  dbSpan.end();

  if (!removed) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    // Invalidate cache
    await redisService.invalidateChatCache(chatId);
    await redisService.cacheChat(chatId, removed);
    await redisService.invalidateUserChatsCache(userId, removed.workspace.toString());
    
    // Publish to Redis pub/sub
    await redisService.publishChatEvent('chat:updates', 'user.removed-from-group', {
      chatId,
      userId,
      removedBy: req.user._id.toString(),
      chat: removed,
      requestId: req.id
    });
    
    // Publish to Kafka
    await kafkaService.publishUserRemovedFromGroup(chatId, userId, req.user._id.toString(), req.id);
    
    res.json(removed);
  }
});

// @desc    Add user to Group / Leave
// @route   PUT /api/chat/groupadd
// @access  Protected
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

  const dbSpan = createSpan('database.add_user_to_group', req.span);
  const endDbTimer = trackDbOperation('update', 'chats', 'chat-service');
  
  const added = await Chat.findByIdAndUpdate(
    chatId,
    {
      $push: { users: userId },
    },
    {
      new: true,
    }
  )
    .populate("users", "-password")
    .populate("groupAdmin", "-password");
  
  endDbTimer();
  dbSpan.end();

  if (!added) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    // Invalidate cache
    await redisService.invalidateChatCache(chatId);
    await redisService.cacheChat(chatId, added);
    await redisService.invalidateUserChatsCache(userId, added.workspace.toString());
    
    // Publish to Redis pub/sub
    await redisService.publishChatEvent('chat:updates', 'user.added-to-group', {
      chatId,
      userId,
      addedBy: req.user._id.toString(),
      chat: added,
      requestId: req.id
    });
    
    // Publish to Kafka
    await kafkaService.publishUserAddedToGroup(chatId, userId, req.user._id.toString(), req.id);
    
    res.json(added);
  }
});

const deleteAllChats = asyncHandler(async (req, res) => {
  try {
    await Chat.deleteMany({});
    res.status(200).json({ message: 'All chats have been deleted successfully.' });
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

