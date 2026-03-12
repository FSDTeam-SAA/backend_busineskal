import express from "express";
import {
  createService,
  getAllServices,
  getSingleService,
  updateService,
  deleteService,
  getPopularServices,
} from "../controller/service.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

/* Public routes */
router.get("/", getAllServices);
router.get("/popular", getPopularServices);
router.get("/:id", getSingleService);

/* Protected routes */
router.post("/", protect, upload.single("image"), createService);
router.put("/:id", protect, upload.single("image"), updateService);
router.delete("/:id", protect, deleteService);

export default router;