const express = require("express");
const {
  allMessages,
  markMessagesRead,
  sendMessage,
} = require("../controllers/messageControllers");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.route("/:chatId").get(protect, allMessages).put(protect, markMessagesRead);
router.route("/").post(protect, sendMessage);

module.exports = router;
