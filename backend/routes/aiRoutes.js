const express = require("express");
const {
  applyWorkspaceTaskPlan,
  askWorkspaceAssistant,
  coordinateWorkspaceEvent,
  createWorkspaceTaskPlan,
  summarizeGroupChat,
  syncWorkspaceKnowledge,
} = require("../controllers/aiControllers");
const {
  callHumanAgent,
  createVoiceSession,
  greetVoiceAgent,
  runVoiceCommand,
  transcribeVoice,
} = require("../controllers/voiceAgentController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);
router.post("/workspaces/:workspaceId/sync", syncWorkspaceKnowledge);
router.post("/workspaces/:workspaceId/ask", askWorkspaceAssistant);
router.post("/workspaces/:workspaceId/task-plan", createWorkspaceTaskPlan);
router.post("/workspaces/:workspaceId/task-plan/apply", applyWorkspaceTaskPlan);
router.post("/workspaces/:workspaceId/event-coordinator", coordinateWorkspaceEvent);
router.post("/workspaces/:workspaceId/voice-command", runVoiceCommand);
router.post("/voice/livekit-token", createVoiceSession);
router.post("/voice/greeting", greetVoiceAgent);
router.post("/voice/transcribe", transcribeVoice);
router.post("/voice/call-human", callHumanAgent);
router.post("/chats/:chatId/summary", summarizeGroupChat);

module.exports = router;
