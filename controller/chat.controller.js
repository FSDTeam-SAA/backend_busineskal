import AppError from "../errors/AppError.js";
import { Chat } from "../model/chat.model.js";
// import { Farm } from "../model/farm.model.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { User } from "../model/user.model.js";
import { Order } from "../model/order.model.js";
import { getIO } from "../utils/socket.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { Shop } from "../model/shop.model.js";
import { createNotification, getUserDisplayName } from "../utils/notification.js";

const toBoolean = (value) => value === true || value === "true";
const buildAuthorizedChatQuery = (chatId, userId) => ({
  _id: chatId,
  $or: [{ user: userId }, { seller: userId }],
});

const deriveMessageType = (attachments = []) => {
  if (!attachments.length) return "text";

  const allImage = attachments.every((file) =>
    (file?.mimeType || "").startsWith("image/"),
  );
  if (allImage) return "image";

  const allVideo = attachments.every((file) =>
    (file?.mimeType || "").startsWith("video/"),
  );
  if (allVideo) return "video";

  const allAudio = attachments.every((file) =>
    (file?.mimeType || "").startsWith("audio/"),
  );
  if (allAudio) return "audio";

  return "file";
};

export const createChat = catchAsync(async (req, res) => {
  const { sellerId } = req.body;
  const farm = await User.findById(sellerId);
  if (!farm) {
    throw new AppError(404, "Seller not found");
  }
  let chat = await Chat.findOne({
    $or: [
      { seller: sellerId, user: req.user.id },
      { seller: req.user._id, user: sellerId },
    ],
  });
  if (!chat) {
    chat = await Chat.create({
      name: farm.name,
      seller: sellerId,
      user: req.user._id,
    });
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Chat created successfully",
    success: true,
    data: chat,
  });
});

export const sendMessage = catchAsync(async (req, res) => {
  const { chatId, message, askPrice, productId } = req.body;
  const text = message || req.body?.text || "";
  const askPriceFlag = toBoolean(askPrice);
  const currentUserId = req.user._id;
  const chat = await Chat.findOne(buildAuthorizedChatQuery(chatId, currentUserId));
  if (!chat) {
    const chatExists = await Chat.exists({ _id: chatId });
    if (!chatExists) {
      throw new AppError(404, "Chat not found");
    }
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to send message in this chat"
    );
  }
  const files = Array.isArray(req.files) ? req.files : [];
  const attachments = [];

  for (const file of files) {
    const upload = await uploadOnCloudinary(file.buffer, {
      resource_type: "auto",
      folder: "chat",
    });

    attachments.push({
      public_id: upload.public_id,
      url: upload.secure_url,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      resourceType: upload.resource_type,
    });
  }

  if (!text && attachments.length === 0 && !askPriceFlag && !productId) {
    throw new AppError(400, "Message or attachment is required");
  }

  const messages = {
    text: text,
    type: deriveMessageType(attachments),
    attachments,
    askPrice: askPriceFlag,
    productId: productId || undefined,
    user: req.user._id,
    date: new Date(),
    read: false,
  };
  chat.messages.push(messages);
  await chat.save();

  const chat12 = await Chat.findOne({ _id: chatId })
    .select({ messages: { $slice: -1 } }) // Only include last message
    .populate("messages.user", "name role avatar"); // Populate sender of last message

  if (chat12?.messages?.[0]) {
    const io = getIO();
    const payload = {
      chatId: chat._id,
      message: chat12.messages[0],
    };
    io.to(`chat_${chat.user.toString()}`).emit("newMassage", payload);
    io.to(`chat_${chat.seller.toString()}`).emit("newMassage", payload);
  }

  const recipientId =
    chat.user.toString() === currentUserId.toString() ? chat.seller : chat.user;
  const senderName = getUserDisplayName(req.user);
  const attachmentSummary =
    attachments.length > 1
      ? `${attachments.length} files`
      : attachments.length === 1
        ? "a file"
        : "";

  let notificationTitle = "New message";
  let notificationType = "chat_message";
  let notificationMessage = text
    ? `${senderName}: ${text.slice(0, 120)}`
    : attachmentSummary
      ? `${senderName} sent ${attachmentSummary}.`
      : `${senderName} sent you a message.`;

  if (askPriceFlag) {
    notificationTitle = "New price request";
    notificationType = "price_request";
    notificationMessage = `${senderName} requested a price${productId ? " for a product" : ""}.`;
  }


  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Message sent successfully",
    success: true,
    data: chat,
  });
});

export const updateMessage = catchAsync(async (req, res) => {
  const { chatId, messageId, newText } = req.body;

  const chat = await Chat.findById(chatId).populate(
    "messages.user",
    "name role avatar"
  );
  if (!chat) throw new AppError(404, "Chat not found");

  const message = chat.messages.id(messageId);
  if (!message) throw new AppError(404, "Message not found");

  // Optional: check if current user is the sender
  if (!message.user.equals(req.user._id)) {
    throw new AppError(403, "You can only edit your own messages");
  }

  message.text = newText;
  await chat.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Message updated successfully",
    data: message,
  });
});

export const markChatMessagesAsRead = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const currentUserId = req.user._id;

  const chat = await Chat.findOne(buildAuthorizedChatQuery(chatId, currentUserId));
  if (!chat) {
    const chatExists = await Chat.exists({ _id: chatId });
    if (!chatExists) {
      throw new AppError(404, "Chat not found");
    }
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to access this chat"
    );
  }

  let didChange = false;
  for (const message of chat.messages) {
    const senderId = message.user?.toString();
    if (senderId && senderId !== currentUserId.toString() && !message.read) {
      message.read = true;
      didChange = true;
    }
  }

  if (didChange) {
    await chat.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: didChange
      ? "Chat marked as read"
      : "Chat already marked as read",
    success: true,
    data: {
      read: true,
    },
  });
});

export const deleteMessage = catchAsync(async (req, res) => {
  const { chatId, messageId } = req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) throw new AppError(404, "Chat not found");

  const message = chat.messages.id(messageId);
  if (!message) throw new AppError(404, "Message not found");

  // Optional: check if current user is the sender
  if (!message.user.equals(req.user._id)) {
    throw new AppError(403, "You can only delete your own messages");
  }

  message.remove();
  await chat.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Message deleted successfully",
  });
});

export const getChatForUser = catchAsync(async (req, res) => {
  const user = req.user._id;
  const currentUserId = req.user._id.toString();
  const chat = await Chat.find({ $or: [{ user: user }, { seller: user }] })
    .populate({
      path: "seller",
      select: "name storeName avatar",
    })
    .populate({
      path: "user",
      select: "name avatar",
    })
    .populate({
      path: "messages.user",
      select: "name avatar",
    })
    .populate({
      path: "messages.productId",
      select: "name price images",
    })
    .sort({ updatedAt: -1 })
    .lean();
  const sellerIds = [
    ...new Set(
      chat
        .filter((chat) => chat.seller?._id)
        .map((chat) => chat.seller._id.toString())
    ),
  ];

  // Step 3: Fetch shops
  const shops = await Shop.find({
    owner: { $in: sellerIds },
  })
    .select("name owner")
    .lean();

  // Step 4: Create map
  const shopMap = {};
  shops.forEach((shop) => {
    shopMap[shop.owner.toString()] = shop.name;
  });

  // Step 5: Attach shopName to seller
  const updatedChats = chat.map((chat) => {
    const allMessages = Array.isArray(chat.messages) ? chat.messages : [];
    const unreadCount = allMessages.filter((message) => {
      const senderId =
        typeof message?.user === "object"
          ? message.user?._id?.toString()
          : message?.user?.toString();

      return senderId && senderId !== currentUserId && message?.read === false;
    }).length;

    if (chat.seller && shopMap[chat.seller._id.toString()]) {
      chat.seller.shopName = shopMap[chat.seller._id.toString()];
    } else {
      chat.seller.shopName = null;
    }

    chat.unreadCount = unreadCount;
    chat.messages =
      allMessages.length > 0 ? [allMessages[allMessages.length - 1]] : [];

    return chat;
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Chat retrieved successfully",
    success: true,
    data: updatedChats,
  });
});

const ensureChatsForSellers = async (userId, sellerIds) => {
  if (!sellerIds.length) return;

  const existingChats = await Chat.find({
    user: userId,
    seller: { $in: sellerIds },
  }).select("seller");

  const existingSellerIds = new Set(
    existingChats.map((chat) => chat.seller.toString())
  );

  const missingSellerIds = sellerIds.filter(
    (sellerId) => !existingSellerIds.has(sellerId.toString())
  );

  if (missingSellerIds.length === 0) return;

  const sellers = await User.find({ _id: { $in: missingSellerIds } }).select(
    "name storeName"
  );

  const newChats = sellers.map((seller) => ({
    name: seller.storeName || seller.name || "",
    seller: seller._id,
    user: userId,
  }));

  if (newChats.length > 0) {
    try {
      await Chat.insertMany(newChats, { ordered: false });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
};

const ensureChatsForCustomers = async (sellerId, customerIds) => {
  if (!customerIds.length) return;

  const existingChats = await Chat.find({
    seller: sellerId,
    user: { $in: customerIds },
  }).select("user");

  const existingCustomerIds = new Set(
    existingChats.map((chat) => chat.user.toString())
  );

  const missingCustomerIds = customerIds.filter(
    (customerId) => !existingCustomerIds.has(customerId.toString())
  );

  if (missingCustomerIds.length === 0) return;

  const customers = await User.find({
    _id: { $in: missingCustomerIds },
  }).select("name firstName lastName");

  const newChats = customers.map((customer) => {
    const displayName =
      customer.name ||
      [customer.firstName, customer.lastName].filter(Boolean).join(" ");

    return {
      name: displayName,
      seller: sellerId,
      user: customer._id,
    };
  });

  if (newChats.length > 0) {
    try {
      await Chat.insertMany(newChats, { ordered: false });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
};

export const getMySellersFromOrders = catchAsync(async (req, res) => {
  if (req.user.role !== "user") {
    throw new AppError(httpStatus.FORBIDDEN, "Only users can access this");
  }

  const sellerIds = await Order.distinct("vendor", {
    customer: req.user._id,
  });

  await ensureChatsForSellers(req.user._id, sellerIds);

  const chat = await Chat.find({
    user: req.user._id,
    seller: { $in: sellerIds },
  })
    .select({ messages: { $slice: -1 } })
    .populate({
      path: "seller",
      select: "name storeName avatar",
    })
    .populate({
      path: "user",
      select: "name avatar",
    })
    .populate({
      path: "messages.user",
      select: "name avatar",
    })
    .populate({
      path: "messages.productId",
      select: "name price images",
    })
    .sort({ updatedAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "My sellers retrieved successfully",
    success: true,
    data: chat,
  });
});

export const getMyCustomersFromOrders = catchAsync(async (req, res) => {
  if (req.user.role !== "seller") {
    throw new AppError(httpStatus.FORBIDDEN, "Only sellers can access this");
  }

  const customerIds = await Order.distinct("customer", {
    vendor: req.user._id,
  });

  await ensureChatsForCustomers(req.user._id, customerIds);

  const chat = await Chat.find({
    seller: req.user._id,
    user: { $in: customerIds },
  })
    .select({ messages: { $slice: -1 } })
    .populate({
      path: "seller",
      select: "name storeName avatar",
    })
    .populate({
      path: "user",
      select: "name avatar",
    })
    .populate({
      path: "messages.user",
      select: "name avatar",
    })
    .populate({
      path: "messages.productId",
      select: "name price images",
    })
    .sort({ updatedAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "My customers retrieved successfully",
    success: true,
    data: chat,
  });
});

export const sendMessageToAllSellers = catchAsync(async (req, res) => {
  const { message } = req.body;

  if (!message) {
    throw new AppError(httpStatus.BAD_REQUEST, "Message is required");
  }

  const sellers = await User.find({ role: "seller" }).select("_id");
  const io = getIO();

  sellers.forEach((seller) => {
    io.to(`chat_${seller._id.toString()}`).emit("sellerBroadcast", {
      message,
      sender: req.user._id,
      date: new Date(),
    });
  });


  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Message sent to all sellers",
    success: true,
    data: { count: sellers.length },
  });
});

// export const getChatForFarm = catchAsync(async (req, res) => {
//     const { farmId } = req.params
//     const chat = await Chat.find({ farm: farmId }).select({ messages: { $slice: -1 } }) // Only include last message
//         .populate("messages.user", "name role avatar") // Populate sender of last message
//         .sort({ updatedAt: -1 }); // Sort by last updated time
//     sendResponse(res, {
//         statusCode: httpStatus.OK,
//         message: "Chat retrieved successfully",
//         success: true,
//         data: chat
//     })
// })

export const getSingleChat = catchAsync(async (req, res) => {
  const { chatId } = req.params;
  const currentUserId = req.user._id;
  const chat = await Chat.findOne(buildAuthorizedChatQuery(chatId, currentUserId))
    .populate({
      path: "seller",
      select: "name avatar",
    })
    .populate({
      path: "user",
      select: "name avatar",
    })
    .populate({
      path: "messages.user",
      select: "name avatar",
    })
    .populate({
      path: "messages.productId",
      select: "name price images",
    });
  if (!chat) {
    const chatExists = await Chat.exists({ _id: chatId });
    if (!chatExists) {
      throw new AppError(404, "Chat not found");
    }
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not authorized to access this chat"
    );
  }

  let didChange = false;
  for (const message of chat.messages) {
    const senderId =
      typeof message.user === "object"
        ? message.user?._id?.toString()
        : message.user?.toString();

    if (senderId && senderId !== currentUserId.toString() && !message.read) {
      message.read = true;
      didChange = true;
    }
  }

  if (didChange) {
    await chat.save();
    await chat.populate({
      path: "messages.user",
      select: "name avatar",
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Chat retrieved successfully",
    success: true,
    data: chat,
  });
});
