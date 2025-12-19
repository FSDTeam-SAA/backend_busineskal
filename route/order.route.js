import express from "express";
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
} from "../controller/order.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createOrder);
router.get("/", protect, getOrders);
router.get("/:orderId", protect, getOrderById);
router.patch("/:orderId/status", protect, updateOrderStatus);

export default router;
