/**
 * Task Service Routes - Version 1
 */

const express = require('express');
const {
  allocateTask,
  getMyTasks,
  getAllocatedTasks,
  updateTaskStatus,
  addComment
} = require('../controllers/taskController');
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post('/allocate', protect, allocateTask);
router.get('/my-tasks', protect, getMyTasks);
router.get('/allocated-tasks', protect, getAllocatedTasks);
router.patch('/update-status', protect, updateTaskStatus);
router.post('/add-comment', protect, addComment);

module.exports = router;

