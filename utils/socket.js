import { Server } from "socket.io";
import { corsOptions } from "./corsOptions.js";

let io;

export const getChatRoom = (userId) => `chat_${userId}`;
export const getNotificationRoom = (userId) => `notifications_${userId}`;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: corsOptions,
  });
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};
