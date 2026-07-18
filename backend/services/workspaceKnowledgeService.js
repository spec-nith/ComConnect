const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const Task = require("../models/taskModel");

const buildWorkspaceDocument = (workspace) => ({
  id: `workspace-${workspace._id}`,
  content: `Workspace: ${workspace.workspaceName}\nRoles: ${workspace.roles
    .map((role) => role.roleName)
    .join(", ")}`,
  metadata: {
    type: "workspace",
    label: workspace.workspaceName,
    source_id: workspace._id.toString(),
    created_at: (workspace.updatedAt || workspace.createdAt || new Date()).toISOString(),
    tags: [],
  },
});

const buildMessageDocument = (message) => ({
  id: `message-${message._id}`,
  content: `${message.sender?.name || "Unknown"} in ${
    message.chat?.chatName || "chat"
  } at ${message.createdAt.toISOString()}: ${message.content}`,
  metadata: {
    type: "message",
    label: message.chat?.chatName || "Chat message",
    source_id: message._id.toString(),
    chat_id: (message.chat?._id || message.chat).toString(),
    created_at: message.createdAt.toISOString(),
    tags: message.tags || [],
  },
});

const buildTaskDocument = (task) => ({
  id: `task-${task._id}`,
  content: [
    `Task: ${task.heading}`,
    `Description: ${task.description}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Tags: ${(task.tags || []).join(", ") || "None"}`,
    `Assignee: ${task.assignee?.name || "Unknown"} <${task.assignee?.email || ""}>`,
    `Comments: ${(task.comments || [])
      .map((comment) => `${comment.user?.name || "Unknown"}: ${comment.comment}`)
      .join(" | ") || "None"}`,
  ].join("\n"),
  metadata: {
    type: "task",
    label: task.heading,
    source_id: task._id.toString(),
    created_at: task.updatedAt.toISOString(),
    tags: task.tags || [],
  },
});

const buildAgentTaskState = (task) => ({
  id: task._id.toString(),
  heading: task.heading,
  description: task.description,
  status: task.status,
  priority: task.priority,
  tags: task.tags || [],
  assignee_name: task.assignee?.name || "Unknown",
  assignee_email: task.assignee?.email || "",
  updated_at: task.updatedAt?.toISOString(),
});

const loadAgentTaskState = async (workspaceId) => {
  const [openTasks, completedTasks] = await Promise.all([
    Task.find({ workspace: workspaceId, status: { $ne: "done" } })
      .sort({ updatedAt: -1 })
      .limit(1000)
      .populate("assignee", "name email")
      .lean(),
    Task.find({ workspace: workspaceId, status: "done" })
      .sort({ updatedAt: -1 })
      .limit(200)
      .populate("assignee", "name email")
      .lean(),
  ]);
  return [...openTasks, ...completedTasks].map(buildAgentTaskState);
};

async function* iterateWorkspaceDocumentBatches(workspace, batchSize = 200) {
  const chats = await Chat.find({ workspace: workspace._id }).select("_id chatName");
  const chatNames = new Map(chats.map((chat) => [chat._id.toString(), chat.chatName]));
  const chatIds = chats.map((chat) => chat._id);

  yield [buildWorkspaceDocument(workspace)];

  let lastMessageId = null;
  while (true) {
    const messages = await Message.find({
      chat: { $in: chatIds },
      ...(lastMessageId ? { _id: { $gt: lastMessageId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(batchSize)
      .populate("sender", "name")
      .lean();
    if (!messages.length) break;
    yield messages.map((message) =>
      buildMessageDocument({
        ...message,
        chat: {
          _id: message.chat,
          chatName: chatNames.get(message.chat.toString()) || "chat",
        },
      })
    );
    lastMessageId = messages[messages.length - 1]._id;
  }

  let lastTaskId = null;
  while (true) {
    const tasks = await Task.find({
      workspace: workspace._id,
      ...(lastTaskId ? { _id: { $gt: lastTaskId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(batchSize)
      .populate("assignee createdBy comments.user", "name email")
      .lean();
    if (!tasks.length) break;
    yield tasks.map(buildTaskDocument);
    lastTaskId = tasks[tasks.length - 1]._id;
  }
}

module.exports = {
  buildAgentTaskState,
  buildMessageDocument,
  buildTaskDocument,
  buildWorkspaceDocument,
  iterateWorkspaceDocumentBatches,
  loadAgentTaskState,
};
