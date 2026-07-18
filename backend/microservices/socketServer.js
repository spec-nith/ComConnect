const http = require("http");
const os = require("os");
const jwt = require("jsonwebtoken");
const { createAdapter } = require("@socket.io/redis-adapter");
const { Server } = require("socket.io");
const { parseOrigins } = require("./runtime");
const {
  closeRedis,
  connectRedis,
  createRedisClient,
} = require("../services/redisClient");
const {
  getPresenceService,
  presenceTtlSeconds,
} = require("../services/presenceService");
const Chat = require("../models/chatModel");
const User = require("../models/userModel");
const Workspace = require("../models/workspaceModel");

const locationRoom = (workspaceId) => `workspace-location:${workspaceId}`;
const publicLocation = ({ socketId, ...location }) => location;
const LOCATION_TTL_MS = 120000;

const createSocketServer = async (app) => {
  const server = http.createServer(app);
  const pubClient = createRedisClient("socket-adapter-publisher");
  const subClient = createRedisClient("socket-adapter-subscriber");
  await Promise.all([connectRedis(pubClient), connectRedis(subClient)]);

  const io = new Server(server, {
    pingTimeout: 60000,
    cors: {
      origin: parseOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });
  io.adapter(createAdapter(pubClient, subClient));

  const presence = await getPresenceService();
  const serverId = process.env.SOCKET_SERVER_ID || os.hostname();
  const refreshIntervalMs = Math.max(10000, Math.floor(presenceTtlSeconds * 500));
  const workspaceLocations = new Map();
  const pruneWorkspaceLocations = (workspaceId) => {
    const locations = workspaceLocations.get(workspaceId);
    if (!locations) return [];
    const now = Date.now();
    for (const [userId, location] of locations.entries()) {
      if (
        !location.timestamp ||
        now - location.timestamp > LOCATION_TTL_MS ||
        (location.socketId && !io.sockets.sockets.has(location.socketId))
      ) {
        locations.delete(userId);
        io.to(locationRoom(workspaceId)).emit("user-location-removed", {
          userId,
          workspaceId,
        });
      }
    }
    if (!locations.size) {
      workspaceLocations.delete(workspaceId);
      return [];
    }
    return [...locations.values()];
  };
  const pruneLocationInterval = setInterval(() => {
    for (const workspaceId of workspaceLocations.keys()) {
      pruneWorkspaceLocations(workspaceId);
    }
  }, 30000);
  pruneLocationInterval.unref?.();

  io.use((socket, next) => {
    const authorization = socket.handshake.headers.authorization;
    const token =
      socket.handshake.auth?.token ||
      (authorization?.startsWith("Bearer ") ? authorization.slice(7) : null);
    if (!token) return next(new Error("Authentication required"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id.toString();
      return next();
    } catch {
      return next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket) => {
    let heartbeat;
    socket.data.locationWorkspaces = new Set();

    const removeSharedLocation = (workspaceId) => {
      const locations = workspaceLocations.get(workspaceId);
      const current = locations?.get(socket.userId);
      if (!current || current.socketId !== socket.id) return;

      locations.delete(socket.userId);
      if (!locations.size) workspaceLocations.delete(workspaceId);
      io.to(locationRoom(workspaceId)).emit("user-location-removed", {
        userId: socket.userId,
        workspaceId,
      });
    };

    socket.on("setup", async () => {
      if (heartbeat) {
        return socket.emit("connected");
      }
      socket.join(socket.userId);
      const state = await presence.register({
        userId: socket.userId,
        socketId: socket.id,
        serverId,
      });
      io.emit("presence changed", state);
      socket.emit("connected", state);
      heartbeat = setInterval(() => {
        presence.refresh(socket.id).catch((error) => {
          console.error("Presence refresh failed:", error.message);
        });
      }, refreshIntervalMs);
      heartbeat.unref?.();
    });

    socket.on("join chat", (room) => {
      if (room) socket.join(room);
    });
    socket.on("typing", (room) => socket.to(room).emit("typing"));
    socket.on("stop typing", (room) => socket.to(room).emit("stop typing"));
    socket.on("new message", (message) => {
      const senderId = message?.sender?._id;
      for (const user of message?.chat?.users || []) {
        if (user._id?.toString() !== senderId?.toString()) {
          socket.to(user._id.toString()).emit("message recieved", message);
        }
      }
    });
    socket.on("messages read", async ({ chatId, messageIds } = {}) => {
      if (!chatId || !Array.isArray(messageIds) || messageIds.length === 0) return;
      try {
        const chat = await Chat.exists({ _id: chatId, users: socket.userId });
        if (!chat) return;
        socket.to(chatId.toString()).emit("messages read", {
          chatId: chatId.toString(),
          messageIds: messageIds.map((messageId) => messageId.toString()),
          readBy: socket.userId,
        });
      } catch (error) {
        console.error("Message read receipt failed:", error.message);
      }
    });
    socket.on("join-location-workspace", async ({ workspaceId } = {}) => {
      if (!workspaceId) return;
      try {
        const [workspace, user] = await Promise.all([
          Workspace.exists({ _id: workspaceId, users: socket.userId }),
          User.findById(socket.userId).select("name pic"),
        ]);
        if (!workspace || !user) {
          return socket.emit("location-error", {
            message: "You do not have access to this workspace map",
          });
        }

        socket.data.locationWorkspaces.add(workspaceId);
        socket.data.locationUser = {
          userName: user.name,
          userPic: user.pic,
        };
        socket.join(locationRoom(workspaceId));
        socket.emit("location-workspace-joined", { workspaceId });
        socket.emit(
          "other-users-location",
          pruneWorkspaceLocations(workspaceId).map((location) =>
            publicLocation(location)
          )
        );
      } catch (error) {
        console.error("Location workspace join failed:", error.message);
      }
    });
    socket.on("location-update", (payload = {}) => {
      const workspaceId = payload.workspaceId?.toString();
      const latitude = Number(payload.latitude);
      const longitude = Number(payload.longitude);
      const accuracy = Number(payload.accuracy);
      if (
        !workspaceId ||
        !socket.data.locationWorkspaces.has(workspaceId) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return;
      }

      const location = {
        userId: socket.userId,
        userName: socket.data.locationUser?.userName || "Workspace member",
        userPic: socket.data.locationUser?.userPic,
        workspaceId,
        latitude,
        longitude,
        accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null,
        timestamp: Date.now(),
        socketId: socket.id,
      };
      const locations = workspaceLocations.get(workspaceId) || new Map();
      for (const [userId, existing] of locations.entries()) {
        if (
          !existing.timestamp ||
          Date.now() - existing.timestamp > LOCATION_TTL_MS ||
          (existing.socketId && !io.sockets.sockets.has(existing.socketId))
        ) {
          locations.delete(userId);
        }
      }
      locations.set(socket.userId, location);
      workspaceLocations.set(workspaceId, locations);
      socket
        .to(locationRoom(workspaceId))
        .emit("user-location-updated", publicLocation(location));
    });
    socket.on("location-sharing-stopped", ({ workspaceId } = {}) => {
      if (workspaceId) removeSharedLocation(workspaceId.toString());
    });
    socket.on("leave-location-workspace", ({ workspaceId } = {}) => {
      if (!workspaceId) return;
      const normalizedWorkspaceId = workspaceId.toString();
      removeSharedLocation(normalizedWorkspaceId);
      socket.data.locationWorkspaces.delete(normalizedWorkspaceId);
      socket.leave(locationRoom(normalizedWorkspaceId));
    });
    socket.on("disconnect", async () => {
      clearInterval(heartbeat);
      for (const workspaceId of socket.data.locationWorkspaces) {
        removeSharedLocation(workspaceId);
      }
      try {
        const state = await presence.unregister(socket.id);
        if (state) io.emit("presence changed", state);
      } catch (error) {
        console.error("Presence cleanup failed:", error.message);
      }
    });
  });

  server.comconnectCloseDependencies = async () => {
    clearInterval(pruneLocationInterval);
    await io.close();
    await Promise.all([closeRedis(pubClient), closeRedis(subClient), presence.close()]);
  };
  return server;
};

module.exports = createSocketServer;
