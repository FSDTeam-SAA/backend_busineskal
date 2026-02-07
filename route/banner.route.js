import express from "express";
import {
  createBanner,
  deleteBanner,
  getBanners,
} from "../controller/banner.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.post("/create", protect, upload.single("image"), createBanner);
router.get("/", protect, getBanners);
router.delete("/:id", protect, deleteBanner);

export default router;
