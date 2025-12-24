/**
 * User Service Routes
 * Defaults to v1 for backward compatibility
 */

const express = require("express");
const v1Routes = require("./userRoutes.v1");
const v2Routes = require("./userRoutes.v2");
const { createVersionedRouter } = require("../shared/middleware/apiVersioning");

const router = express.Router();

// Versioned routes
const versionedRouter = createVersionedRouter({
  v1: v1Routes,
  v2: v2Routes
});

// Apply versioned routing
router.use(versionedRouter);

module.exports = router;

