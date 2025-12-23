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
const NotificationService = require("./services/notificationService");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const requestIdMiddleware = require("../../shared/middleware/requestId");
const { apiLimiter } = require("../../shared/middleware/rateLimiter");
const { apiVersioning, validateVersion } = require("../../shared/middleware/apiVersioning");
const { addDeprecationHeaders } = require("../../shared/config/apiVersions");
const { metricsMiddleware, getMetrics } = require("../../shared/middleware/metrics");
const { initializeTracing, tracingMiddleware } = require("../../shared/middleware/tracing");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// Initialize distributed tracing
const SERVICE_NAME = 'notification-service';
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
  res.status(200).json({ status: 'ok', service: 'notification-service' });
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
app.use("/api/notification", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) return;
  next();
}, validateVersion(['v1']), notificationRoutes);

app.use("/api/v1/notification", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) return;
  next();
}, validateVersion(['v1']), notificationRoutes);

// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

// Test connections on startup
async function testConnections() {
  try {
    const connectionStatus = await NotificationService.testConnections();
    console.log('Connection Test Results:', connectionStatus);
    
    if (connectionStatus.redis) {
      console.log('✅ Redis connection successful');
    } else {
      console.log('❌ Redis connection failed');
    }
    
    console.log('✅ All service connections tested');
  } catch (error) {
    console.error('❌ Service connection test failed:', error);
  }
}

// Call this before starting your Express server
testConnections();

// Connect to database and start server
const startServer = async () => {
  try {
    console.log('📡 Notification Service: Attempting to connect to MongoDB...');
    await Connection();
    
    const PORT = process.env.NOTIFICATION_SERVICE_PORT || 5006;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Notification Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start notification service:', error);
    setTimeout(() => {
      console.log('🔄 Retrying server start...');
      startServer();
    }, 5000);
  }
};

console.log('🚀 Starting Notification Service...');
startServer();

