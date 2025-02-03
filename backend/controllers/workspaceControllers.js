const asyncHandler = require('express-async-handler');
const { WorkspaceSQL } = require('../models/workspaceModel');
const { UserSQL } = require('../models/userModel');
const Chat = require('../models/chatModel');

//@description     Create a new workspace
//@route           POST /api/workspace
//@access          Protected

// Controller function to create a workspace and associated groups
const createWorkspace = asyncHandler(async (req, res) => {
  const { name, roles } = req.body;
  const userId = req.user.id;

  if (!name || !roles || roles.length === 0) {
    res.status(400);
    throw new Error('Please provide workspace name and roles.');
  }

  try {
    const workspaceId = await WorkspaceSQL.create({
      name,
      createdBy: userId,
      roles,
    });

    const workspace = await WorkspaceSQL.findById(workspaceId);
    
    res.status(201).json(workspace);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});
  


//@description     Add role to workspace
//@route           POST /api/workspace/:id/role
//@access          Protected
// Controller function to add a role to an existing workspace
const addRole = asyncHandler(async (req, res) => {
  const { roleName } = req.body;
  const workspaceId = req.params.id;

  try {
    const workspace = await WorkspaceSQL.findById(workspaceId);
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }

    const roleId = await WorkspaceSQL.addRole(workspaceId, roleName);
    const updatedWorkspace = await WorkspaceSQL.findById(workspaceId);
    
    res.status(201).json(updatedWorkspace);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

//@description     Get roles in a workspace
//@route           GET /api/workspace/:id/roles
//@access          Protected
const getRoles = asyncHandler(async (req, res) => {
  const workspaceId = req.params.id;
  
  try {
    const roles = await WorkspaceSQL.getRoles(workspaceId);
    res.status(200).json(roles);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});
  

// Controller function to join a workspace
const joinWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId, roleId } = req.body;
  const userId = req.user.id;

  try {
    await WorkspaceSQL.addMember(workspaceId, userId, roleId);
    const workspace = await WorkspaceSQL.findById(workspaceId);
    
    res.status(200).json({
      message: 'Successfully joined the workspace',
      workspace
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

const getUserWorkspaces = asyncHandler(async (req, res) => {
  try {
    const workspaces = await WorkspaceSQL.getUserWorkspaces(req.user.id);
    res.status(200).json(workspaces);
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});


const getGroups = asyncHandler(async (req, res) => {
    const workspaceId = req.params.id;

    const workspace = await WorkspaceSQL.findById(workspaceId).populate('groups');
    console.log("workspace",workspace);
    console.log("groups",workspace.groups);

  
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }
  
    res.status(200).json(workspace.groups);
});

const deleteAllWorkspaces = asyncHandler(async (req, res) => {
    try {
      await WorkspaceSQL.deleteMany({});
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
