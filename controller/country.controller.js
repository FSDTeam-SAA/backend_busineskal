import mongoose from "mongoose";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import {
  deleteFromCloudinary,
  extractPublicIdFromCloudinaryUrl,
  uploadOnCloudinary,
} from "../utils/commonMethod.js";
import { Country } from "../model/country.model.js";

const getPageNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getFlagAsset = (upload) => ({
  public_id: upload?.public_id || "",
  url: upload?.secure_url || "",
});

const ensureValidId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid country id");
  }
};

export const getCountries = catchAsync(async (req, res) => {
  const page = getPageNumber(req.query.page, 1);
  const limit = Math.min(getPageNumber(req.query.limit, 10), 50);
  const search = req.query.search?.toString().trim();
  const filter = {};

  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  const [countries, total] = await Promise.all([
    Country.find(filter)
      .sort({ createdAt: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Country.countDocuments(filter),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Countries fetched successfully",
    data: {
      countries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    },
  });
});

export const createCountry = catchAsync(async (req, res) => {
  const name = req.body.name?.toString().trim();

  if (!name) {
    throw new AppError(httpStatus.BAD_REQUEST, "Country name is required");
  }

  if (!req.file) {
    throw new AppError(httpStatus.BAD_REQUEST, "Flag image is required");
  }

  const existingCountry = await Country.findOne({
    normalizedName: name.toLowerCase(),
  });

  if (existingCountry) {
    throw new AppError(httpStatus.CONFLICT, "Country already exists");
  }

  const upload = await uploadOnCloudinary(req.file.buffer, {
    folder: "busineskal/countries",
  });

  const country = await Country.create({
    name,
    flag: getFlagAsset(upload),
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Country created successfully",
    data: country,
  });
});

export const updateCountry = catchAsync(async (req, res) => {
  const { id } = req.params;
  const name = req.body.name?.toString().trim();

  ensureValidId(id);

  const country = await Country.findById(id);
  if (!country) {
    throw new AppError(httpStatus.NOT_FOUND, "Country not found");
  }

  if (!name && !req.file) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Country name or flag image is required",
    );
  }

  if (name && name.toLowerCase() !== country.name.toLowerCase()) {
    const existingCountry = await Country.findOne({
      normalizedName: name.toLowerCase(),
      _id: { $ne: country._id },
    });

    if (existingCountry) {
      throw new AppError(httpStatus.CONFLICT, "Country already exists");
    }

    country.name = name;
  }

  let previousFlagPublicId = "";
  if (req.file) {
    previousFlagPublicId =
      country.flag?.public_id ||
      extractPublicIdFromCloudinaryUrl(country.flag?.url || "");

    const upload = await uploadOnCloudinary(req.file.buffer, {
      folder: "busineskal/countries",
    });

    country.flag = getFlagAsset(upload);
  }

  await country.save();

  if (previousFlagPublicId) {
    await deleteFromCloudinary(previousFlagPublicId).catch((error) => {
      console.error("Failed to delete previous country flag:", error);
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Country updated successfully",
    data: country,
  });
});

export const deleteCountry = catchAsync(async (req, res) => {
  const { id } = req.params;

  ensureValidId(id);

  const country = await Country.findById(id);
  if (!country) {
    throw new AppError(httpStatus.NOT_FOUND, "Country not found");
  }

  const flagPublicId =
    country.flag?.public_id ||
    extractPublicIdFromCloudinaryUrl(country.flag?.url || "");

  await country.deleteOne();

  if (flagPublicId) {
    await deleteFromCloudinary(flagPublicId).catch((error) => {
      console.error("Failed to delete country flag:", error);
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Country deleted successfully",
    data: null,
  });
});
