const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const AgentExecution = require("../models/agentExecutionModel");
const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const Task = require("../models/taskModel");
const WorkspaceKnowledgeState = require("../models/workspaceKnowledgeStateModel");
const {
  askWorkspace,
  coordinateEvent,
  planTasks,
  resetWorkspaceDocuments,
  summarizeChat,
  upsertWorkspaceDocuments,
} = require("../services/aiServiceClient");
const { getWorkspaceForMember } = require("../services/workspaceAccessService");
const { queueKnowledgeUpsert } = require("../services/knowledgeIndexService");
const {
  buildTaskDocument,
  iterateWorkspaceDocumentBatches,
  loadAgentTaskState,
} = require("../services/workspaceKnowledgeService");

const syncWorkspace = async (workspace, force = false) => {
  const workspaceId = workspace._id.toString();
  const existing = await WorkspaceKnowledgeState.findOne({
    workspace: workspace._id,
  }).lean();
  if (!force && existing?.status === "ready") {
    return {
      indexed: existing.documentCount,
      unchanged: true,
      indexedAt: existing.indexedAt,
    };
  }

  const now = new Date();
  const leaseUntil = new Date(
    now.getTime() + Number(process.env.KNOWLEDGE_BACKFILL_LEASE_MS || 600000)
  );
  try {
    await WorkspaceKnowledgeState.findOneAndUpdate(
      force
        ? { workspace: workspace._id }
        : {
            workspace: workspace._id,
            $or: [
              { status: { $ne: "indexing" } },
              { leaseUntil: { $lt: now } },
            ],
          },
      {
        $set: {
          status: "indexing",
          leaseUntil,
          lastError: null,
          indexVersion: "incremental-v2",
        },
        $setOnInsert: {
          documentCount: 0,
          backend: process.env.VECTOR_STORE_BACKEND || "configured-in-ai-service",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code === 11000) {
      const conflict = new Error("Workspace knowledge backfill is already in progress");
      conflict.statusCode = 503;
      throw conflict;
    }
    throw error;
  }

  try {
    await resetWorkspaceDocuments(workspaceId);
    const batchSize = Math.min(
      Math.max(Number(process.env.KNOWLEDGE_BACKFILL_BATCH_SIZE) || 200, 25),
      500
    );
    let documentCount = 0;
    for await (const documents of iterateWorkspaceDocumentBatches(
      workspace,
      batchSize
    )) {
      await upsertWorkspaceDocuments(workspaceId, documents);
      documentCount += documents.length;
    }
    await WorkspaceKnowledgeState.findOneAndUpdate(
      { workspace: workspace._id },
      {
        status: "ready",
        leaseUntil: null,
        lastError: null,
        indexVersion: "incremental-v2",
        documentCount,
        indexedAt: new Date(),
        backend: process.env.VECTOR_STORE_BACKEND || "configured-in-ai-service",
      }
    );
    return { indexed: documentCount, backfilled: true };
  } catch (error) {
    await WorkspaceKnowledgeState.findOneAndUpdate(
      { workspace: workspace._id },
      {
        status: "failed",
        leaseUntil: null,
        lastError: error.message.slice(0, 1000),
      }
    );
    throw error;
  }
};

const normalizeAgentTasks = (tasks, fallbackEmail) =>
  (tasks || []).map((task) => ({
    heading: task.heading.trim(),
    description: task.description.trim(),
    assigneeEmail:
      task.assignee_email || task.assigneeEmail || fallbackEmail,
    priority: task.priority || "medium",
  }));

const createApprovalToken = ({ workspaceId, userId, tasks, source }) =>
  jwt.sign(
    {
      purpose: "apply-ai-task-plan",
      workspaceId,
      userId,
      source,
      executionId: crypto.randomUUID(),
      tasks,
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );

const syncWorkspaceKnowledge = asyncHandler(async (req, res) => {
  const workspace = await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  const result = await syncWorkspace(workspace, true);
  res.json(result);
});

const askWorkspaceAssistant = asyncHandler(async (req, res) => {
  const question = req.body.question?.trim();
  if (!question) {
    res.status(400);
    throw new Error("question is required");
  }

  const workspace = await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  await syncWorkspace(workspace);
  const result = await askWorkspace(workspace._id.toString(), question);
  res.json(result);
});

const summarizeGroupChat = asyncHandler(async (req, res) => {
  const chat = await Chat.findById(req.params.chatId)
    .populate("users", "name email")
    .lean();

  if (!chat) {
    res.status(404);
    throw new Error("Chat not found");
  }
  if (!chat.users.some((chatUser) => chatUser._id.toString() === req.user._id.toString())) {
    res.status(403);
    throw new Error("You do not have access to this chat");
  }
  if (!chat.isGroupChat) {
    res.status(400);
    throw new Error("Chat summarizer is available for group chats");
  }

  const messages = await Message.find({ chat: chat._id })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("sender", "name email")
    .lean();

  if (!messages.length) {
    res.status(400);
    throw new Error("No chat messages available to summarize");
  }

  const result = await summarizeChat(
    chat.chatName,
    [...messages].reverse().map((message) => ({
      sender: message.sender?.name || "Unknown",
      content: message.content,
      created_at: message.createdAt?.toISOString(),
    }))
  );
  res.json(result);
});

const coordinateWorkspaceEvent = asyncHandler(async (req, res) => {
  const question =
    req.body.question?.trim() || "Are we ready for the event? What is blocked?";

  const workspace = await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  await syncWorkspace(workspace);
  const tasks = await loadAgentTaskState(workspace._id);
  const result = await coordinateEvent(
    workspace._id.toString(),
    question,
    workspace.users.map(({ name, email }) => ({ name, email })),
    tasks
  );
  const proposedTasks = normalizeAgentTasks(
    result.report.proposed_tasks,
    req.user.email
  );
  res.json({
    ...result,
    report: { ...result.report, proposed_tasks: proposedTasks },
    approvalToken: proposedTasks.length
      ? createApprovalToken({
          workspaceId: workspace._id.toString(),
          userId: req.user._id.toString(),
          tasks: proposedTasks,
          source: "event-coordinator-agent",
        })
      : null,
  });
});

const createWorkspaceTaskPlan = asyncHandler(async (req, res) => {
  const request = req.body.request?.trim();
  if (!request) {
    res.status(400);
    throw new Error("request is required");
  }

  const workspace = await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  await syncWorkspace(workspace);
  const currentTasks = await loadAgentTaskState(workspace._id);
  const result = await planTasks(
    workspace._id.toString(),
    request,
    workspace.users.map(({ name, email }) => ({ name, email })),
    currentTasks
  );

  const tasks = normalizeAgentTasks(result.plan.tasks, req.user.email);
  const approvalToken = createApprovalToken({
    workspaceId: workspace._id.toString(),
    userId: req.user._id.toString(),
    tasks,
    source: "task-planning-agent",
  });

  res.json({
    plan: { ...result.plan, tasks },
    agent: result.agent,
    approvalToken,
  });
});

const applyWorkspaceTaskPlan = asyncHandler(async (req, res) => {
  let approvedPlan;
  try {
    approvedPlan = jwt.verify(req.body.approvalToken, process.env.JWT_SECRET);
  } catch {
    res.status(400);
    throw new Error("Task plan approval is invalid or expired");
  }

  if (
    approvedPlan.purpose !== "apply-ai-task-plan" ||
    !approvedPlan.executionId ||
    approvedPlan.workspaceId !== req.params.workspaceId ||
    approvedPlan.userId !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error("Task plan approval does not match this request");
  }

  if (
    !Array.isArray(approvedPlan.tasks) ||
    approvedPlan.tasks.length < 1 ||
    approvedPlan.tasks.length > 20
  ) {
    res.status(400);
    throw new Error("Task plan must contain between 1 and 20 tasks");
  }

  const workspace = await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  const usersByEmail = new Map(workspace.users.map((user) => [user.email, user]));
  const invalidAssignees = approvedPlan.tasks
    .filter((task) => !usersByEmail.has(task.assigneeEmail))
    .map((task) => task.assigneeEmail);

  if (invalidAssignees.length) {
    res.status(400);
    throw new Error(`Invalid workspace assignees: ${invalidAssignees.join(", ")}`);
  }

  let execution;
  try {
    execution = await AgentExecution.create({
      executionId: approvedPlan.executionId,
      workspace: workspace._id,
      user: req.user._id,
      source: approvedPlan.source || "unknown-agent",
      taskCount: approvedPlan.tasks.length,
    });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409);
      throw new Error("This agent approval was already executed");
    }
    throw error;
  }

  let tasks;
  try {
    tasks = await Task.insertMany(
      approvedPlan.tasks.map((task) => ({
        heading: task.heading,
        description: task.description,
        assignee: usersByEmail.get(task.assigneeEmail)._id,
        workspace: workspace._id,
        priority: task.priority,
        createdBy: req.user._id,
      }))
    );
    execution.status = "completed";
    await execution.save();
  } catch (error) {
    await AgentExecution.deleteOne({ _id: execution._id });
    throw error;
  }
  const indexedTasks = await Task.find({ _id: { $in: tasks.map((task) => task._id) } })
    .populate("assignee createdBy", "name email")
    .populate("comments.user", "name email")
    .lean();
  queueKnowledgeUpsert(
    workspace._id,
    indexedTasks.map(buildTaskDocument)
  ).catch((error) => {
    console.error("Unable to queue approved task indexing:", error.message);
  });
  res.status(201).json({ created: tasks.length, tasks });
});

module.exports = {
  applyWorkspaceTaskPlan,
  askWorkspaceAssistant,
  coordinateWorkspaceEvent,
  createWorkspaceTaskPlan,
  summarizeGroupChat,
  syncWorkspaceKnowledge,
  syncWorkspace,
};
