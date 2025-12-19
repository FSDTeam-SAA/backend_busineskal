import express from "express";
import {
  createPayment,
  confirmPayment,
} from "../controller/payment.controller.js";

const router = express.Router();

// Create Payment
router.post("/create-payment", createPayment);

// Capture Payment
router.post("/confirm-payment", confirmPayment);

export default router;
