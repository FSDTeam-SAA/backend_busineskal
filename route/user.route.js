import express from "express";
import {
  changePassword,
  getProfile,
  updateProfile,
  deleteSeller,
  getAllSellers,
  getPendingSellers,
  updateSellersStatus,
} from "../controller/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
const router = express.Router();

router.get("/profile", protect, getProfile);
router.put("/profile", protect, upload.single("avatar"), updateProfile);
router.put("/password", protect, changePassword);

router.get("/sellers", protect, getAllSellers);
router.get("/sellers/pending", protect, getPendingSellers);
router.patch("/sellers/:userId/status", protect, updateSellersStatus);
router.delete("/sellers/:userId", protect, deleteSeller);

export default router;
