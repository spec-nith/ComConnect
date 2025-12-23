const Task = require("../models/taskModel");
const User = require("../models/userModel");
const Workspace = require("../models/workspaceModel");

exports.allocateTask = async (req, res) => {
    const { heading, description, email, workspaceId, attachments } = req.body;
  
    try {
      const workspace = await Workspace.findById(workspaceId).populate('users');
      const assignee = await User.findOne({ email: email });
  
      if (!assignee) {
        return res.status(404).json({ message: 'Assignee not found' });
      }
  
      const isAssigneeInWorkspace = workspace.users.some(user => user._id.equals(assignee._id));
  
      if (!isAssigneeInWorkspace) {
        return res.status(400).json({ message: 'Assignee is not part of the workspace' });
      }
  
      const task = new Task({
        heading,
        description,
        assignee: assignee._id,
        attachments,
        createdBy: req.user._id
      });
  
      await task.save();
  
      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

exports.getMyTasks = async (req, res) => {
  const userId = req.user._id;

  try {
    const tasks = await Task.find({ assignee: userId });
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllocatedTasks = async (req, res) => {
  const userId = req.user._id;

  try {
    const tasks = await Task.find({ createdBy: userId });
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

