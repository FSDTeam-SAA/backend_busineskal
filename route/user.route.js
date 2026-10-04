import express from "express";
import {
  changePassword,
  getProfile,
  updateProfile,
  deleteSeller,
  getAllSellers,
  getPendingSellers,
  updateSellersStatus,
  getAllSuppliers,
  getSingleSupplier,
  becomeSeller,
} from "../controller/user.controller.js";

import { protect, isAdmin } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
const router = express.Router();

router.get("/profile", protect, getProfile);
router.post("/become-seller", protect, becomeSeller);
router.put("/profile", protect, upload.single("avatar"), updateProfile);
router.put("/password", protect, changePassword);

router.get("/sellers", protect, isAdmin, getAllSellers);
router.get("/sellers/pending", protect, isAdmin, getPendingSellers);
router.patch("/sellers/:userId/status", protect, isAdmin, updateSellersStatus);
router.delete("/sellers/:userId", protect, isAdmin, deleteSeller);

router.get("/", getAllSuppliers);
router.get("/:id", getSingleSupplier);

export default router;
