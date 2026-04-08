import express from "express";
import upload from "../middleware/multer.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  searchProduct,
  searchSupplier,
  searchService,
  searchCategory,
  searchCountry,
  searchChat,
  searchCart,
} from "../controller/search.controller.js";

const router = express.Router();

const searchUpload = upload.fields([
  { name: "voice", maxCount: 1 },
  { name: "audio", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

router.post("/products", protect, searchUpload, searchProduct);
router.post("/suppliers", protect, searchUpload, searchSupplier);
router.post("/services", protect, searchUpload, searchService);
router.post("/categories", protect, searchUpload, searchCategory);
router.post("/countries", protect, searchUpload, searchCountry);
router.post("/chats", protect, searchUpload, searchChat);
router.post("/cart", protect, searchUpload, searchCart);

export default router;