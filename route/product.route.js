import express from "express";
import {
  addProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  verifyProduct,
} from "../controller/product.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
const router = express.Router();

router.post(
  "/add",
  protect,
  upload.fields([{ name: "photos", maxCount: 10 }]),
  addProduct
);

router.get("/", protect, getProducts);
router.get("/:id", protect, getProductById);
router.put(
  "/:id",
  protect,
  upload.fields([{ name: "photos", maxCount: 10 }]),
  updateProduct
);
router.delete("/:id", protect, deleteProduct);
router.patch("/:id/verify", protect, verifyProduct);

export default router;
