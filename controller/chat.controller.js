import AppError from "../errors/AppError.js";
import { Chat } from "../model/chat.model.js";
// import { Farm } from "../model/farm.model.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { User } from "../model/user.model.js";
// import { io } from "../server.js";

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
  const chat = await Chat.findById(chatId);
  if (!chat) {
    throw new AppError(404, "Chat not found");
  }
  if (
    chat.user.toString() !== req.user._id.toString() &&
    chat?.seller?.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      401,
      "You are not authorized to send message in this chat"
    );
  }
  const messages = {
    text: message,
    askPrice: askPrice,
    productId: productId,
    user: req.user._id,
    date: new Date(),
    read: false,
  };
  chat.messages.push(messages);
  await chat.save();

  const chat12 = await Chat.findOne({ _id: chatId })
    .select({ messages: { $slice: -1 } }) // Only include last message
    .populate("messages.user", "name role avatar"); // Populate sender of last message

  // if (chat12.messages[0]) {
  //     io.to(`chat_${chatId}`).emit("newMassage", chat12.messages[0]);
  // }

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
  // io.to(`chat_${chatId}`).emit("newMassage", message);
  await chat.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Message updated successfully",
    data: message,
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
  const chat = await Chat.find({ $or: [{ user: user }, { seller: user }] })
    .select({ messages: { $slice: -1 } }) // Only include last message
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
    })
    .sort({ updatedAt: -1 }); // Sort by last updated time
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Chat retrieved successfully",
    success: true,
    data: chat,
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
  const chat = await Chat.findById(chatId)
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
  if (!chat) throw new AppError(404, "Chat not found");
  sendResponse(res, {
    statusCode: httpStatus.OK,
    message: "Chat retrieved successfully",
    success: true,
    data: chat,
  });
});
