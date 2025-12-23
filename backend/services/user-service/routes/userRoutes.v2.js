/**
 * User Service Routes - Version 2
 * This is a placeholder for future v2 implementation
 * When v2 is ready, implement new endpoints here
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

// V2 Routes (currently same as v1, but can be extended)
// Example: Enhanced response format, additional fields, etc.
router.route("/").get(protect, (req, res, next) => {
  // V2 could return additional metadata
  req.apiVersion = 'v2';
  next();
}, allUsers);

router.route("/").delete(protect, deleteAllUsers);
router.route("/").post(registerLimiter, registerUser);
router.post("/login", authLimiter, authUser);

module.exports = router;

