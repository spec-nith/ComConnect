/**
 * Chat Service Routes - Version 1
 */

const express = require("express");
const {
  accessChat,
  fetchChats,
  createGroupChat,
  removeFromGroup,
  addToGroup,
  renameGroup,
  deleteAllChats,
} = require("../controllers/chatControllers");
const { protect } = require("../middleware/authMiddleware");
const redisService = require("../services/redisService");
const kafkaService = require("../services/kafkaService");

const router = express.Router();

router.route("/").post(protect, accessChat);
router.get('/workspace/:workspaceId/chats', protect, fetchChats);
router.route("/group").post(protect, createGroupChat);
router.route("/rename").put(protect, renameGroup);
router.route("/groupremove").put(protect, removeFromGroup);
router.route("/groupadd").put(protect, addToGroup);
router.delete('/deleteAll', deleteAllChats);

// Health check endpoints for Redis and Kafka
router.get('/health/redis', async (req, res) => {
  try {
    const isConnected = await redisService.testConnection();
    res.status(isConnected ? 200 : 503).json({
      status: isConnected ? 'ok' : 'error',
      service: 'redis',
      connected: isConnected
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'redis',
      error: error.message
    });
  }
});

router.get('/health/kafka', async (req, res) => {
  try {
    const isConnected = await kafkaService.testConnection();
    res.status(isConnected ? 200 : 503).json({
      status: isConnected ? 'ok' : 'error',
      service: 'kafka',
      connected: isConnected
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'kafka',
      error: error.message
    });
  }
});

module.exports = router;
