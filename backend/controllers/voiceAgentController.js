const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const dns = require("dns");
const https = require("https");
const jwt = require("jsonwebtoken");

const {
  answerChat,
  askWorkspace,
  coordinateEvent,
  planTasks,
} = require("../services/aiServiceClient");
const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const { getWorkspaceForMember } = require("../services/workspaceAccessService");
const {
  loadAgentTaskState,
} = require("../services/workspaceKnowledgeService");
const { syncWorkspace } = require("./aiControllers");

try {
  dns.setDefaultResultOrder("ipv4first");
} catch (error) {
  console.warn("Could not set DNS result order for voice agent:", error.message);
}

const liveKitRoomName = (workspaceId, userId) =>
  `workspace-${workspaceId}-voice-${userId}`;
const createLiveKitToken = ({ identity, name, room, canPublish = true }) =>
  jwt.sign(
    {
      sub: identity,
      name,
      video: {
        room,
        roomJoin: true,
        canPublish,
        canSubscribe: true,
        canPublishData: true,
      },
    },
    process.env.LIVEKIT_API_SECRET,
    {
      algorithm: "HS256",
      issuer: process.env.LIVEKIT_API_KEY,
      expiresIn: "1h",
    }
  );
const VOICE_AGENT_NAME = "Vconnect";
const VOICE_AGENT_GREETING =
  "Hi, I am Vconnect, your ComConnect voice agent. I can help plan work, allocate tasks using the workspace AI agents, create tasks after your approval, answer workspace chat questions, and call the human helpline if you need support.";

const deepgramRequest = ({ path, headers, body, timeout = 30000 }) =>
  new Promise((resolve, reject) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
    const request = https.request(
      {
        hostname: "api.deepgram.com",
        path,
        method: "POST",
        family: 4,
        timeout,
        headers: {
          ...headers,
          "Content-Length": payload.length,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    request.on("timeout", () => request.destroy(new Error("Deepgram request timed out")));
    request.on("error", reject);
    request.end(payload);
  });

const createApprovalToken = ({ workspaceId, userId, tasks, source }) =>
  jwt.sign(
    {
      purpose: "apply-ai-task-plan",
      workspaceId,
      userId,
      source,
      executionId: crypto.randomUUID(),
      tasks,
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );

const normalizeAgentTasks = (tasks, fallbackEmail) =>
  (tasks || []).map((task) => ({
    heading: task.heading.trim(),
    description: task.description.trim(),
    assigneeEmail: task.assignee_email || task.assigneeEmail || fallbackEmail,
    priority: task.priority || "medium",
  }));

const loadRecentWorkspaceChatMessages = async (workspaceId) => {
  const chats = await Chat.find({ workspace: workspaceId })
    .select("_id chatName")
    .lean();
  if (!chats.length) return [];

  const chatNames = new Map(
    chats.map((chat) => [chat._id.toString(), chat.chatName || "Workspace chat"])
  );
  const messages = await Message.find({
    chat: { $in: chats.map((chat) => chat._id) },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("sender", "name email")
    .lean();

  return [...messages].reverse().map((message) => ({
    sender: message.sender?.name || "Unknown",
    content: message.content,
    created_at: message.createdAt?.toISOString(),
    chat: chatNames.get(message.chat?.toString()) || "Workspace chat",
  }));
};

const synthesizeSpeech = async (text) => {
  if (!process.env.DEEPGRAM_TTS_API_KEY || !text?.trim()) return null;
  try {
    const response = await deepgramRequest({
      path: "/v1/speak?model=aura-2-thalia-en",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_TTS_API_KEY}`,
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 1800) }),
    });
    if (!response.ok) return null;
    return {
      mimeType: "audio/mpeg",
      data: response.body.toString("base64"),
    };
  } catch (error) {
    console.error("Deepgram TTS failed:", error.message);
    return null;
  }
};

const transcribeBuffer = async (audio, mimeType) => {
  if (!process.env.DEEPGRAM_STT_API_KEY) {
    const error = new Error("Deepgram STT is not configured");
    error.statusCode = 503;
    throw error;
  }
  const response = await deepgramRequest({
    path: "/v1/listen?model=nova-2&smart_format=true&punctuate=true",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_STT_API_KEY}`,
      "Content-Type": mimeType || "audio/webm",
    },
    body: audio,
  });
  const body = JSON.parse(response.body.toString("utf8") || "{}");
  if (!response.ok) {
    const error = new Error(body.err_msg || "Deepgram transcription failed");
    error.statusCode = 502;
    throw error;
  }
  return (
    body.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || ""
  );
};

const detectIntent = (transcript) => {
  const text = transcript.toLowerCase();
  if (/\b(call|phone|helpline|human|support)\b/.test(text)) return "human_call";
  if (/\b(event|readiness|ready|blocked|blocker|risk|coordinate|coordinator)\b/.test(text)) {
    return "event";
  }
  if (/\b(task|tasks|assign|allocate|todo|to-do|follow[- ]?up|plan|checklist)\b/.test(text)) {
    return "task";
  }
  return "ask";
};

const createVoiceSession = asyncHandler(async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) {
    res.status(400);
    throw new Error("workspaceId is required");
  }
  await getWorkspaceForMember(workspaceId, req.user._id);
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    res.status(503);
    throw new Error("LiveKit is not configured");
  }

  const room = liveKitRoomName(workspaceId, req.user._id);
  const identity = req.user._id.toString();
  const token = createLiveKitToken({
    identity,
    name: req.user.name || req.user.email,
    room,
  });
  const agentToken = createLiveKitToken({
    identity: `${VOICE_AGENT_NAME.toLowerCase()}-${identity}`,
    name: VOICE_AGENT_NAME,
    room,
    canPublish: false,
  });

  res.json({ url: process.env.LIVEKIT_URL, room, token, agentToken });
});

const greetVoiceAgent = asyncHandler(async (req, res) => {
  const { workspaceId } = req.body;
  if (!workspaceId) {
    res.status(400);
    throw new Error("workspaceId is required");
  }
  await getWorkspaceForMember(workspaceId, req.user._id);
  res.json({
    agentName: VOICE_AGENT_NAME,
    message: VOICE_AGENT_GREETING,
    audio: await synthesizeSpeech(VOICE_AGENT_GREETING),
  });
});

const transcribeVoice = asyncHandler(async (req, res) => {
  const rawAudio = req.body.audio || "";
  const mimeType = req.body.mimeType || "audio/webm";
  const base64 = rawAudio.includes(",") ? rawAudio.split(",").pop() : rawAudio;
  if (!base64) {
    res.status(400);
    throw new Error("audio is required");
  }
  const transcript = await transcribeBuffer(Buffer.from(base64, "base64"), mimeType);
  res.json({ transcript });
});

const createTwilioHumanCall = async () => {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
    HUMAN_AGENT_NUMBER,
  } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !HUMAN_AGENT_NUMBER) {
    const error = new Error("Helpline calling is not configured");
    error.statusCode = 503;
    throw error;
  }
  const twiml = [
    "<Response>",
    "<Say voice=\"alice\">ComConnect helpline request. A workspace user needs human support.</Say>",
    "</Response>",
  ].join("");
  const params = new URLSearchParams({
    To: HUMAN_AGENT_NUMBER,
    From: TWILIO_FROM_NUMBER,
    Twiml: twiml,
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "Helpline call failed");
    error.statusCode = 502;
    throw error;
  }
  return { callSid: body.sid, status: body.status };
};

const callHumanAgent = asyncHandler(async (req, res) => {
  const call = await createTwilioHumanCall();
  const message = "Calling the ComConnect human helpline now.";
  res.json({ message, call, audio: await synthesizeSpeech(message) });
});

const runVoiceCommand = asyncHandler(async (req, res) => {
  const transcript = req.body.transcript?.trim();
  if (!transcript) {
    res.status(400);
    throw new Error("transcript is required");
  }

  const workspace = await getWorkspaceForMember(req.params.workspaceId, req.user._id);
  const intent = req.body.intent || detectIntent(transcript);

  if (intent === "human_call") {
    const call = await createTwilioHumanCall();
    const message = "I am calling the ComConnect human helpline now.";
    return res.json({
      intent,
      transcript,
      message,
      call,
      audio: await synthesizeSpeech(message),
    });
  }

  await syncWorkspace(workspace);
  const tasks = await loadAgentTaskState(workspace._id);
  const members = workspace.users.map(({ name, email }) => ({ name, email }));

  if (intent === "task") {
    const result = await planTasks(workspace._id.toString(), transcript, members, tasks);
    const plannedTasks = normalizeAgentTasks(result.plan.tasks, req.user.email);
    const message = `${result.plan.summary} I drafted ${plannedTasks.length} task${
      plannedTasks.length === 1 ? "" : "s"
    } for approval.`;
    return res.json({
      intent,
      transcript,
      message,
      plan: { ...result.plan, tasks: plannedTasks },
      approvalToken: createApprovalToken({
        workspaceId: workspace._id.toString(),
        userId: req.user._id.toString(),
        tasks: plannedTasks,
        source: "voice-task-agent",
      }),
      agent: result.agent,
      audio: await synthesizeSpeech(message),
    });
  }

  if (intent === "event") {
    const result = await coordinateEvent(
      workspace._id.toString(),
      transcript,
      members,
      tasks
    );
    const proposedTasks = normalizeAgentTasks(
      result.report.proposed_tasks,
      req.user.email
    );
    const message = `${result.report.answer} Readiness is ${result.report.readiness}. ${
      proposedTasks.length
        ? `I drafted ${proposedTasks.length} follow-up task${proposedTasks.length === 1 ? "" : "s"} for approval.`
        : ""
    }`;
    return res.json({
      intent,
      transcript,
      message,
      report: { ...result.report, proposed_tasks: proposedTasks },
      approvalToken: proposedTasks.length
        ? createApprovalToken({
            workspaceId: workspace._id.toString(),
            userId: req.user._id.toString(),
            tasks: proposedTasks,
            source: "voice-event-agent",
          })
        : null,
      agent: result.agent,
      audio: await synthesizeSpeech(message),
    });
  }

  const recentMessages = await loadRecentWorkspaceChatMessages(workspace._id);
  const result = recentMessages.length
    ? await answerChat("Workspace recent chats", transcript, recentMessages)
    : await askWorkspace(workspace._id.toString(), transcript);
  const message = result.answer || "I could not find that in recent workspace chats.";
  res.json({
    intent: "ask",
    transcript,
    message,
    answer: result,
    audio: await synthesizeSpeech(message),
  });
});

module.exports = {
  callHumanAgent,
  createVoiceSession,
  greetVoiceAgent,
  runVoiceCommand,
  transcribeVoice,
};
