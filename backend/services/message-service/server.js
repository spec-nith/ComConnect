const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
// CORS is handled by API Gateway

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

const Connection = require("./config/cassandra");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const requestIdMiddleware = require("./shared/middleware/requestId");
const { apiLimiter } = require("./shared/middleware/rateLimiter");
const { apiVersioning, validateVersion } = require("./shared/middleware/apiVersioning");
const { addDeprecationHeaders } = require("./shared/config/apiVersions");
const { metricsMiddleware, getMetrics } = require("./shared/middleware/metrics");
const { initializeTracing, tracingMiddleware } = require("./shared/middleware/tracing");
const redisService = require("./services/redisService");
const kafkaService = require("./services/kafkaService");
const messageRoutes = require("./routes/messageRoutes");

const app = express();

// Initialize distributed tracing
const SERVICE_NAME = 'message-service';
initializeTracing(SERVICE_NAME);

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Tracing middleware (after request ID)
app.use(tracingMiddleware(SERVICE_NAME));

// Metrics middleware
app.use(metricsMiddleware(SERVICE_NAME));

// API Versioning middleware (before routes)
app.use(apiVersioning);

// CORS is handled by API Gateway (nginx)

app.use(express.json());

// Global rate limiting
app.use(apiLimiter);

// Health check endpoint (no versioning)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'message-service' });
});

// Version info endpoint
app.get('/api/version', (req, res) => {
  const { getVersionInfo } = require("./shared/config/apiVersions");
  const versionInfo = getVersionInfo(req.apiVersion);
  res.json({
    currentVersion: versionInfo.version,
    supportedVersions: ['v1'],
    defaultVersion: 'v1',
    versionInfo
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', getMetrics);

// API routes with versioning support
app.use("/api/message", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) return;
  next();
}, validateVersion(['v1']), messageRoutes);

app.use("/api/v1/message", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) return;
  next();
}, validateVersion(['v1']), messageRoutes);

// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

// Connect to database and start server with Socket.IO
const startServer = async () => {
  try {
    console.log('📡 Message Service: Attempting to connect to Cassandra...');
    await Connection();
    
    // Test Redis connection
    console.log('📡 Message Service: Testing Redis connection...');
    const redisConnected = await redisService.testConnection();
    if (redisConnected) {
      console.log('✅ Redis connection successful (Message Service)');
    } else {
      console.warn('⚠️ Redis connection failed, continuing without Redis');
    }
    
    // Initialize Kafka
    console.log('📡 Message Service: Initializing Kafka...');
    await kafkaService.initialize();
    
    // Initialize Elasticsearch
    try {
      console.log('📡 Message Service: Initializing Elasticsearch...');
      const elasticsearchService = require('../shared/services/elasticsearchService');
      await elasticsearchService.initialize();
      console.log('✅ Elasticsearch initialized (Message Service)');
    } catch (error) {
      console.warn('⚠️ Elasticsearch initialization failed, continuing without Elasticsearch:', error.message);
    }
    
    const PORT = process.env.MESSAGE_SERVICE_PORT || 5003;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Message Service running on port ${PORT}`);
    });

    // Initialize Socket.IO after server is created
    console.log('🔌 Initializing Socket.IO...');
    const io = require("socket.io")(server, {
      pingTimeout: 60000,
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization']
      },
      transports: ['websocket', 'polling'],
      allowEIO3: true
    });

    io.on("connection", (socket) => {
      console.log(`✅ Client connected: ${socket.id}`);
      
      socket.on("setup", (userData) => {
        try {
          socket.join(userData._id);
          socket.emit("connected");
          console.log(`👤 User ${userData._id} setup complete`);
        } catch (error) {
          console.error('❌ Setup error:', error);
        }
      });

      socket.on("join chat", (room) => {
        try {
          socket.join(room);
          console.log(`👤 User joined room: ${room}`);
        } catch (error) {
          console.error('❌ Join chat error:', error);
        }
      });

      socket.on("typing", (room) => socket.in(room).emit("typing"));
      socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

      socket.on("new message", (newMessageRecieved) => {
        try {
          var chat = newMessageRecieved.chat;
          console.log('📨 New message received on backend:', {
            messageId: newMessageRecieved._id,
            chatId: chat._id,
            sender: newMessageRecieved.sender._id,
            usersCount: chat.users?.length
          });
          
          if (!chat.users) {
            console.log("❌ chat.users not defined");
            return;
          }

          console.log('📤 Broadcasting message to users in chat...');
          chat.users.forEach((user) => {
            if (user._id == newMessageRecieved.sender._id) {
              console.log(`⏭️  Skipping sender: ${user._id}`);
              return;
            }
            console.log(`📨 Emitting to user room: ${user._id}`);
            socket.in(user._id).emit("message recieved", newMessageRecieved);
          });
          console.log('✅ Message broadcast complete');
        } catch (error) {
          console.error('❌ New message error:', error);
        }
      });

      socket.on("disconnect", () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
      });

      socket.on("error", (error) => {
        console.error('❌ Socket error:', error);
      });
    });

    io.on("error", (error) => {
      console.error('❌ Socket.IO server error:', error);
    });

    server.on('error', (error) => {
      console.error('❌ HTTP server error:', error);
    });

  } catch (error) {
    console.error('❌ Failed to start message service:', error);
    setTimeout(() => {
      console.log('🔄 Retrying server start...');
      startServer();
    }, 5000);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Shutdown Kafka
    await kafkaService.shutdown();
    
    console.log('✅ Message Service shut down gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('🚀 Starting Message Service...');
startServer();

