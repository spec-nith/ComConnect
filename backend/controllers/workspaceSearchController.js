const asyncHandler = require("express-async-handler");

const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const Task = require("../models/taskModel");
const { searchWorkspace } = require("../services/aiServiceClient");
const { getWorkspaceForMember } = require("../services/workspaceAccessService");
const { normalizeTags } = require("../services/tagService");
const { syncWorkspace } = require("./aiControllers");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const timestamp = (item) => new Date(item.updatedAt || item.createdAt || 0).getTime();

const searchWorkspaceHistory = asyncHandler(async (req, res) => {
  const workspace = await getWorkspaceForMember(req.params.id, req.user._id);
  const query = String(req.query.q || "").trim().slice(0, 200);
  const tags = normalizeTags(String(req.query.tags || "").split(","));
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const chats = await Chat.find({ workspace: workspace._id }).select("_id chatName").lean();
  const chatIds = chats.map((chat) => chat._id);
  const chatNames = new Map(chats.map((chat) => [chat._id.toString(), chat.chatName]));
  const textRegex = query ? new RegExp(escapeRegex(query), "i") : null;
  const tagRegexes = tags.map((tag) => new RegExp(`#${escapeRegex(tag)}\\b`, "i"));

  const messageConditions = [{ chat: { $in: chatIds } }];
  const taskConditions = [{ workspace: workspace._id }];
  if (textRegex) {
    messageConditions.push({ content: textRegex });
    taskConditions.push({ $or: [{ heading: textRegex }, { description: textRegex }] });
  }
  if (tags.length) {
    messageConditions.push({
      $or: [{ tags: { $all: tags } }, ...tagRegexes.map((regex) => ({ content: regex }))],
    });
    taskConditions.push({
      $or: [
        { tags: { $all: tags } },
        ...tagRegexes.flatMap((regex) => [{ heading: regex }, { description: regex }]),
      ],
    });
  }

  const [messages, tasks, workspaceMessageCount, matchedMessageCount, matchedTaskCount] = await Promise.all([
    Message.find({ $and: messageConditions })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "name email")
      .lean(),
    Task.find({ $and: taskConditions })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .populate("assignee", "name email")
      .lean(),
    Message.countDocuments({ chat: { $in: chatIds } }),
    Message.countDocuments({ $and: messageConditions }),
    Task.countDocuments({ $and: taskConditions }),
  ]);

  const directResults = [
    ...messages.map((message) => ({
      type: "message",
      sourceId: message._id.toString(),
      chatId: message.chat.toString(),
      label: chatNames.get(message.chat.toString()) || "Conversation",
      title: `${message.sender?.name || "Member"} in ${
        chatNames.get(message.chat.toString()) || "conversation"
      }`,
      excerpt: message.content,
      tags: message.tags || [],
      createdAt: message.createdAt,
    })),
    ...tasks.map((task) => ({
      type: "task",
      sourceId: task._id.toString(),
      label: task.heading,
      title: task.heading,
      excerpt: task.description,
      tags: task.tags || [],
      createdAt: task.updatedAt,
    })),
  ].sort((a, b) => timestamp(b) - timestamp(a));

  const ragThreshold = Number(process.env.WORKSPACE_RAG_MESSAGE_THRESHOLD || 200);
  let strategy = "database";
  let ragResults = [];
  if (query || tags.length) {
    try {
      await syncWorkspace(workspace);
      const rag = await searchWorkspace(workspace._id.toString(), query, tags, limit);
      ragResults = rag.results || [];
      strategy = "hybrid-rag";
    } catch (error) {
      console.error("Workspace vector search fallback:", error.message);
      strategy = "database-fallback";
    }
  }

  const merged = new Map();
  const rrfK = Number(process.env.WORKSPACE_SEARCH_RRF_K || 60);
  for (const resultList of [directResults, ragResults]) {
    resultList.forEach((item, index) => {
      const key = `${item.type}:${item.sourceId}`;
      const existing = merged.get(key) || { item, rrfScore: 0 };
      existing.item = { ...existing.item, ...item };
      existing.rrfScore += 1 / (rrfK + index + 1);
      merged.set(key, existing);
    });
  }
  const maxScore = Math.max(
    ...[...merged.values()].map(({ rrfScore }) => rrfScore),
    Number.EPSILON
  );

  res.json({
    strategy,
    messageCount: workspaceMessageCount,
    workspaceMessageCount,
    matchedMessageCount,
    matchedTaskCount,
    resultCount: Math.min(merged.size, limit),
    ragThreshold,
    results: [...merged.values()]
      .map(({ item, rrfScore }) => ({ ...item, score: rrfScore / maxScore }))
      .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || timestamp(b) - timestamp(a))
      .slice(0, limit),
  });
});

module.exports = { searchWorkspaceHistory };
