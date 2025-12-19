import express from "express";
import {
  addToCart,
  getCart,
  updateCart,
  clearCart,
} from "../controller/cart.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/add", protect, addToCart);
router.get("/", protect, getCart);
router.put("/update", protect, updateCart);
router.delete("/clear", protect, clearCart);

export default router;
