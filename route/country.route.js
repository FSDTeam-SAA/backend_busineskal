import express from "express";
import {
  createCountry,
  deleteCountry,
  getCountries,
  updateCountry,
} from "../controller/country.controller.js";
import { isAdmin, protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.get("/", getCountries);
router.post("/", protect, isAdmin, upload.single("flag"), createCountry);
router.put("/:id", protect, isAdmin, upload.single("flag"), updateCountry);
router.delete("/:id", protect, isAdmin, deleteCountry);

export default router;
