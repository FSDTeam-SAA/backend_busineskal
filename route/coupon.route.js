import express from "express";

import {
  createCoupon,
  deleteCoupon,
  getCoupons,
  updateCoupon,
  validateCoupon,
} from "../controller/coupon.router.js";

import { protect } from "../middleware/auth.middleware.js";
const router = express.Router();

router.post("/create", protect, createCoupon);
router.get("/", protect, getCoupons);
router.put("/:id", protect, updateCoupon);
router.delete("/:id", protect, deleteCoupon);
router.post("/validate", protect, validateCoupon);

export default router;
