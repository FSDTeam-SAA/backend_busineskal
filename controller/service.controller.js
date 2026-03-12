import mongoose from "mongoose";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js"; // adjust path if needed
import { Service } from "../model/service.model.js";

export const createService = catchAsync(async (req, res) => {
  const { title, description, country, category, rating, totalReviews, verified } =
    req.body;

  const payload = {
    title,
    description,
    country,
    category,
    rating: rating ? Number(rating) : 0,
    totalReviews: totalReviews ? Number(totalReviews) : 0,
    verified: verified === "true" || verified === true,
    vendor: req.user._id,
  };

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    payload.images = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  const result = await Service.create(payload);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Service created successfully",
    data: result,
  });
});

export const getAllServices = catchAsync(async (req, res) => {
  const {
    search,
    country,
    category,
    vendor,
    page = 1,
    limit = 10,
  } = req.query;

  const filter = {};

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  if (country && country !== "Global") {
    filter.country = { $regex: `^${country}$`, $options: "i" };
  }

  if (category && mongoose.Types.ObjectId.isValid(category)) {
    filter.category = category;
  }

  if (vendor && mongoose.Types.ObjectId.isValid(vendor)) {
    filter.vendor = vendor;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [services, total] = await Promise.all([
    Service.find(filter)
      .populate("vendor", "fullName name email avatar")
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Service.countDocuments(filter),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Services fetched successfully",
    data: {
      services,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
});

export const getSingleService = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid service id");
  }

  const service = await Service.findById(id)
    .populate("vendor", "fullName name email avatar")
    .populate("category", "name");

  if (!service) {
    throw new AppError(httpStatus.NOT_FOUND, "Service not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service fetched successfully",
    data: service,
  });
});

export const updateService = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { title, description, country, category, rating, totalReviews, verified } =
    req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid service id");
  }

  const service = await Service.findById(id);

  if (!service) {
    throw new AppError(httpStatus.NOT_FOUND, "Service not found");
  }

  if (title) service.title = title;
  if (description) service.description = description;
  if (country) service.country = country;
  if (category) service.category = category;
  if (rating !== undefined) service.rating = Number(rating);
  if (totalReviews !== undefined) service.totalReviews = Number(totalReviews);
  if (verified !== undefined) {
    service.verified = verified === "true" || verified === true;
  }

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    service.images = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  await service.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service updated successfully",
    data: service,
  });
});

export const deleteService = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid service id");
  }

  const service = await Service.findById(id);

  if (!service) {
    throw new AppError(httpStatus.NOT_FOUND, "Service not found");
  }

  await Service.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Service deleted successfully",
    data: null,
  });
});

export const getPopularServices = catchAsync(async (req, res) => {
  const { limit = 6 } = req.query;

  const services = await Service.find({})
    .populate("vendor", "fullName name email avatar")
    .populate("category", "name")
    .sort({ rating: -1, totalReviews: -1 })
    .limit(Number(limit));

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Popular services fetched successfully",
    data: services,
  });
});