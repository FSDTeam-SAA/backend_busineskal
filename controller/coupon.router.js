import httpStatus from "http-status";
import { Coupon } from "../model/coupon.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

export const createCoupon = catchAsync(async (req, res) => {
  const coupon = await Coupon.create(req.body);

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    coupon.image = { public_id: upload.public_id, url: upload.secure_url };
    await coupon.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Coupon created",
    data: coupon,
  });
});

export const getCoupons = catchAsync(async (req, res) => {
  const { status, code } = req.query;
  const query = {};
  if (status) query.status = status;
  if (code) query.code = code;

  const coupons = await Coupon.find(query).sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Coupons fetched",
    data: coupons,
  });
});

export const updateCoupon = catchAsync(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Coupon updated",
    data: coupon,
  });
});

export const deleteCoupon = catchAsync(async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Coupon deleted",
  });
});

// Apply coupon in order (call from order controller)
export const validateCoupon = catchAsync(async (req, res) => {
  const { code, totalAmount } = req.body;

  const coupon = await Coupon.findOne({ code, status: "active" });
  if (!coupon) throw new AppError(httpStatus.BAD_REQUEST, "Invalid coupon");

  const now = new Date();
  if (now < coupon.validityStart || now > coupon.validityEnd) {
    throw new AppError(httpStatus.BAD_REQUEST, "Coupon expired");
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError(httpStatus.BAD_REQUEST, "Coupon usage limit reached");
  }

  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = (totalAmount * coupon.discount) / 100;
  } else {
    discount = coupon.discount;
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Coupon valid",
    data: { discount, couponId: coupon._id },
  });
});
