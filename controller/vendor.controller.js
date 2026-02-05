import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Product } from "../model/product.model.js";

export const becomeVendor = catchAsync(async (req, res) => {
  const {
    storeName,
    description,
    phone,
    address,
    city,
    postalCode,
    country,
    taxId,
    passport,
    idCard,
  } = req.body;

  const userId = req.user._id;

  const user = await User.findById(userId);

  // Upload files
  let storeLogo = user.avatar; // Existing
  if (req.files?.logo) {
    const upload = await uploadOnCloudinary(req.files.logo[0].buffer);
    storeLogo = { public_id: upload.public_id, url: upload.secure_url };
  }

  // validate if already a vendor
  if (user.role === "seller" && user.vendorStatus === "approved") {
    throw new AppError(httpStatus.BAD_REQUEST, "User is already a vendor");
  }

  let tradeLicense = {};
  if (req.files?.license) {
    const upload = await uploadOnCloudinary(req.files.license[0].buffer);
    tradeLicense = { public_id: upload.public_id, url: upload.secure_url };
  }

  user.role = "seller";
  user.storeName = storeName;
  user.storeDescription = description;
  user.storeLogo = storeLogo;
  user.tradeLicense = tradeLicense;
  user.idCard = idCard;
  user.passport = passport;
  user.taxId = taxId;
  user.address = address;
  user.city = city;
  user.postalCode = postalCode;
  user.country = country;
  user.phone = phone;

  user.vendorStatus = "pending";

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendor application submitted",
    data: user,
  });
});

// Admin approve vendor (from vendor list)
export const approveVendor = catchAsync(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { role: "seller", vendorStatus: "approved" },
    { new: true },
  ).select("-password");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendor approved",
    data: user,
  });
});

export const getInventory = catchAsync(async (req, res) => {
  const inventory = await Product.find({ vendor: req.user._id })
    .select("title sku stock status")
    .sort({ stock: 1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Inventory fetched",
    data: inventory,
  });
});

export const updateStock = catchAsync(async (req, res) => {
  const { stock } = req.body;
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, vendor: req.user._id },
    { stock },
    { new: true },
  );

  if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stock updated",
    data: product,
  });
});

export const getVendorList = catchAsync(async (req, res) => {
  const vendors = await User.find({ role: "seller" }).select(
    "-password -refreshToken",
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendors fetched",
    data: vendors,
  });
});

export const getVendorById = catchAsync(async (req, res) => {
  const vendor = await User.findById(req.params.userId).select(
    "-password -refreshToken",
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Vendor fetched",
    data: vendor,
  });
});
