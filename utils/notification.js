import { Notification } from "../model/notification.model.js";
import { User } from "../model/user.model.js";
import { getIO, getNotificationRoom } from "./socket.js";

const normalizeIds = (ids = []) => {
  const seen = new Set();

  return ids
    .filter(Boolean)
    .map((id) => id.toString())
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

const emitSafely = (room, event, payload) => {
  try {
    const io = getIO();
    io.to(room).emit(event, payload);
  } catch (error) {
    console.warn(`Socket emit failed for ${event}:`, error.message);
  }
};

export const getUserDisplayName = (user) => {
  if (!user) return "Someone";

  if (typeof user === "string") return user;

  return (
    user.storeName ||
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "Someone"
  );
};

export const emitNotificationUnreadCount = async (userId) => {
  const unreadCount = await Notification.countDocuments({
    user: userId,
    isRead: false,
  });

  emitSafely(getNotificationRoom(userId), "notification:unread_count", {
    userId: userId.toString(),
    unreadCount,
  });

  return unreadCount;
};

export const emitNotificationCreated = async (notification) => {
  const payload = notification.toObject ? notification.toObject() : notification;

  emitSafely(
    getNotificationRoom(payload.user),
    "notification:new",
    payload,
  );

  await emitNotificationUnreadCount(payload.user);
};

export const emitNotificationRead = async (notification) => {
  emitSafely(
    getNotificationRoom(notification.user),
    "notification:read",
    {
      notificationId: notification._id.toString(),
      readAt: notification.readAt,
    },
  );

  await emitNotificationUnreadCount(notification.user);
};

export const emitNotificationAllRead = async (userId) => {
  emitSafely(getNotificationRoom(userId), "notification:all_read", {
    userId: userId.toString(),
  });

  await emitNotificationUnreadCount(userId);
};

export const createNotification = async ({
  user,
  userIds = [],
  title,
  message,
  type = "system",
  actor = null,
  product = null,
  order = null,
  chat = null,
  shop = null,
  service = null,
  subscription = null,
  payment = null,
  contactUs = null,
  metadata = {},
}) => {
  const recipients = normalizeIds([
    ...(user ? [user] : []),
    ...userIds,
  ]);

  if (!recipients.length) return [];

  const notifications = await Notification.insertMany(
    recipients.map((recipient) => ({
      user: recipient,
      title,
      message,
      type,
      actor,
      product,
      order,
      chat,
      shop,
      service,
      subscription,
      payment,
      contactUs,
      metadata,
    })),
  );

  await Promise.all(notifications.map((notification) => emitNotificationCreated(notification)));

  return notifications;
};

export const notifyAdmins = async (payload) => {
  const admins = await User.find({ role: "admin" }).select("_id");

  return createNotification({
    ...payload,
    userIds: admins.map((admin) => admin._id),
  });
};
