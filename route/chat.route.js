import express from "express";
import {
  createChat,
  sendMessage,
  sendProductInquiry,
  updateMessage,
  deleteMessage,
  getChatForUser,
  getSingleChat,
  getMySellersFromOrders,
  getMyCustomersFromOrders,
  sendMessageToAllSellers,
  markChatMessagesAsRead,
  markSellerFlag,
  deleteChat,
  blockUser,
  unblockUser,
  saveChat,
  unsaveChat,
  getSavedChats,
} from "../controller/chat.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getChatForUser);
router.get("/saved", getSavedChats);
router.get("/my-sellers", getMySellersFromOrders);
router.get("/my-customers", getMyCustomersFromOrders);

router.post("/", createChat);
router.post("/message", upload.array("files", 10), sendMessage);
router.post(
  "/inquiry",
  upload.fields([
    { name: "files", maxCount: 10 },
    { name: "attachments", maxCount: 10 },
    { name: "screenshots", maxCount: 10 },
  ]),
  sendProductInquiry,
);
router.post("/broadcast/sellers", isAdmin, sendMessageToAllSellers);
router.patch("/:chatId/read", markChatMessagesAsRead);
router.patch("/:chatId/seller-flag", markSellerFlag);
router.get("/:chatId", getSingleChat);
router.patch("/message", updateMessage);
router.delete("/message", deleteMessage);

router.patch("/:chatId/delete", deleteChat);
router.patch("/:chatId/save", saveChat);
router.patch("/:chatId/unsave", unsaveChat);
router.patch("/block/:userId", blockUser);
router.patch("/unblock/:userId", unblockUser);

export default router;
