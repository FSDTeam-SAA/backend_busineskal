import express from "express";
import {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
} from "../controller/wishlist.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/add", protect, addToWishlist);
router.get("/", protect, getWishlist);
router.delete("/:productId", protect, removeFromWishlist);

export default router;
