import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

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

export const getAllManagers = catchAsync(async (req, res) => {
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

export const getPendingManagers = catchAsync(async (req, res) => {
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

export const updateManagerStatus = catchAsync(async (req, res) => {
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
