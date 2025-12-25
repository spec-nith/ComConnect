const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const path = require("path");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const { initializeTracing, tracingMiddleware } = require("../shared/middleware/tracing");
const { metricsMiddleware, getMetrics } = require("../shared/middleware/metrics");
const promClient = require("prom-client");

// Load environment variables
const envPaths = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`✅ Environment loaded from: ${envPath}`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('⚠️ No .env file found');
}

const app = express();
const server = http.createServer(app);

// Initialize distributed tracing
const SERVICE_NAME = 'websocket-gateway';
initializeTracing(SERVICE_NAME);

// Metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// WebSocket connection metrics
const activeConnections = new promClient.Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections',
  registers: [register]
});

const messagesReceived = new promClient.Counter({
  name: 'websocket_messages_received_total',
  help: 'Total number of messages received via WebSocket',
  labelNames: ['event_type'],
  registers: [register]
});

const messagesSent = new promClient.Counter({
  name: 'websocket_messages_sent_total',
  help: 'Total number of messages sent via WebSocket',
  labelNames: ['event_type'],
  registers: [register]
});

// Middleware
app.use(express.json());
app.use(tracingMiddleware);
app.use(metricsMiddleware);

// Initialize Socket.IO with CORS (must be before routes that use it)
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

// Redis adapter for horizontal scaling (optional, for production)
let redisAdapter = null;
if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  try {
    const pubClient = createClient({
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || 6379)
      }
    });
    const subClient = pubClient.duplicate();
    
    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      redisAdapter = { pubClient, subClient };
      console.log('✅ Redis adapter connected for Socket.IO scaling');
    }).catch(err => {
      console.warn('⚠️ Redis adapter connection failed, continuing without scaling:', err.message);
    });
  } catch (error) {
    console.warn('⚠️ Redis adapter setup failed:', error.message);
  }
}

// Authentication middleware for Socket.IO
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    socket.userId = decoded.id;
    socket.user = decoded;
    next();
  } catch (error) {
    console.error('❌ Socket authentication error:', error.message);
    next(new Error('Authentication error: Invalid token'));
  }
});

// Store active connections
const activeUsers = new Map();

// Health check endpoint (after io is initialized)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'websocket-gateway',
    timestamp: new Date().toISOString(),
    activeConnections: io.engine.clientsCount || 0
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

// User Management Service URL
const USER_MANAGEMENT_SERVICE_URL = process.env.USER_MANAGEMENT_SERVICE_URL || "http://user-management-service:5009";

// Helper function to register connection with user management service
async function registerConnection(userId, socketId) {
  try {
    await axios.post(`${USER_MANAGEMENT_SERVICE_URL}/api/users/${userId}/register-connection`, {
      socketId,
    });
    console.log(`✅ Registered connection for user ${userId}`);
  } catch (error) {
    console.error(`❌ Failed to register connection for user ${userId}:`, error.message);
  }
}

// Helper function to unregister connection with user management service
async function unregisterConnection(userId) {
  try {
    await axios.post(`${USER_MANAGEMENT_SERVICE_URL}/api/users/${userId}/unregister-connection`);
    console.log(`✅ Unregistered connection for user ${userId}`);
  } catch (error) {
    console.error(`❌ Failed to unregister connection for user ${userId}:`, error.message);
  }
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  const userId = socket.userId;
  activeUsers.set(userId, socket.id);
  activeConnections.inc();
  
  // Register connection with user management service
  registerConnection(userId, socket.id);
  
  console.log(`✅ Client connected: ${socket.id} (User: ${userId})`);

  // Setup user - join their personal room
  socket.on("setup", async (userData) => {
    try {
      if (!userData || !userData._id) {
        socket.emit("error", { message: "Invalid user data" });
        return;
      }

      socket.join(userData._id);
      activeUsers.set(userData._id, socket.id);
      socket.emit("connected", { message: "Connected to WebSocket gateway" });
      console.log(`👤 User ${userData._id} setup complete`);
    } catch (error) {
      console.error('❌ Setup error:', error);
      socket.emit("error", { message: "Setup failed", error: error.message });
    }
  });

  // Join chat room
  socket.on("join chat", (chatId) => {
    try {
      if (!chatId) {
        socket.emit("error", { message: "Invalid chat ID" });
        return;
      }
      socket.join(chatId);
      console.log(`👤 User ${userId} joined room: ${chatId}`);
      messagesReceived.inc({ event_type: 'join_chat' });
    } catch (error) {
      console.error('❌ Join chat error:', error);
      socket.emit("error", { message: "Failed to join chat", error: error.message });
    }
  });

  // Leave chat room
  socket.on("leave chat", (chatId) => {
    try {
      socket.leave(chatId);
      console.log(`👤 User ${userId} left room: ${chatId}`);
    } catch (error) {
      console.error('❌ Leave chat error:', error);
    }
  });

  // Typing indicators
  socket.on("typing", (room) => {
    try {
      socket.to(room).emit("typing", { userId, room });
      messagesReceived.inc({ event_type: 'typing' });
    } catch (error) {
      console.error('❌ Typing error:', error);
    }
  });

  socket.on("stop typing", (room) => {
    try {
      socket.to(room).emit("stop typing", { userId, room });
      messagesReceived.inc({ event_type: 'stop_typing' });
    } catch (error) {
      console.error('❌ Stop typing error:', error);
    }
  });

  // Handle new message - forward to message service for persistence
  socket.on("new message", async (messageData) => {
    try {
      messagesReceived.inc({ event_type: 'new_message' });
      
      // Forward to message service for persistence
      const messageServiceUrl = process.env.MESSAGE_SERVICE_URL || 'http://message-service:5003';
      
      try {
        await axios.post(`${messageServiceUrl}/api/message`, messageData, {
          headers: {
            'Authorization': `Bearer ${socket.handshake.auth.token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error('❌ Failed to persist message:', error.message);
        // Continue to broadcast even if persistence fails
      }

      // Broadcast to chat room
      const chatId = messageData.chat?._id || messageData.chatId;
      if (chatId) {
        socket.to(chatId).emit("message received", messageData);
        messagesSent.inc({ event_type: 'message_received' });
        console.log(`📨 Message broadcast to room: ${chatId}`);
      }

      // Also emit to individual user rooms (for notifications)
      if (messageData.chat?.users) {
        messageData.chat.users.forEach((user) => {
          if (user._id !== userId) {
            socket.to(user._id).emit("message received", messageData);
          }
        });
      }
    } catch (error) {
      console.error('❌ New message error:', error);
      socket.emit("error", { message: "Failed to send message", error: error.message });
    }
  });

  // Handle message received from message service (for persistence confirmation)
  socket.on("message persisted", (messageData) => {
    try {
      const chatId = messageData.chat?._id || messageData.chatId;
      if (chatId) {
        io.to(chatId).emit("message received", messageData);
        messagesSent.inc({ event_type: 'message_persisted' });
      }
    } catch (error) {
      console.error('❌ Message persisted error:', error);
    }
  });

  // Disconnect handling
  socket.on("disconnect", async (reason) => {
    console.log(`❌ Client disconnected: ${socket.id} (User: ${userId}, Reason: ${reason})`);
    activeUsers.delete(userId);
    activeConnections.dec();
    
    // Unregister connection with user management service
    await unregisterConnection(userId);
  });

  // Error handling
  socket.on("error", (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Error handling
io.on("error", (error) => {
  console.error('❌ Socket.IO server error:', error);
});

server.on('error', (error) => {
  console.error('❌ HTTP server error:', error);
});

// Start server
const PORT = process.env.WEBSOCKET_GATEWAY_PORT || 5007;

const startServer = async () => {
  try {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 WebSocket Gateway running on port ${PORT}`);
      console.log(`✅ CORS enabled for: ${process.env.CORS_ORIGIN || "http://localhost:3000"}`);
    });
  } catch (error) {
    console.error('❌ Failed to start WebSocket gateway:', error);
    setTimeout(() => {
      console.log('🔄 Retrying server start...');
      startServer();
    }, 5000);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Close Socket.IO
  io.close(() => {
    console.log('✅ Socket.IO closed');
  });

  // Close Redis adapter if connected
  if (redisAdapter) {
    await redisAdapter.pubClient.quit();
    await redisAdapter.subClient.quit();
    console.log('✅ Redis adapter closed');
  }

  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();

module.exports = { io, server };

