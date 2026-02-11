import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Shop } from "../model/shop.model.js";
import { Product } from "../model/product.model.js";

export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -verificationInfo -password_reset_token",
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched",
    data: user,
  });
});

export const updateProfile = catchAsync(async (req, res) => {
  const { name, phone, address, dob } = req.body;

  const user = await User.findById(req.user._id);

  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (address) user.address = address;
  if (dob) user.dob = dob;

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    user.avatar = { public_id: upload.public_id, url: upload.secure_url };
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Updated",
    data: user,
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword)
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords don't match");

  const user = await User.findById(req.user._id).select("+password");

  if (!(await User.isPasswordMatched(currentPassword, user.password))) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Current password wrong");
  }
  user.password = newPassword;

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed",
  });
});

export const getAllSellers = catchAsync(async (req, res) => {
  const managers = await User.find({ role: "seller" }).select(
    "-password -refreshToken",
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Managers fetched successfully",
    data: managers,
  });
});

export const getPendingSellers = catchAsync(async (req, res) => {
  const managers = await User.find({
    role: "seller",
    vendorStatus: "pending",
  }).select("-password -refreshToken");

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Pending seller requests fetched",
    data: managers,
  });
});

export const updateSellersStatus = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { status } = req.body; // approved | rejected

  if (!["approved", "rejected"].includes(status)) {
    return next(new AppError(400, "Invalid status value"));
  }

  const user = await User.findById(userId);
  if (!user) return next(new AppError(404, "User not found"));

  if (user.role !== "seller") {
    return next(new AppError(400, "User is not a seller"));
  }

  user.vendorStatus = status;

  const shop = await Shop.create({
    name: "",
    description: "",
    banner: "",
    certificate: "",
    address: "",
    owner: user._id,
    products: [],
  });

  user.shopId = shop._id;

  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `seller ${status} successfully`,
    data: {
      _id: user._id,
      managerStatus: user.vendorStatus,
    },
  });
});

export const deleteSeller = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return next(new AppError(404, "User not found"));

  if (user.role !== "seller") {
    return next(new AppError(400, "User is not a seller"));
  }

  const shop = await Shop.findById(user.shopId);
  if (shop) await shop.deleteOne();

  const products = await Product.find({ vendor: user._id });
  if (products) await Product.deleteMany({ vendor: user._id });

  await user.deleteOne();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Seller deleted successfully",
  });
});
