import { ContactUs } from "../model/contactUs.model.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";

export const createContactUs = catchAsync(async (req, res) => {
  const { name, email, subject, message } = req.body;
  const contactUs = await ContactUs.create({
    name,
    email,
    subject,
    message,
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contact us created",
    data: contactUs,
  });
});

export const getAllContactUs = catchAsync(async (req, res) => {
  const contactUsList = await ContactUs.find().sort({ createdAt: -1 });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contact us fetched",
    data: contactUsList,
  });
});

export const getContactUsById = catchAsync(async (req, res) => {
  const contactUs = await ContactUs.findById(req.params.id);
  if (!contactUs)
    throw new AppError(httpStatus.NOT_FOUND, "Contact us not found");
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contact us fetched",
    data: contactUs,
  });
});

export const deleteContactUsById = catchAsync(async (req, res) => {
  const contactUs = await ContactUs.findByIdAndDelete(req.params.id);
  if (!contactUs)
    throw new AppError(httpStatus.NOT_FOUND, "Contact us not found");
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Contact us deleted",
    data: contactUs,
  });
});
