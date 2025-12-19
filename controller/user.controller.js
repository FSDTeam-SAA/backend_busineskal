import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -verificationInfo -password_reset_token"
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
