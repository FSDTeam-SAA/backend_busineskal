import express from "express";
import {
  addReview,
  updateMyReview,
  deleteMyReview,
  getProductReviews,
  getMyReviews,
} from "../controller/review.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

// user actions
router.post("/", addReview);
router.get("/me", getMyReviews);
router.patch("/:productId", updateMyReview);
router.delete("/:productId", deleteMyReview);

// product views
router.get("/product/:productId", getProductReviews);

export default router;
