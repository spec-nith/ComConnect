const asyncHandler = require('express-async-handler');
const { prisma } = require('../config/db');

//@description     Create a new workspace
//@route           POST /api/workspace
//@access          Protected
const createWorkspace = asyncHandler(async (req, res) => {
  const { name, roles } = req.body;
  const user = req.user;

  if (!name || !roles || roles.length === 0) {
    res.status(400);
    throw new Error('Please provide workspace name and roles.');
  }

  // Helper function to generate all combinations of roles
  const getCombinations = (roles) => {
    const result = [];
    const f = (prefix, roles) => {
      for (let i = 0; i < roles.length; i++) {
        result.push([...prefix, roles[i]]);
        f([...prefix, roles[i]], roles.slice(i + 1));
      }
    };
    f([], roles);
    return result;
  };

  // Create the workspace
  const workspace = await prisma.workspace.create({
    data: {
      workspaceName: name,
      createdBy: user.id || user._id,
      roles: roles.map(role => ({ roleName: role, users: [] })),
    },
  });

  // Add user to workspace
  await prisma.workspaceUser.create({
    data: {
      userId: user.id || user._id,
      workspaceId: workspace.id,
    },
  });

  // Note: Groups (Chats) will be created in chat-service
  // We'll return the workspace with group IDs that need to be created
  const roleCombinations = getCombinations(roles);
  const groupsToCreate = roleCombinations.map(combination => ({
    chatName: combination.join('+'),
    isGroupChat: true,
    workspaceId: workspace.id,
  }));

  res.status(201).json({
    workspace,
    groupsToCreate
  });
});

//@description     Add role to workspace
//@route           POST /api/workspace/:id/role
//@access          Protected
const addRole = asyncHandler(async (req, res) => {
  const { roleName } = req.body;
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
  });

  if (!workspace) {
    res.status(404);
    throw new Error('Workspace not found');
  }

  const roles = Array.isArray(workspace.roles) ? workspace.roles : [];
  roles.push({ roleName, users: [] });

  const updatedWorkspace = await prisma.workspace.update({
    where: { id: req.params.id },
    data: { roles },
  });

  res.status(201).json(updatedWorkspace);
});

//@description     Get roles in a workspace
//@route           GET /api/workspace/:id/roles
//@access          Protected
const getRoles = asyncHandler(async (req, res) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.id },
  });

  if (!workspace) {
    res.status(404);
    throw new Error('Workspace not found');
  }

  const roles = Array.isArray(workspace.roles) ? workspace.roles : [];
  res.status(200).json(roles);
});

// Controller function to join a workspace
const joinWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId, groupId } = req.body;
  const user = req.user;
  const userId = user.id || user._id;

  if (!workspaceId || !groupId) {
    res.status(400);
    throw new Error('Please provide workspace ID and group ID.');
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    res.status(404);
    throw new Error('Workspace not found.');
  }

  // Check if user is already in workspace
  const existingWorkspaceUser = await prisma.workspaceUser.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
  });

  if (!existingWorkspaceUser) {
    await prisma.workspaceUser.create({
      data: {
        userId,
        workspaceId,
      },
    });
  }

  // Note: Group (Chat) operations will be handled by chat-service
  // This service just manages workspace membership

  res.status(200).json({
    message: 'Successfully joined the workspace.',
    workspace,
  });
});

const getUserWorkspaces = asyncHandler(async (req, res) => {
  const user = req.user;
  const userId = user.id || user._id;

  const workspaceUsers = await prisma.workspaceUser.findMany({
    where: { userId },
    include: {
      workspace: true,
    },
  });

  const workspaces = workspaceUsers.map(wu => wu.workspace);
  res.status(200).json(workspaces);
});

const getGroups = asyncHandler(async (req, res) => {
  const workspaceId = req.params.id;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    res.status(404);
    throw new Error('Workspace not found');
  }

  // Note: Groups are stored in chat-service (Cassandra)
  // This endpoint should call chat-service to get groups
  // For now, return empty array or make API call to chat-service
  res.status(200).json([]);
});

const deleteAllWorkspaces = asyncHandler(async (req, res) => {
  try {
    await prisma.workspace.deleteMany({});
    res.status(200).json({ message: 'All workspaces have been deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete workspaces', error: error.message });
  }
});

module.exports = {
  createWorkspace,
  addRole,
  getRoles,
  joinWorkspace,
  getUserWorkspaces,
  getGroups,
  deleteAllWorkspaces
};
