import httpStatus from "http-status";
import { Text } from "../model/text.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

export const createText = catchAsync(async (req, res) => {
  const { text1, text2, text3 } = req.body;

  if (!text1 || !text2 || !text3) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "text1, text2 and text3 are required"
    );
  }

  const normalizedData = {
    text1: text1.trim().toLowerCase(),
    text2: text2.trim().toLowerCase(),
    text3: text3.trim().toLowerCase(),
  };

  const existingText = await Text.findOne(normalizedData);

  if (existingText) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Same text combination already exists"
    );
  }

  const result = await Text.create(normalizedData);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Text created successfully",
    data: result,
  });
});

export const getAllText = catchAsync(async (req, res) => {
  const result = await Text.find().sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Texts retrieved successfully",
    data: result,
  });
});

export const getSingleText = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await Text.findById(id);

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Text not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Text retrieved successfully",
    data: result,
  });
});

export const updateText = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { text1, text2, text3 } = req.body;

  if (!text1 || !text2 || !text3) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "text1, text2 and text3 are required"
    );
  }

  const normalizedData = {
    text1: text1.trim().toLowerCase(),
    text2: text2.trim().toLowerCase(),
    text3: text3.trim().toLowerCase(),
  };

  const existingText = await Text.findOne({
    ...normalizedData,
    _id: { $ne: id },
  });

  if (existingText) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Same text combination already exists"
    );
  }

  const result = await Text.findByIdAndUpdate(id, normalizedData, {
    new: true,
    runValidators: true,
  });

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Text not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Text updated successfully",
    data: result,
  });
});

export const deleteText = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await Text.findByIdAndDelete(id);

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Text not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Text deleted successfully",
    data: null,
  });
});