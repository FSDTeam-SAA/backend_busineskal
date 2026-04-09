import express from "express";
import {
  addProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  updateProductVerification,
  getPendingProducts,
  getMyProducts,
  searchProduct
} from "../controller/product.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
const router = express.Router();

router.post("/add",protect,upload.fields([
    { name: "photos", maxCount: 10 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  addProduct,
);

router.get("/my", protect, getMyProducts);

router.get("/pending", protect, getPendingProducts);
router.patch("/:productId/verify", protect, updateProductVerification);

router.get("/", protect, getProducts);
router.get("/:id", protect, getProductById);
router.put(
  "/:id",
  protect,
  upload.fields([
    { name: "photos", maxCount: 10 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  updateProduct,
);
router.delete("/:id", protect, deleteProduct);

router.post(
  "/search",
  // protect, // optional: keep public or protected based on your need
  upload.fields([
    { name: "voice", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  searchProduct,
);

export default router;
