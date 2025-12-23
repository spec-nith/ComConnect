const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const cors = require("cors");

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

const Connection = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const requestIdMiddleware = require("../../shared/middleware/requestId");
const { apiLimiter } = require("../../shared/middleware/rateLimiter");
const { apiVersioning, validateVersion } = require("../../shared/middleware/apiVersioning");
const { addDeprecationHeaders } = require("../../shared/config/apiVersions");
const { metricsMiddleware, getMetrics } = require("../../shared/middleware/metrics");
const { initializeTracing, tracingMiddleware } = require("../../shared/middleware/tracing");
const redisService = require("./services/redisService");
const kafkaService = require("./services/kafkaService");
const chatRoutes = require("./routes/chatRoutes");

const app = express();

// Initialize distributed tracing
const SERVICE_NAME = 'chat-service';
initializeTracing(SERVICE_NAME);

// Request ID middleware (must be first)
app.use(requestIdMiddleware);

// Tracing middleware (after request ID)
app.use(tracingMiddleware(SERVICE_NAME));

// Metrics middleware
app.use(metricsMiddleware(SERVICE_NAME));

// API Versioning middleware (before routes)
app.use(apiVersioning);

// Configure CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Version']
}));

app.use(express.json());

// Global rate limiting
app.use(apiLimiter);

// Health check endpoint (no versioning)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'chat-service' });
});

// Version info endpoint
app.get('/api/version', (req, res) => {
  const { getVersionInfo } = require("../../shared/config/apiVersions");
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
app.use("/api/chat", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) return;
  next();
}, validateVersion(['v1']), chatRoutes);

app.use("/api/v1/chat", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) return;
  next();
}, validateVersion(['v1']), chatRoutes);

// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

// Connect to database, Redis, Kafka and start server
const startServer = async () => {
  try {
    console.log('📡 Chat Service: Attempting to connect to MongoDB...');
    await Connection();
    
    // Test Redis connection
    console.log('📡 Chat Service: Testing Redis connection...');
    const redisConnected = await redisService.testConnection();
    if (redisConnected) {
      console.log('✅ Redis connection successful');
      
      // Subscribe to chat update channels
      await redisService.subscribeToChannel('chat:updates', (data) => {
        console.log('📨 Received chat update via Redis:', data.event);
      });
    } else {
      console.warn('⚠️ Redis connection failed, continuing without Redis');
    }
    
    // Initialize Kafka
    console.log('📡 Chat Service: Initializing Kafka...');
    await kafkaService.initialize();
    
    const PORT = process.env.CHAT_SERVICE_PORT || 5002;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Chat Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start chat service:', error);
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
    
    // Close Redis connections
    await redisService.redisClient.quit();
    await redisService.publisher.quit();
    await redisService.subscriber.quit();
    
    console.log('✅ Chat Service shut down gracefully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('🚀 Starting Chat Service...');
startServer();

