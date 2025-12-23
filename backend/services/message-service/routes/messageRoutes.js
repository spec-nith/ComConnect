/**
 * Message Service Routes
 * Defaults to v1 for backward compatibility
 */

const express = require("express");
const v1Routes = require("./messageRoutes.v1");
const { createVersionedRouter } = require("../../shared/middleware/apiVersioning");

const router = express.Router();

// Versioned routes
const versionedRouter = createVersionedRouter({
  v1: v1Routes
});

// Apply versioned routing
router.use(versionedRouter);

module.exports = router;

