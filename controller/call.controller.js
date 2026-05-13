import httpStatus from "http-status";

import { Call } from "../model/call.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { getRtcConfigPayload } from "../utils/rtcConfig.js";

export const getRtcConfig = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "RTC config fetched successfully",
    data: getRtcConfigPayload(),
  });
});

export const getMyCallHistory = catchAsync(async (req, res) => {
  const calls = await Call.find({
    $or: [{ caller: req.user._id }, { callee: req.user._id }],
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit || 50), 100))
    .populate("caller", "name storeName avatar")
    .populate("callee", "name storeName avatar")
    .populate("chat", "name");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Call history fetched successfully",
    data: calls,
  });
});
