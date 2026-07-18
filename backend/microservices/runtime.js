const crypto = require("crypto");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const mongoose = require("mongoose");

const connectDatabase = require("../config/db");
const { errorHandler, notFound } = require("../middleware/errorMiddleware");
const {
  closeAnalytics,
  createAnalyticsHttpMiddleware,
} = require("../services/opensearchAnalyticsService");

[
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../.env"),
].forEach((envPath) => dotenv.config({ path: envPath, override: false }));

const parseOrigins = () =>
  (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin, allowedOrigins) => {
  if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const { hostname, protocol } = new URL(origin);
      return (
        ["http:", "https:"].includes(protocol) &&
        ["localhost", "127.0.0.1", "::1"].includes(hostname)
      );
    } catch {
      return false;
    }
  }

  return false;
};

const createServiceApp = (serviceName) => {
  const app = express();
  const allowedOrigins = parseOrigins();

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin, allowedOrigins)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin is not allowed by CORS: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    })
  );
  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: serviceName,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? "ready" : "not-ready",
      service: serviceName,
      dependencies: { mongodb: databaseReady },
    });
  });
  app.use(createAnalyticsHttpMiddleware(serviceName));

  return app;
};

const attachErrorHandling = (app) => {
  app.use(notFound);
  app.use(errorHandler);
};

const installShutdownHandlers = (server, serviceName, closeDependencies = async () => {}) => {
  const shutdown = async (signal) => {
    console.log(JSON.stringify({ level: "info", service: serviceName, signal, message: "shutting down" }));
    server.close(async () => {
      await closeDependencies();
      await mongoose.connection.close();
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
};

const startHttpService = async ({
  serviceName,
  port,
  registerRoutes,
  createServer,
  startDependencies,
  closeDependencies,
}) => {
  process.env.SERVICE_NAME = process.env.SERVICE_NAME || serviceName;
  const app = createServiceApp(serviceName);
  registerRoutes(app);
  attachErrorHandling(app);

  await connectDatabase();
  const dependencyCleanup = startDependencies
    ? await startDependencies(app)
    : async () => {};
  const server = createServer
    ? await createServer(app)
    : app.listen(port, "0.0.0.0");

  if (createServer) {
    server.listen(port, "0.0.0.0");
  }

  server.on("listening", () => {
    console.log(JSON.stringify({ level: "info", service: serviceName, port, message: "service started" }));
  });
  server.on("error", (error) => {
    console.error(JSON.stringify({ level: "error", service: serviceName, message: error.message }));
    process.exitCode = 1;
  });

  installShutdownHandlers(server, serviceName, async () => {
    await dependencyCleanup?.();
    await server.comconnectCloseDependencies?.();
    await closeDependencies?.();
    await closeAnalytics();
  });
  return { app, server };
};

module.exports = {
  attachErrorHandling,
  createServiceApp,
  parseOrigins,
  startHttpService,
};
