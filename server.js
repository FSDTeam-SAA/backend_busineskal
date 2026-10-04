import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import router from "./mainroute/index.js";
import { createServer } from "http";
import {
  getChatRoom,
  getNotificationRoom,
  initSocket,
} from "./utils/socket.js";
import { verifyToken } from "./utils/authToken.js";
import { User } from "./model/user.model.js";
import { Chat } from "./model/chat.model.js";
import { Call } from "./model/call.model.js";
import { createNotification, getUserDisplayName } from "./utils/notification.js";

import globalErrorHandler from "./middleware/globalErrorHandler.js";
import notFound from "./middleware/notFound.js";
import { corsOptions } from "./utils/corsOptions.js";

const app = express();

app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));

const server = createServer(app);
export const io = initSocket(server);

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/public", express.static("public"));

// Mount the main router
app.use("/api/v1", router);

// Basic route for testing
app.get("/", (req, res) => {
  res.send("Server is running...!!");
});

app.get("/health", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ success: ready, database: ready ? "connected" : "unavailable" });
});

app.use(globalErrorHandler);
app.use(notFound);

// userId -> Set<socketId>. Tracks live presence across multiple devices/tabs.
const onlineUsers = new Map();
const activeRingTimers = new Map();
const CALL_RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS || 30000);

const parseBearerToken = (rawValue = "") => {
  if (typeof rawValue !== "string" || rawValue.trim() === "") return null;
  if (rawValue.startsWith("Bearer ")) {
    return rawValue.slice(7).trim();
  }
  return rawValue.trim();
};

const safeString = (value) => (value == null ? "" : String(value).trim());

const stopRingTimer = (callId) => {
  const timer = activeRingTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    activeRingTimers.delete(callId);
  }
};

const emitToUserRoom = (event, userId, payload) => {
  if (!userId) return;
  io.to(getChatRoom(userId)).emit(event, payload);
};

const isParticipant = (call, userId) => {
  const normalized = safeString(userId);
  return (
    call?.caller?.toString() === normalized || call?.callee?.toString() === normalized
  );
};

const getPeerUserId = (call, userId) => {
  const normalized = safeString(userId);
  if (call?.caller?.toString() === normalized) return call.callee.toString();
  if (call?.callee?.toString() === normalized) return call.caller.toString();
  return "";
};

const computeDurationSeconds = (call, endedAt = new Date()) => {
  if (!call?.answeredAt) return 0;
  return Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(call.answeredAt).getTime()) / 1000)
  );
};

const ensureCallableChat = async ({ callerId, calleeId, chatId }) => {
  const participantPairs = [
    { seller: callerId, user: calleeId },
    { seller: calleeId, user: callerId },
  ];

  return Chat.findOne({
    ...(chatId ? { _id: chatId } : {}),
    $or: [{ seller: callerId }, { user: callerId }],
    $and: [{ $or: participantPairs }],
  }).select("_id seller user");
};

const updateCallState = async ({
  call,
  status,
  endedBy = null,
  endReason = "",
  answeredAt = undefined,
  endedAt = undefined,
}) => {
  if (!call) return null;

  if (answeredAt !== undefined) {
    call.answeredAt = answeredAt;
  }

  if (endedAt !== undefined) {
    call.endedAt = endedAt;
    call.durationSeconds = computeDurationSeconds(call, endedAt);
  }

  if (endedBy !== undefined) {
    call.endedBy = endedBy;
  }

  call.status = status;
  call.endReason = endReason;
  await call.save();
  return call;
};

const scheduleMissedCallTimeout = (call, callerName) => {
  stopRingTimer(call.callId);

  const timer = setTimeout(async () => {
    try {
      const freshCall = await Call.findOne({ callId: call.callId });
      if (!freshCall || freshCall.status !== "ringing") return;

      const endedAt = new Date();
      await updateCallState({
        call: freshCall,
        status: "missed",
        endedAt,
        endReason: "timeout",
      });

      const callerId = freshCall.caller.toString();
      const calleeId = freshCall.callee.toString();
      const basePayload = {
        callId: freshCall.callId,
        callType: freshCall.callType,
        chatId: freshCall.chat?.toString() || "",
        reason: "timeout",
      };

      emitToUserRoom("call:missed", callerId, {
        ...basePayload,
        toUserId: callerId,
        fromUserId: calleeId,
      });

      emitToUserRoom("call:missed", calleeId, {
        ...basePayload,
        toUserId: calleeId,
        fromUserId: callerId,
      });

      await createNotification({
        user: calleeId,
        actor: freshCall.caller,
        chat: freshCall.chat,
        type: "missed_call",
        title: "Missed call",
        message: `Missed ${freshCall.callType} call from ${callerName}.`,
        metadata: {
          callId: freshCall.callId,
          callType: freshCall.callType,
          chatId: freshCall.chat?.toString() || "",
        },
      });
    } catch (error) {
      console.error("Failed to handle missed call timeout:", error);
    } finally {
      stopRingTimer(call.callId);
    }
  }, CALL_RING_TIMEOUT_MS);

  activeRingTimers.set(call.callId, timer);
};

const markUserOnline = (userId, socket) => {
  if (!userId) return;
  const key = String(userId);
  let sockets = onlineUsers.get(key);
  const wasOffline = !sockets || sockets.size === 0;
  if (!sockets) {
    sockets = new Set();
    onlineUsers.set(key, sockets);
  }
  sockets.add(socket.id);
  socket.data.userId = key;
  if (wasOffline) {
    io.emit("presence:online", { userId: key });
  }
};

const markSocketOffline = (socket) => {
  const userId = socket.data?.userId;
  if (!userId) return;
  const sockets = onlineUsers.get(userId);
  if (!sockets) return;
  sockets.delete(socket.id);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    io.emit("presence:offline", { userId });
  }
};

io.use(async (socket, next) => {
  try {
    const headerToken = parseBearerToken(
      socket.handshake.headers?.authorization || ""
    );
    const authToken = parseBearerToken(socket.handshake.auth?.token || "");
    const token = headerToken || authToken;

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const decoded = verifyToken(token, process.env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded._id).select(
      "_id name storeName email role"
    );

    if (!user) {
      return next(new Error("Unauthorized"));
    }

    socket.data.userId = user._id.toString();
    socket.data.user = user;
    next();
  } catch (error) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);
  const authenticatedUserId = safeString(socket.data?.userId);
  const authenticatedUser = socket.data?.user;

  const joinUserRooms = () => {
    if (authenticatedUserId) {
      socket.join(getChatRoom(authenticatedUserId));
      socket.join(getNotificationRoom(authenticatedUserId));
      markUserOnline(authenticatedUserId, socket);
      socket.emit("presence:list", { userIds: Array.from(onlineUsers.keys()) });
      console.log(
        `Client ${socket.id} joined rooms for user: ${authenticatedUserId}`
      );
    }
  };

  const sendCallError = (code, message, callId = "") => {
    emitToUserRoom("call:error", authenticatedUserId, {
      toUserId: authenticatedUserId,
      fromUserId: authenticatedUserId,
      callId,
      code,
      message,
    });
  };

  const findAuthorizedCall = async (callId) => {
    const call = await Call.findOne({ callId });
    if (!call || !isParticipant(call, authenticatedUserId)) return null;
    return call;
  };

  joinUserRooms();

  socket.on("joinChatRoom", () => {
    joinUserRooms();
  });

  socket.on("joinNotificationRoom", () => {
    joinUserRooms();
  });

  socket.on("joinUserRoom", () => {
    joinUserRooms();
  });

  socket.on("joinNotification", () => {
    joinUserRooms();
  });

  socket.on("joinThreadRoom", async (chatId) => {
    const normalizedChatId = safeString(chatId);
    if (!normalizedChatId || !authenticatedUserId) return;

    const chat = await Chat.exists({
      _id: normalizedChatId,
      $or: [{ user: authenticatedUserId }, { seller: authenticatedUserId }],
    });

    if (chat) {
      socket.join(`thread_${normalizedChatId}`);
    }
  });

  socket.on("presence:request", () => {
    socket.emit("presence:list", { userIds: Array.from(onlineUsers.keys()) });
  });

  socket.on("joinAlerts", () => {
    socket.join("alerts");
    console.log(`Client ${socket.id} joined alerts room`);
  });

  const isUserOnline = (userId) => {
    if (!userId) return false;
    const sockets = onlineUsers.get(String(userId));
    return !!sockets && sockets.size > 0;
  };

  const relayCallEvent = (event, toUserId, payload) => {
    if (!toUserId) return;
    emitToUserRoom(event, toUserId, payload);
  };

  socket.on("call:request", async (payload) => {
    try {
      const callId = safeString(payload?.callId);
      const toUserId = safeString(payload?.toUserId);
      const chatId = safeString(payload?.chatId);
      const callType = safeString(payload?.callType) === "video" ? "video" : "audio";

      if (!callId || !toUserId || !authenticatedUserId) {
        sendCallError("invalid_call_request", "Call payload is incomplete", callId);
        return;
      }

      if (safeString(payload?.fromUserId) &&
          safeString(payload.fromUserId) !== authenticatedUserId) {
        sendCallError("forbidden_call_request", "Caller identity mismatch", callId);
        return;
      }

      if (toUserId === authenticatedUserId) {
        sendCallError("self_call_not_allowed", "You cannot call yourself", callId);
        return;
      }

      const chat = await ensureCallableChat({
        callerId: authenticatedUserId,
        calleeId: toUserId,
        chatId,
      });

      if (!chat) {
        sendCallError(
          "chat_not_authorized",
          "You can only call users you have a direct chat with",
          callId
        );
        return;
      }

      const activeCall = await Call.findOne({
        status: { $in: ["ringing", "connected"] },
        $or: [{ caller: toUserId }, { callee: toUserId }],
      }).select("callId");

      if (activeCall) {
        relayCallEvent("call:busy", authenticatedUserId, {
          callId,
          toUserId: authenticatedUserId,
          fromUserId: toUserId,
          reason: "active_call",
        });
        return;
      }

      const callerName = getUserDisplayName(authenticatedUser);
      const call = await Call.findOneAndUpdate(
        { callId },
        {
          callId,
          caller: authenticatedUserId,
          callee: toUserId,
          chat: chat._id,
          callType,
          status: "ringing",
          startedAt: new Date(),
          answeredAt: null,
          endedAt: null,
          endedBy: null,
          endReason: "",
          durationSeconds: 0,
          metadata: {
            initiatedVia: "socket",
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      if (!isUserOnline(toUserId)) {
        await updateCallState({
          call,
          status: "unreachable",
          endedAt: new Date(),
          endReason: "offline",
        });

        relayCallEvent("call:unreachable", authenticatedUserId, {
          callId,
          toUserId: authenticatedUserId,
          fromUserId: toUserId,
          reason: "offline",
          callType,
          chatId: chat._id.toString(),
        });
        return;
      }

      scheduleMissedCallTimeout(call, callerName);

      relayCallEvent("call:request", toUserId, {
        callId,
        toUserId,
        fromUserId: authenticatedUserId,
        fromName: callerName,
        callType,
        chatId: chat._id.toString(),
        sdp: payload?.sdp,
        sdpType: payload?.sdpType,
      });
    } catch (error) {
      console.error("call:request failed", error);
      sendCallError(
        "call_request_failed",
        "Unable to start call right now",
        safeString(payload?.callId)
      );
    }
  });

  socket.on("call:answer", async (payload) => {
    const call = await findAuthorizedCall(safeString(payload?.callId));
    if (!call) return;

    if (call.callee.toString() !== authenticatedUserId || call.status !== "ringing") {
      sendCallError("invalid_call_answer", "Call is no longer answerable", call.callId);
      return;
    }

    stopRingTimer(call.callId);
    await updateCallState({
      call,
      status: "connected",
      answeredAt: new Date(),
    });

    const toUserId = call.caller.toString();
    relayCallEvent("call:answer", toUserId, {
      callId: call.callId,
      toUserId,
      fromUserId: authenticatedUserId,
      sdp: payload?.sdp,
      sdpType: payload?.sdpType,
      chatId: call.chat?.toString() || "",
    });
  });

  socket.on("call:reject", async (payload) => {
    const call = await findAuthorizedCall(safeString(payload?.callId));
    if (!call) return;

    stopRingTimer(call.callId);
    await updateCallState({
      call,
      status: "rejected",
      endedAt: new Date(),
      endedBy: authenticatedUserId,
      endReason: "rejected",
    });

    const toUserId = getPeerUserId(call, authenticatedUserId);
    relayCallEvent("call:reject", toUserId, {
      callId: call.callId,
      toUserId,
      fromUserId: authenticatedUserId,
      reason: "rejected",
      chatId: call.chat?.toString() || "",
    });
  });

  socket.on("call:busy", async (payload) => {
    const call = await findAuthorizedCall(safeString(payload?.callId));
    if (!call) return;

    stopRingTimer(call.callId);
    await updateCallState({
      call,
      status: "busy",
      endedAt: new Date(),
      endedBy: authenticatedUserId,
      endReason: "busy",
    });

    const toUserId = getPeerUserId(call, authenticatedUserId);
    relayCallEvent("call:busy", toUserId, {
      callId: call.callId,
      toUserId,
      fromUserId: authenticatedUserId,
      reason: "busy",
      chatId: call.chat?.toString() || "",
    });
  });

  socket.on("call:ice", async (payload) => {
    const call = await findAuthorizedCall(safeString(payload?.callId));
    if (!call) return;

    const toUserId = getPeerUserId(call, authenticatedUserId);
    relayCallEvent("call:ice", toUserId, {
      callId: call.callId,
      toUserId,
      fromUserId: authenticatedUserId,
      candidate: payload?.candidate,
      chatId: call.chat?.toString() || "",
    });
  });

  socket.on("call:end", async (payload) => {
    const call = await findAuthorizedCall(safeString(payload?.callId));
    if (!call) return;

    stopRingTimer(call.callId);
    const status = call.status === "ringing" ? "canceled" : "ended";
    await updateCallState({
      call,
      status,
      endedAt: new Date(),
      endedBy: authenticatedUserId,
      endReason: status === "canceled" ? "caller_canceled" : "completed",
    });

    const toUserId = getPeerUserId(call, authenticatedUserId);
    relayCallEvent("call:end", toUserId, {
      callId: call.callId,
      toUserId,
      fromUserId: authenticatedUserId,
      reason: status === "canceled" ? "caller_canceled" : "completed",
      chatId: call.chat?.toString() || "",
    });
  });

  socket.on("call:signal", async (payload) => {
    const call = await findAuthorizedCall(safeString(payload?.callId));
    if (!call) return;

    const toUserId = getPeerUserId(call, authenticatedUserId);
    relayCallEvent("call:signal", toUserId, {
      ...payload,
      callId: call.callId,
      toUserId,
      fromUserId: authenticatedUserId,
      chatId: call.chat?.toString() || "",
    });
  });

  socket.on("disconnect", async () => {
    markSocketOffline(socket);
    if (!onlineUsers.has(authenticatedUserId)) {
      const activeCalls = await Call.find({
        status: { $in: ["ringing", "connected"] },
        $or: [{ caller: authenticatedUserId }, { callee: authenticatedUserId }],
      });

      for (const call of activeCalls) {
        stopRingTimer(call.callId);
        await updateCallState({
          call,
          status: call.status === "ringing" ? "failed" : "ended",
          endedAt: new Date(),
          endedBy: authenticatedUserId,
          endReason: "peer_disconnected",
        });

        const peerUserId = getPeerUserId(call, authenticatedUserId);
        relayCallEvent("call:end", peerUserId, {
          callId: call.callId,
          toUserId: peerUserId,
          fromUserId: authenticatedUserId,
          reason: "peer_disconnected",
          chatId: call.chat?.toString() || "",
        });
      }
    }
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    if (!process.env.MONGO_DB_URL) throw new Error("MONGO_DB_URL is required");
    await mongoose.connect(process.env.MONGO_DB_URL);
    console.log("MongoDB connected");
    server.listen(PORT, process.env.HOST || "0.0.0.0", () => console.log(`Server is running on port ${PORT}`));
  } catch (err) {
    console.error("Server startup failed:", err.message);
    process.exit(1);
  }
};

startServer();
