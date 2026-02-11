import express from "express";
import {
  getMyShop,
  updateMyShop,
} from "../controller/shop.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/my", getMyShop);
router.put(
  "/my",
  upload.fields([
    { name: "banner", maxCount: 1 },
    { name: "certificate", maxCount: 1 },
  ]),
  updateMyShop,
);

export default router;
