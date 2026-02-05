import express from "express";
import {
  changePassword,
  getAllManagers,
  getPendingManagers,
  getProfile,
  updateManagerStatus,
  updateProfile,
} from "../controller/user.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
const router = express.Router();

router.get("/profile", protect, getProfile);
router.put("/profile", protect, upload.single("avatar"), updateProfile);
router.put("/password", protect, changePassword);

router.get("/managers", protect, getAllManagers);
router.get("/managers/pending", protect, getPendingManagers);
router.patch("/managers/:userId/status", protect, updateManagerStatus);

export default router;
