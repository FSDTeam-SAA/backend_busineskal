import express from "express";

import { getMyCallHistory, getRtcConfig } from "../controller/call.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/config", getRtcConfig);
router.get("/history", getMyCallHistory);

export default router;
