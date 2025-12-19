import express from "express";

import { protect } from "../middleware/auth.middleware.js";
import {
  approveVendor,
  becomeVendor,
  getVendorList,
  updateStock,
  getInventory,
  getVendorById,
} from "../controller/vendor.controller.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.post(
  "/become",
  protect,
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "license", maxCount: 1 },
  ]),
  becomeVendor
);

router.get("/", protect, getVendorList);
// static routes first to avoid param routes (/:userId) catching them
router.get("/inventory", protect, getInventory);
router.patch("/stock/:productId", protect, updateStock);

// param routes after static routes
router.get("/:userId", protect, getVendorById);
router.patch("/:userId/approve", protect, approveVendor);

export default router;
