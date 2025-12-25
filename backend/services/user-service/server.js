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

const Connection = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const requestIdMiddleware = require("./shared/middleware/requestId");
const { apiLimiter } = require("./shared/middleware/rateLimiter");
const { apiVersioning, validateVersion } = require("./shared/middleware/apiVersioning");
const { addDeprecationHeaders } = require("./shared/config/apiVersions");
const { metricsMiddleware, getMetrics } = require("./shared/middleware/metrics");
const { initializeTracing, tracingMiddleware } = require("./shared/middleware/tracing");
const userRoutes = require("./routes/userRoutes");

const app = express();

// Initialize distributed tracing
const SERVICE_NAME = 'user-service';
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
  res.status(200).json({ status: 'ok', service: 'user-service' });
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
// Support both /api/user and /api/v1/user
app.use("/api/user", (req, res, next) => {
  // Add deprecation headers if needed
  if (!addDeprecationHeaders(req, res)) {
    return; // Response already sent if version is sunset
  }
  next();
}, validateVersion(['v1']), userRoutes);

app.use("/api/v1/user", (req, res, next) => {
  if (!addDeprecationHeaders(req, res)) {
    return;
  }
  next();
}, validateVersion(['v1']), userRoutes);

// Error Handling middlewares
app.use(notFound);
app.use(errorHandler);

// Connect to database and start server
let server;
const startServer = async () => {
  try {
    console.log('📡 User Service: Attempting to connect to PostgreSQL...');
    await Connection();
    
    const PORT = process.env.USER_SERVICE_PORT || 5001;
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ User Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start user service:', error);
    setTimeout(() => {
      console.log('🔄 Retrying server start...');
      startServer();
    }, 5000);
  }
};

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log('🚀 Starting User Service...');
startServer();

