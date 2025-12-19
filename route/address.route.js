import express from "express";

import {
  addAddress,
  deleteAddress,
  getAddresses,
  updateAddress,
} from "../controller/address.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/add", protect, addAddress);
router.get("/", protect, getAddresses);
router.put("/:id", protect, updateAddress);
router.delete("/:id", protect, deleteAddress);

export default router;
