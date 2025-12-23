const asyncHandler = require("express-async-handler");
const Chat = require("../models/chatModel");
const User = require("../models/userModel");
const Workspace = require("../models/workspaceModel");

//@description     Create or fetch One to One Chat
//@route           POST /api/chat/
//@access          Protected
const accessChat = asyncHandler(async (req, res) => {
  const { userId, workspaceId } = req.body;

  if (!userId || !workspaceId) {
    console.log("UserId or WorkspaceId param not sent with request");
    return res.sendStatus(400);
  }

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

  isChat = await User.populate(isChat, {
    path: "latestMessage.sender",
    select: "name pic email",
  });

  if (isChat.length > 0) {
    res.send(isChat[0]);
  } else {
    var chatData = {
      chatName: "sender",
      isGroupChat: false,
      users: [req.user._id, userId],
      workspace: workspaceId,
    };

    try {
      const createdChat = await Chat.create(chatData);
      const FullChat = await Chat.findOne({ _id: createdChat._id })
        .populate("users", "-password")
        .populate("workspace");

      res.status(200).json(FullChat);
    } catch (error) {
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
    Chat.find({ 
        users: { $elemMatch: { $eq: req.user._id } },
        workspace: workspaceId
      })
      .populate("users", "-password")
      .populate("groupAdmin", "-password")
      .populate("latestMessage")
      .sort({ updatedAt: -1 })
      .then(async (results) => {
        results = await User.populate(results, {
          path: "latestMessage.sender",
          select: "name pic email",
        });
        res.status(200).send(results);
      });
  } catch (error) {
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
    const groupChat = await Chat.create({
      chatName: name,
      users: users,
      isGroupChat: true,
      groupAdmin: req.user,
      workspace: workspaceId,
    });

    const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
      .populate("users", "-password")
      .populate("groupAdmin", "-password");

    // Update workspace with the new group chat
    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: { groups: groupChat._id }
    });

    res.status(200).json(fullGroupChat);
  } catch (error) {
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

  chat.chatName = chatName;
  const updatedChat = await chat.save();

  await updatedChat.populate("users", "-password").populate("groupAdmin", "-password").execPopulate();

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

  if (!removed) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
    res.json(removed);
  }
});

// @desc    Add user to Group / Leave
// @route   PUT /api/chat/groupadd
// @access  Protected
const addToGroup = asyncHandler(async (req, res) => {
  const { chatId, userId } = req.body;

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

  if (!added) {
    res.status(404);
    throw new Error("Chat Not Found");
  } else {
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

