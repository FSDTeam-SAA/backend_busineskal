import express from "express";
import {
  createChat,
  sendMessage,
  updateMessage,
  deleteMessage,
  getChatForUser,
  getSingleChat,
  getMySellersFromOrders,
  getMyCustomersFromOrders,
  sendMessageToAllSellers,
} from "../controller/chat.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getChatForUser);
router.get("/my-sellers", getMySellersFromOrders);
router.get("/my-customers", getMyCustomersFromOrders);
router.get("/:chatId", getSingleChat);

router.post("/", createChat);
router.post("/message", upload.array("files", 10), sendMessage);
router.post("/broadcast/sellers", isAdmin, sendMessageToAllSellers);
router.patch("/message", updateMessage);
router.delete("/message", deleteMessage);

export default router;
