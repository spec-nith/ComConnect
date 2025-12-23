/**
 * Message Service Routes - Version 1
 */

const express = require("express");
const {
  allMessages,
  sendMessage,
  deleteAllMessages,
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages);
router.route("/").post(protect, sendMessage);
router.delete('/deleteAll', deleteAllMessages);

module.exports = router;

