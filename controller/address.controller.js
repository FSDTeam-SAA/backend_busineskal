import httpStatus from "http-status";
import { Address } from "../model/address.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

export const addAddress = catchAsync(async (req, res) => {
  const { street, city, state, postalCode, country, phone, name, isDefault } =
    req.body;
  const user = req.user._id;

  const address = await Address.create({
    user,
    street,
    city,
    state,
    postalCode,
    country,
    phone,
    name,
    isDefault,
  });

  // Set as default if flagged
  if (isDefault) {
    await Address.updateMany({ user }, { isDefault: false });
    address.isDefault = true;
    await address.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Address added",
    data: address,
  });
});

export const getAddresses = catchAsync(async (req, res) => {
  const addresses = await Address.find({ user: req.user._id });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Addresses fetched",
    data: addresses,
  });
});

export const updateAddress = catchAsync(async (req, res) => {
  const updates = req.body;
  const address = await Address.findByIdAndUpdate(req.params.id, updates, {
    new: true,
  });

  if (!address || address.user.toString() !== req.user._id.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, "Address not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Address updated",
    data: address,
  });
});

export const deleteAddress = catchAsync(async (req, res) => {
  const address = await Address.findByIdAndDelete(req.params.id);

  if (!address || address.user.toString() !== req.user._id.toString()) {
    throw new AppError(httpStatus.NOT_FOUND, "Address not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Address deleted",
    data: address,
  });
});
