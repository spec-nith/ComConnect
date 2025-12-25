const express = require("express");
const { createClient } = require("redis");
const axios = require("axios");
const authMiddleware = require("./middleware/authMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");
const { tracingMiddleware } = require("../shared/middleware/tracing");
const { metricsMiddleware, register } = require("../shared/middleware/metrics");
require("dotenv").config();

const app = express();
const PORT = process.env.USER_MANAGEMENT_SERVICE_PORT || 5009;

// Redis client for WebSocket registry
let redisClient = null;

async function initializeRedis() {
  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || "redis",
        port: parseInt(process.env.REDIS_PORT || 6379),
      },
    });

    redisClient.on("error", (err) => console.error("❌ Redis Client Error:", err));
    redisClient.on("connect", () => console.log("✅ Redis connected for user management"));

    await redisClient.connect();
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
  }
}

// Initialize Redis on startup
initializeRedis();

// Constants
const WEBSOCKET_REGISTRY_PREFIX = "ws:user:";
const USER_STATUS_PREFIX = "user:status:";
const LAST_SEEN_PREFIX = "user:lastseen:";
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://user-service:5001";

// Middleware
app.use(express.json());
app.use(tracingMiddleware);
app.use(metricsMiddleware);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "user-management-service",
    timestamp: new Date().toISOString(),
    redisConnected: redisClient?.isReady || false,
  });
});

// Metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

/**
 * Get user online status
 * GET /api/users/:userId/status
 */
app.get("/api/users/:userId/status", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    // Check if user has active WebSocket connection
    const wsKey = `${WEBSOCKET_REGISTRY_PREFIX}${userId}`;
    const hasConnection = await redisClient.exists(wsKey);

    // Get last seen timestamp
    const lastSeenKey = `${LAST_SEEN_PREFIX}${userId}`;
    const lastSeen = await redisClient.get(lastSeenKey);

    // Get explicit status (if set)
    const statusKey = `${USER_STATUS_PREFIX}${userId}`;
    const explicitStatus = await redisClient.get(statusKey);

    const isOnline = hasConnection === 1;

    res.status(200).json({
      userId,
      isOnline,
      lastSeen: lastSeen ? new Date(parseInt(lastSeen)).toISOString() : null,
      status: explicitStatus || (isOnline ? "online" : "offline"),
    });
  } catch (error) {
    console.error("❌ Get status error:", error);
    res.status(500).json({ error: "Failed to get user status", message: error.message });
  }
});

/**
 * Get multiple users' status
 * POST /api/users/status/batch
 */
app.post("/api/users/status/batch", authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds array is required" });
    }

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    const statuses = await Promise.all(
      userIds.map(async (userId) => {
        try {
          const wsKey = `${WEBSOCKET_REGISTRY_PREFIX}${userId}`;
          const hasConnection = await redisClient.exists(wsKey);

          const lastSeenKey = `${LAST_SEEN_PREFIX}${userId}`;
          const lastSeen = await redisClient.get(lastSeenKey);

          const statusKey = `${USER_STATUS_PREFIX}${userId}`;
          const explicitStatus = await redisClient.get(statusKey);

          return {
            userId,
            isOnline: hasConnection === 1,
            lastSeen: lastSeen ? new Date(parseInt(lastSeen)).toISOString() : null,
            status: explicitStatus || (hasConnection === 1 ? "online" : "offline"),
          };
        } catch (error) {
          return {
            userId,
            error: error.message,
          };
        }
      })
    );

    res.status(200).json({ statuses });
  } catch (error) {
    console.error("❌ Batch status error:", error);
    res.status(500).json({ error: "Failed to get batch status", message: error.message });
  }
});

/**
 * Set user status explicitly (online, offline, away, busy)
 * PUT /api/users/:userId/status
 */
app.put("/api/users/:userId/status", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    const requestingUserId = req.user.id || req.user._id;

    // Users can only update their own status
    if (userId !== requestingUserId.toString()) {
      return res.status(403).json({ error: "Unauthorized to update this user's status" });
    }

    const validStatuses = ["online", "offline", "away", "busy"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    const statusKey = `${USER_STATUS_PREFIX}${userId}`;
    await redisClient.setEx(statusKey, 3600, status); // Expire after 1 hour

    // Update last seen
    const lastSeenKey = `${LAST_SEEN_PREFIX}${userId}`;
    await redisClient.set(lastSeenKey, Date.now().toString());

    res.status(200).json({
      userId,
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Set status error:", error);
    res.status(500).json({ error: "Failed to set user status", message: error.message });
  }
});

/**
 * Register WebSocket connection (called by WebSocket gateway)
 * POST /api/users/:userId/register-connection
 */
app.post("/api/users/:userId/register-connection", async (req, res) => {
  try {
    const { userId } = req.params;
    const { socketId } = req.body;

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    // Register WebSocket connection
    const wsKey = `${WEBSOCKET_REGISTRY_PREFIX}${userId}`;
    await redisClient.setEx(wsKey, 3600, socketId); // Expire after 1 hour

    // Update last seen
    const lastSeenKey = `${LAST_SEEN_PREFIX}${userId}`;
    await redisClient.set(lastSeenKey, Date.now().toString());

    // Set status to online
    const statusKey = `${USER_STATUS_PREFIX}${userId}`;
    await redisClient.setEx(statusKey, 3600, "online");

    res.status(200).json({
      success: true,
      userId,
      registered: true,
    });
  } catch (error) {
    console.error("❌ Register connection error:", error);
    res.status(500).json({ error: "Failed to register connection", message: error.message });
  }
});

/**
 * Unregister WebSocket connection (called by WebSocket gateway)
 * POST /api/users/:userId/unregister-connection
 */
app.post("/api/users/:userId/unregister-connection", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    // Remove WebSocket connection
    const wsKey = `${WEBSOCKET_REGISTRY_PREFIX}${userId}`;
    await redisClient.del(wsKey);

    // Update last seen
    const lastSeenKey = `${LAST_SEEN_PREFIX}${userId}`;
    await redisClient.set(lastSeenKey, Date.now().toString());

    // Set status to offline
    const statusKey = `${USER_STATUS_PREFIX}${userId}`;
    await redisClient.setEx(statusKey, 3600, "offline");

    res.status(200).json({
      success: true,
      userId,
      unregistered: true,
    });
  } catch (error) {
    console.error("❌ Unregister connection error:", error);
    res.status(500).json({ error: "Failed to unregister connection", message: error.message });
  }
});

/**
 * Update last seen timestamp
 * POST /api/users/:userId/last-seen
 */
app.post("/api/users/:userId/last-seen", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    const lastSeenKey = `${LAST_SEEN_PREFIX}${userId}`;
    await redisClient.set(lastSeenKey, Date.now().toString());

    res.status(200).json({
      success: true,
      userId,
      lastSeen: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Update last seen error:", error);
    res.status(500).json({ error: "Failed to update last seen", message: error.message });
  }
});

/**
 * Get all online users
 * GET /api/users/online
 */
app.get("/api/users/online", authMiddleware, async (req, res) => {
  try {
    if (!redisClient || !redisClient.isReady) {
      return res.status(503).json({ error: "Redis not available" });
    }

    // Get all WebSocket registry keys
    const keys = await redisClient.keys(`${WEBSOCKET_REGISTRY_PREFIX}*`);
    const userIds = keys.map((key) => key.replace(WEBSOCKET_REGISTRY_PREFIX, ""));

    res.status(200).json({
      onlineUsers: userIds,
      count: userIds.length,
    });
  } catch (error) {
    console.error("❌ Get online users error:", error);
    res.status(500).json({ error: "Failed to get online users", message: error.message });
  }
});

// Error handling middleware
app.use(errorMiddleware);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 User Management Service running on port ${PORT}`);
  console.log(`📡 Redis Host: ${process.env.REDIS_HOST || "redis"}`);
});

