import httpStatus from "http-status";
import mongoose from "mongoose";
import { Wishlist } from "../model/wishlist.model.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

export const toggleWishlist = catchAsync(async (req, res) => {
  const user = req.user._id;
  const { productId } = req.body;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Valid productId is required",
      data: null,
    });
  }

  let wishlist = await Wishlist.findOne({ user });
  if (!wishlist) wishlist = await Wishlist.create({ user, products: [] });

  const alreadyLoved = wishlist.products.some(
    (id) => id.toString() === productId.toString()
  );

  if (alreadyLoved) {
    wishlist.products.pull(productId);
  } else {
    wishlist.products.push(productId);
  }

  await wishlist.save();

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: alreadyLoved ? "Removed from wishlist" : "Added to wishlist",
    data: {
      loved: !alreadyLoved,
      productsCount: wishlist.products.length,
      wishlist,
    },
  });
});

export const getWishlist = catchAsync(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id }).populate(
    "products",
    "title price photos rating thumbnail"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Wishlist fetched",
    data: wishlist || { products: [] },
  });
});

export const removeFromWishlist = catchAsync(async (req, res) => {
  const { productId } = req.params;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: "Valid productId is required",
      data: null,
    });
  }

  const wishlist = await Wishlist.findOneAndUpdate(
    { user: req.user._id },
    { $pull: { products: productId } },
    { new: true, upsert: true }
  ).populate("products", "title price photos rating thumbnail");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Removed from wishlist",
    data: wishlist || { products: [] },
  });
});
