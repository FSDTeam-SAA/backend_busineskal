import express from "express";
import {
  createText,
  getAllText,
  getSingleText,
  updateText,
  deleteText,
} from "../controller/text.controller.js";



const router = express.Router();



router.post("/", createText);
router.get("/", getAllText);
router.get("/:id", getSingleText);
router.patch("/:id", updateText);
router.delete("/:id", deleteText);

export default router;