import httpStatus from "http-status";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Shop } from "../model/shop.model.js";

const applyShopUpdates = async (shop, req) => {
  const { name, description, address } = req.body;

  if (name) shop.name = name;
  if (description) shop.description = description;
  if (address) shop.address = address;

  const banner = {};
  const certificate = {};

  if (req.files?.banner?.[0]) {
    const { public_id, secure_url, url } = await uploadOnCloudinary(
      req.files.banner[0].buffer,
    );
    banner.public_id = public_id;
    banner.url = secure_url || url;
  }

  if (req.files?.certificate?.[0]) {
    const { public_id, secure_url, url } = await uploadOnCloudinary(
      req.files.certificate[0].buffer,
    );
    certificate.public_id = public_id;
    certificate.url = secure_url || url;
  }

  if (Object.keys(banner).length > 0) shop.banner = banner;
  if (Object.keys(certificate).length > 0) shop.certificate = certificate;
};

export const getShops = catchAsync(async (req, res) => {
  const shops = await Shop.find();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shops fetched",
    data: shops,
  });
});

export const getShopById = catchAsync(async (req, res) => {
  const shop = await Shop.findById(req.params.id);
  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop fetched",
    data: shop,
  });
});

export const updateShop = catchAsync(async (req, res) => {
  const shopId = req.params.id;

  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");

  if (
    req.user.role === "seller" &&
    shop.owner.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot update other vendor's shop",
    );
  }
  await applyShopUpdates(shop, req);

  await shop.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop updated",
    data: shop,
  });
});

export const getMyShop = catchAsync(async (req, res) => {
  const shopId = req.user.shopId;
  const shop = shopId
    ? await Shop.findById(shopId)
    : await Shop.findOne({ owner: req.user._id });

  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My shop fetched",
    data: shop,
  });
});

export const updateMyShop = catchAsync(async (req, res) => {
  const shopId = req.user.shopId;
  const shop = shopId
    ? await Shop.findById(shopId)
    : await Shop.findOne({ owner: req.user._id });

  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");

  if (
    req.user.role === "seller" &&
    shop.owner.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot update other vendor's shop",
    );
  }

  await applyShopUpdates(shop, req);
  await shop.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop updated",
    data: shop,
  });
});

export const pendingShops = catchAsync(async (req, res) => {
  const shops = await Shop.find({ shopStatus: "not verified" });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shops fetched",
    data: shops,
  });
});

export const updateShopStatus = catchAsync(async (req, res) => {
  const { shopId } = req.params;
  const { status } = req.body; // verified / not verified

  if (!["verified", "not verified"].includes(status)) {
    return next(new AppError(400, "Invalid status value"));
  }

  const shop = await Shop.findById(shopId);
  if (!shop) return next(new AppError(404, "Shop not found"));

  shop.shopStatus = status;

  await shop.save();

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
