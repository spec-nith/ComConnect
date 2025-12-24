const Task = require("../models/taskModel");
const User = require("../models/userModel");
const Workspace = require("../models/workspaceModel");

exports.allocateTask = async (req, res) => {
    const { heading, description, email, workspaceId, attachments } = req.body;
  
    try {
      // Validate required fields
      if (!heading || !description || !email || !workspaceId) {
        return res.status(400).json({ 
          message: 'Missing required fields: heading, description, email, and workspaceId are required' 
        });
      }

      // Find workspace
      const workspace = await Workspace.findById(workspaceId).populate('users');
      
      if (!workspace) {
        return res.status(404).json({ message: 'Workspace not found' });
      }

      // Find assignee
      const assignee = await User.findOne({ email: email });
  
      if (!assignee) {
        return res.status(404).json({ message: 'Assignee not found' });
      }
  
      // Check if assignee is in workspace
      const isAssigneeInWorkspace = workspace.users.some(user => user._id.equals(assignee._id));
  
      if (!isAssigneeInWorkspace) {
        return res.status(400).json({ message: 'Assignee is not part of the workspace' });
      }
  
      // Create task
      const task = new Task({
        heading,
        description,
        assignee: assignee._id,
        attachments: attachments || [],
        createdBy: req.user._id,
        workspace: workspaceId
      });
  
      await task.save();

      // Populate task before sending response
      await task.populate('assignee', 'name email pic');
      await task.populate('createdBy', 'name email pic');
      await task.populate('workspace');
  
      res.status(201).json(task);
    } catch (error) {
      console.error('Error allocating task:', error);
      // Handle validation errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({ 
          message: 'Validation error', 
          errors: Object.values(error.errors).map(e => e.message) 
        });
      }
      res.status(500).json({ message: error.message || 'Internal server error' });
    }
  };

exports.getMyTasks = async (req, res) => {
  const userId = req.user._id;
  const { workspaceId } = req.query;

  try {
    const query = { assignee: userId };
    if (workspaceId) {
      query.workspace = workspaceId;
    }
    const tasks = await Task.find(query).populate('assignee', 'name email pic').populate('createdBy', 'name email pic').populate('workspace');
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllocatedTasks = async (req, res) => {
  const userId = req.user._id;
  const { workspaceId } = req.query;

  try {
    const query = { createdBy: userId };
    if (workspaceId) {
      query.workspace = workspaceId;
    }
    const tasks = await Task.find(query)
      .populate('assignee', 'name email pic')
      .populate('createdBy', 'name email pic')
      .populate('workspace');
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateTaskStatus = async (req, res) => {
    const { taskId, status } = req.body;
    const userId = req.user._id;
  
    try {
      const task = await Task.findById(taskId);
  
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
  
      if (task.assignee.toString() !== userId.toString() && task.createdBy.toString() !== userId.toString()) {
        return res.status(403).json({ message: 'You do not have permission to update this task' });
      }
  
      task.status = status;
      await task.save();
  
      res.status(200).json(task);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

exports.addComment = async (req, res) => {
  const { taskId, comment } = req.body;
  const userId = req.user._id;

  try {
    const task = await Task.findById(taskId);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    task.comments.push({ user: userId, comment });
    await task.save();

    res.status(200).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

