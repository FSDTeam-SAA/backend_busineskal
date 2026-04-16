import express from "express";
import {
  createText,
  getAllText,
  getSingleText,
  updateText,
  deleteText,
} from "../controller/text.controller.js";
import { protect } from "../middleware/auth.middleware.js";


const router = express.Router();

router.use(protect);

router.post("/", createText);
router.get("/", getAllText);
router.get("/:id", getSingleText);
router.patch("/:id", updateText);
router.delete("/:id", deleteText);

export default router;