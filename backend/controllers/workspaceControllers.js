const asyncHandler = require("express-async-handler");
const Workspace = require("../models/workspaceModel");
const User = require("../models/userModel");
const Chat = require("../models/chatModel");
const { queueKnowledgeUpsert } = require("../services/knowledgeIndexService");
const { buildWorkspaceDocument } = require("../services/workspaceKnowledgeService");
const { recordAnalyticsEvent } = require("../services/opensearchAnalyticsService");

//@description     Create a new workspace
//@route           POST /api/workspace
//@access          Protected

// Controller function to create a workspace and associated groups
const createWorkspace = asyncHandler(async (req, res) => {
  const { name, roles } = req.body;
  const user = req.user;

  const normalizedRoles = [...new Set(
    (Array.isArray(roles) ? roles : [])
      .map((role) => role?.trim())
      .filter(Boolean)
  )];

  if (!name?.trim() || normalizedRoles.length === 0) {
    res.status(400);
    throw new Error("Please provide a workspace name and at least one role.");
  }

  const workspace = await Workspace.create({
    workspaceName: name.trim(),
    createdBy: user._id,
    roles: normalizedRoles.map((roleName) => ({ roleName, users: [] })),
    users: [user._id],
  });

  // Each role owns exactly one predefined channel. Role combinations are not
  // materialized because they grow exponentially and are difficult to govern.
  const groups = normalizedRoles.map((roleName) => ({
    chatName: roleName,
    isGroupChat: true,
    users: [user._id],
    groupAdmin: user._id,
    workspace: workspace._id,
  }));

  const createdGroups = await Chat.insertMany(groups);
  workspace.groups = createdGroups.map((group) => group._id);
  await workspace.save();
  queueKnowledgeUpsert(workspace._id, [buildWorkspaceDocument(workspace)]).catch(
    (error) => console.error("Unable to queue workspace indexing:", error.message)
  );

  const userDoc = await User.findById(user._id);
  if (!userDoc.workspaces.includes(workspace._id)) {
    userDoc.workspaces.push(workspace._id);
    await userDoc.save();
  }
  recordAnalyticsEvent("workspace.created", {
    request_id: req.requestId,
    actor_user_id: user._id.toString(),
    workspace_id: workspace._id.toString(),
    role_count: normalizedRoles.length,
    group_count: createdGroups.length,
  });

  res.status(201).json({
    workspace,
    groups: createdGroups,
  });
});
  


//@description     Add role to workspace
//@route           POST /api/workspace/:id/role
//@access          Protected
// Controller function to add a role to an existing workspace
const addRole = asyncHandler(async (req, res) => {
  const roleName = req.body.roleName?.trim();
  const workspace = await Workspace.findById(req.params.id);

  if (!workspace) {
    res.status(404);
    throw new Error("Workspace not found");
  }
  if (workspace.createdBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Only the workspace owner can add roles");
  }
  if (!roleName) {
    res.status(400);
    throw new Error("Role name is required");
  }
  if (workspace.roles.some((role) => role.roleName.toLowerCase() === roleName.toLowerCase())) {
    res.status(409);
    throw new Error("Role already exists");
  }

  const group = await Chat.create({
    chatName: roleName,
    isGroupChat: true,
    users: [req.user._id],
    groupAdmin: req.user._id,
    workspace: workspace._id,
  });
  workspace.roles.push({ roleName, users: [] });
  workspace.groups.push(group._id);
  await workspace.save();
  queueKnowledgeUpsert(workspace._id, [buildWorkspaceDocument(workspace)]).catch(
    (error) => console.error("Unable to queue workspace indexing:", error.message)
  );
  recordAnalyticsEvent("workspace.role_created", {
    request_id: req.requestId,
    actor_user_id: req.user._id.toString(),
    workspace_id: workspace._id.toString(),
    role_name: roleName,
    group_id: group._id.toString(),
  });

  res.status(201).json({ workspace, group });
});

//@description     Get roles in a workspace
//@route           GET /api/workspace/:id/roles
//@access          Protected
const getRoles = asyncHandler(async (req, res) => {
    const workspace = await Workspace.findById(req.params.id);
  
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }
  
    res.status(200).json(workspace.roles);
  });
  

// Controller function to join a workspace
const joinWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId, groupId } = req.body;
  const user = req.user;

  if (!workspaceId || !groupId) {
    res.status(400);
    throw new Error('Please provide workspace ID and group ID.');
  }

  // Find the workspace by ID
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    res.status(404);
    throw new Error('Workspace not found.');
  }

  // Find the group by ID
  const group = await Chat.findById(groupId);
  if (!group) {
    res.status(404);
    throw new Error('Group not found.');
  }

  // Check if the group is part of the workspace
  const role = workspace.roles.find(r => r.roleName === group.chatName);
  if (!role) {
    res.status(400);
    throw new Error('Group does not match any role in the workspace.');
  }

  // Add user to the workspace's users list if not already added
  if (!workspace.users.some((userId) => userId.equals(user._id))) {
    workspace.users.push(user._id);
  }

  // Add user to the role's users list if not already added
  if (!role.users.some((userId) => userId.equals(user._id))) {
    role.users.push(user._id);
  }

  if (group.workspace.toString() !== workspace._id.toString()) {
    res.status(400);
    throw new Error("Group does not belong to this workspace");
  }
  if (!group.users.some((userId) => userId.equals(user._id))) {
    group.users.push(user._id);
    await group.save();
  }

  // Save the workspace
  await workspace.save();

  // Add workspace to the user's list of workspaces if not already added
  const userDoc = await User.findById(user._id);
  if (!userDoc.workspaces.some((workspaceId) => workspaceId.equals(workspace._id))) {
    userDoc.workspaces.push(workspace._id);
    await userDoc.save();
  }
  recordAnalyticsEvent("workspace.joined", {
    request_id: req.requestId,
    actor_user_id: user._id.toString(),
    workspace_id: workspace._id.toString(),
    group_id: group._id.toString(),
    role_name: group.chatName,
  });

  res.status(200).json({
    message: "Successfully joined the workspace role channel.",
    workspace,
    group,
    groups: [group],
  });
});

const getUserWorkspaces = asyncHandler(async (req, res) => {
    const user = req.user;  

    const workspaces = await Workspace.find({ users: user._id })
      .populate("users", "name pic email")
      .lean();
    res.status(200).json(
      workspaces.map((workspace) => ({
        ...workspace,
        members: workspace.users || [],
        memberCount: workspace.users?.length || 0,
      }))
    );
});


const getGroups = asyncHandler(async (req, res) => {
    const workspaceId = req.params.id;

    const workspace = await Workspace.findById(workspaceId).populate("groups");
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }
  
    res.status(200).json(workspace.groups);
});

const deleteAllWorkspaces = asyncHandler(async (req, res) => {
    try {
      await Workspace.deleteMany({});
      res.status(200).json({ message: 'All workspaces have been deleted successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete workspaces', error: error.message });
    }
  });

module.exports =
    { createWorkspace,
     addRole, 
     getRoles,
       joinWorkspace,
       getUserWorkspaces,
       getGroups ,
    deleteAllWorkspaces};
