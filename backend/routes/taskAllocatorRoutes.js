const express = require('express');
const {
  allocateTask,
  getMyTasks,
  getAllocatedTasks,
  getWorkspaceTasks,
  updateTaskStatus,
  addComment,
  deleteTask
} = require('../controllers/taskController');
const { protect } = require("../middleware/authMiddleware");
 

const router = express.Router();

router.post('/allocate', protect, allocateTask);
router.get('/my-tasks', protect, getMyTasks);
router.get('/allocated-tasks', protect, getAllocatedTasks);
router.get('/workspace/:workspaceId', protect, getWorkspaceTasks);
router.patch('/update-status', protect, updateTaskStatus);
router.post('/add-comment', protect, addComment);
router.delete('/:taskId', protect, deleteTask);

module.exports = router;
