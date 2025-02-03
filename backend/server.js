const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const Connection = require("./config/db");
const cors = require("cors");
const NotificationService = require("./services/notificationService");
const { testMySQLConnection } = require('./config/mysql');
const { connectDB } = require('./config/db');

// Add process error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

// Load environment variables with multiple path attempts
const envPaths = [
  path.resolve(__dirname, '../../.env'),  // Two levels up to reach root
  path.resolve(__dirname, '../.env'),     // One level up
  path.resolve(__dirname, '.env')         // Current directory
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
  console.warn('⚠️ No .env file found in any of the searched paths');
  console.log('Searched paths:', envPaths);
}

// Verify environment variables are loaded
console.log('Environment Variables Status:');
console.log('DB_USERNAME exists:', !!process.env.DB_USERNAME);
console.log('DB_PASSWORD exists:', !!process.env.DB_PASSWORD); 
console.log('REDIS_HOST exists:', !!process.env.REDIS_HOST);
console.log('KAFKA_BROKER exists:', !!process.env.KAFKA_BROKER);

// Add at the start of server.js
console.log('Environment Variables:', {
  KAFKA_BROKER: process.env.KAFKA_BROKER,
  REDIS_HOST: process.env.REDIS_HOST,
  NODE_ENV: process.env.NODE_ENV
});

const app = express();

// Configure CORS with more detailed options
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000" || "https://com-connect.vercel.app/",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Import routes
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const messageRoutes = require("./routes/messageRoutes");
const workspaceRoutes = require("./routes/workspaceRoutes");
const taskRoutes = require("./routes/taskAllocatorRoutes.js");
const notificationRoutes = require("./routes/notificationRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

// API routes
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notification", notificationRoutes);

// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

// Test connections on startup
async function testConnections() {
  try {
    // Test MySQL connection
    const mysqlConnected = await testMySQLConnection();
    
    // Test MongoDB connection
    await Connection();
    
    // Test Redis and other connections
    const connectionStatus = await NotificationService.testConnections();
    
    console.log('Connection Test Results:', {
      mysql: mysqlConnected,
      mongodb: true,
      redis: connectionStatus.redis
    });
    
  } catch (error) {
    console.error('❌ Service connection test failed:', error);
  }
}

// Call this before starting your Express server
testConnections();

// Connect to database and start server with retry mechanism
const startServer = async () => {
  try {
    // Try to connect to MongoDB first
    console.log('📡 Attempting to connect to MongoDB...');
    await Connection();
    
    // Connect to MySQL
    connectDB();
    
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Server running on port ${PORT}`);
    });

    // Initialize Socket.IO after server is created
    console.log('🔌 Initializing Socket.IO...');
    const io = require("socket.io")(server, {
      pingTimeout: 60000,
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000" || "https://com-connect.vercel.app",
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
          if (!chat.users) {
            console.log("❌ chat.users not defined");
            return;
          }

          chat.users.forEach((user) => {
            if (user._id == newMessageRecieved.sender._id) return;
            socket.in(user._id).emit("message recieved", newMessageRecieved);
          });
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

    // Error handling for Socket.IO server
    io.on("error", (error) => {
      console.error('❌ Socket.IO server error:', error);
    });

    // Error handling for HTTP server
    server.on('error', (error) => {
      console.error('❌ HTTP server error:', error);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    // Don't exit immediately on error
    console.log('⏳ Waiting before retry...');
    setTimeout(() => {
      console.log('🔄 Retrying server start...');
      startServer();
    }, 5000);
  }
};

// Start the server
console.log('🚀 Starting server...');
startServer();
