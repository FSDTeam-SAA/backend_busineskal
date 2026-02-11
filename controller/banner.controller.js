import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Banner } from "../model/banner.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

export const getBanners = catchAsync(async (req, res) => {
  const banners = await Banner.find();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Banners fetched",
    data: banners,
  });
});

export const createBanner = catchAsync(async (req, res) => {

  const bannerImage = {}
  if (req.file) {
    const banner = req.file.buffer;
    const upload = await uploadOnCloudinary(banner);

    bannerImage.public_id = upload.public_id;
    bannerImage.url = upload.secure_url;
    };

  const banner = await Banner.create({ banner: bannerImage });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Banner created",
    data: banner,
  });
});

export const deleteBanner = catchAsync(async (req, res) => {
  const bannerId = req.params.bannerId || req.params.id;
  const banner = await Banner.findById(bannerId);
  if (!banner) throw new AppError(httpStatus.NOT_FOUND, "Banner not found");
  await banner.remove();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Banner deleted",
  });
});
