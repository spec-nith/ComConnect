/**
 * User Service Routes - Version 1
 * This file contains the v1 implementation of user routes
 */

const express = require("express");
const {
  registerUser,
  authUser,
  allUsers,
  deleteAllUsers,
} = require("../controllers/userControllers");
const { protect } = require("../middleware/authMiddleware");
const { authLimiter, registerLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// V1 Routes
router.route("/").get(protect, allUsers);
router.route("/").delete(protect, deleteAllUsers);
router.route("/").post(registerLimiter, registerUser);
router.post("/login", authLimiter, authUser);

module.exports = router;

