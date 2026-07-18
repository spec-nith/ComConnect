const asyncHandler = require("express-async-handler");

const Task = require("../models/taskModel");
const User = require("../models/userModel");
const { getWorkspaceForMember } = require("../services/workspaceAccessService");
const { queueKnowledgeUpsert } = require("../services/knowledgeIndexService");
const { extractTags, normalizeTags } = require("../services/tagService");
const { buildTaskDocument } = require("../services/workspaceKnowledgeService");
const { recordAnalyticsEvent } = require("../services/opensearchAnalyticsService");

const indexTask = async (taskId) => {
  const task = await Task.findById(taskId)
    .populate("assignee createdBy", "name email")
    .populate("comments.user", "name email")
    .lean();
  if (task) {
    queueKnowledgeUpsert(task.workspace, [buildTaskDocument(task)]).catch((error) => {
      console.error("Unable to queue task indexing:", error.message);
    });
  }
};

const allocateTask = asyncHandler(async (req, res) => {
  const { heading, description, email, workspaceId, attachments, tags } = req.body;
  if (!heading?.trim() || !description?.trim() || !email?.trim() || !workspaceId) {
    res.status(400);
    throw new Error("heading, description, email, and workspaceId are required");
  }

  const workspace = await getWorkspaceForMember(workspaceId, req.user._id);
  const assignee = await User.findOne({ email: email.trim() });
  if (!assignee) {
    res.status(404);
    throw new Error("Assignee not found");
  }
  if (!workspace.users.some((user) => user._id.equals(assignee._id))) {
    res.status(400);
    throw new Error("Assignee is not part of the workspace");
  }

  const task = await Task.create({
    heading: heading.trim(),
    description: description.trim(),
    assignee: assignee._id,
    workspace: workspace._id,
    attachments,
    tags: normalizeTags([
      ...(Array.isArray(tags) ? tags : []),
      ...extractTags(`${heading} ${description}`),
    ]),
    createdBy: req.user._id,
  });
  await task.populate("assignee createdBy", "name email pic");
  await indexTask(task._id);
  recordAnalyticsEvent("task.created", {
    request_id: req.requestId,
    actor_user_id: req.user._id.toString(),
    workspace_id: workspace._id.toString(),
    task_id: task._id.toString(),
    assignee_user_id: assignee._id.toString(),
    status: task.status,
    priority: task.priority,
    tags: task.tags || [],
  });
  res.status(201).json(task);
});

const getMyTasks = asyncHandler(async (req, res) => {
  const query = { assignee: req.user._id };
  if (req.query.workspaceId) {
    await getWorkspaceForMember(req.query.workspaceId, req.user._id);
    query.workspace = req.query.workspaceId;
  }
  res.json(
    await Task.find(query)
      .populate("assignee createdBy", "name email pic")
      .populate("comments.user", "name email pic")
      .sort({ createdAt: -1 })
  );
});

const getAllocatedTasks = asyncHandler(async (req, res) => {
  const query = { createdBy: req.user._id };
  if (req.query.workspaceId) {
    await getWorkspaceForMember(req.query.workspaceId, req.user._id);
    query.workspace = req.query.workspaceId;
  }
  res.json(
    await Task.find(query)
      .populate("assignee createdBy", "name email pic")
      .populate("comments.user", "name email pic")
      .sort({ createdAt: -1 })
  );
});

const getWorkspaceTasks = asyncHandler(async (req, res) => {
  await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  res.json(
    await Task.find({ workspace: req.params.workspaceId })
      .populate("assignee createdBy", "name email pic")
      .populate("comments.user", "name email pic")
      .sort({ updatedAt: -1 })
  );
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  if (!["to-do", "in-progress", "done"].includes(req.body.status)) {
    res.status(400);
    throw new Error("Invalid task status");
  }
  const task = await Task.findById(req.body.taskId);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }
  if (
    task.assignee.toString() !== req.user._id.toString() &&
    task.createdBy.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error("You do not have permission to update this task");
  }

  task.status = req.body.status;
  await task.save();
  await indexTask(task._id);
  recordAnalyticsEvent("task.status_changed", {
    request_id: req.requestId,
    actor_user_id: req.user._id.toString(),
    workspace_id: task.workspace?.toString(),
    task_id: task._id.toString(),
    status: task.status,
  });
  res.json(task);
});

const addComment = asyncHandler(async (req, res) => {
  if (!req.body.comment?.trim()) {
    res.status(400);
    throw new Error("Comment is required");
  }
  const task = await Task.findById(req.body.taskId);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  if (
    task.assignee.toString() !== req.user._id.toString() &&
    task.createdBy.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error("You do not have permission to comment on this task");
  }

  task.comments.push({ user: req.user._id, comment: req.body.comment.trim() });
  await task.save();
  await indexTask(task._id);
  recordAnalyticsEvent("task.commented", {
    request_id: req.requestId,
    actor_user_id: req.user._id.toString(),
    workspace_id: task.workspace?.toString(),
    task_id: task._id.toString(),
    comment_length: req.body.comment.trim().length,
  });
  res.json(task);
});

module.exports = {
  addComment,
  allocateTask,
  getAllocatedTasks,
  getMyTasks,
  getWorkspaceTasks,
  updateTaskStatus,
};
